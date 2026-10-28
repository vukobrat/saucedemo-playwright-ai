// Builds evals/triage/golden.json from real Playwright runs. Each run in evals/triage/config.json
// runs its specs in an isolated checkout of its state and records every unexpected failure the way
// the qa server hands a regression to the triage agent, with the label the run defines. The labels
// are proposals until a person has reviewed the file.
//
// Usage: npm run eval:triage:build      (no model calls; about ten minutes of Playwright runs)
// Needs: the test credentials (.env or exported variables) and installed browsers.
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { createCheckout, loadConfig, runPlaywright } from './checkout.mjs';

// The checkouts have no .env. Load it into this process, as src/config/env.ts would, so the test
// runs get the credentials without a copy of the file; exported variables still take precedence.
if (existsSync('.env')) process.loadEnvFile('.env');

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

// Mirrors cleanMessage in src/mcp/ci-report.ts, so a case reads exactly like a qa-server regression.
function cleanMessage(test, max = 500) {
  const failed = test.results?.find((r) => r.status && r.status !== 'passed' && r.error?.message);
  const text = (failed?.error?.message ?? '').replace(ANSI, '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function* walk(suites) {
  for (const suite of suites ?? []) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) yield { spec, test };
    }
    yield* walk(suite.suites);
  }
}

function knownBugOf(test) {
  const annotation = test.annotations?.find((a) => a.type === 'known-bug');
  const match = /^(SD-\d+|DJ-\d+): (.*)$/.exec(annotation?.description ?? '');
  return match ? { id: match[1], summary: match[2] } : undefined;
}

/** Unexpected failures without a known-bug marker: what the qa server reports as regressions. */
function regressions(report) {
  const found = [];
  for (const { spec, test } of walk(report.suites)) {
    if (test.status !== 'unexpected' || knownBugOf(test)) continue;
    found.push({
      test: spec.title,
      file: spec.file ?? '',
      line: spec.line ?? 0,
      project: test.projectName ?? '',
      message: cleanMessage(test),
    });
  }
  return found;
}

const config = loadConfig();
const withCheckout = (stateName, work) => {
  const checkout = createCheckout(stateName, config.states[stateName]);
  try {
    return work(checkout.dir);
  } finally {
    checkout.cleanup();
  }
};

// Which catalogued defect each known-bug test demonstrates, read from a run with markers in place.
const baseline = new Map();
withCheckout('baseline', (dir) => {
  const report = runPlaywright(dir, { name: 'baseline', specs: ['tests/e2e', 'tests/personas'] });
  for (const { spec, test } of walk(report.suites)) {
    const bug = knownBugOf(test);
    if (bug) baseline.set(`${spec.file}::${spec.title}`, bug);
  }
});
console.log(`baseline: ${String(baseline.size)} known-bug tests`);

const cases = [];
for (const run of config.runs) {
  const failures = withCheckout(run.state, (dir) => regressions(runPlaywright(dir, run)));
  const seenBugs = new Set();
  let kept = 0;
  for (const failure of failures) {
    if (run.maxCases && kept >= run.maxCases) break;
    let label = { category: run.label.category };
    let decidingFact = run.decidingFact;
    let id = `${run.name}-${String(kept + 1)}`;
    if (run.label.knownBugIdFrom === 'baseline') {
      const bug = baseline.get(`${failure.file}::${failure.test}`);
      if (!bug) {
        console.warn(
          `  ${run.name}: skipped, not a known-bug test: ${failure.file} ${failure.test}`,
        );
        continue;
      }
      if (run.onePerKnownBug && seenBugs.has(bug.id)) continue;
      seenBugs.add(bug.id);
      label = { ...label, knownBugId: bug.id };
      decidingFact = `Matches catalogued defect ${bug.id}: ${bug.summary}`;
      id = `${run.name}-${bug.id.toLowerCase()}`;
    }
    cases.push({ id, state: run.state, input: failure, label, decidingFact, source: run.name });
    kept += 1;
  }
  console.log(`${run.name}: ${String(failures.length)} failures, ${String(kept)} cases`);
}

const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
const golden = {
  description:
    'Golden set for the triage eval: real failures from the runs in config.json, each with its ' +
    'reviewed label. Inputs are shaped like the regressions the qa server reports.',
  builtFrom: commit,
  cases,
};
writeFileSync('evals/triage/golden.json', `${JSON.stringify(golden, null, 2)}\n`);
console.log(`wrote evals/triage/golden.json: ${String(cases.length)} cases from ${commit}`);
