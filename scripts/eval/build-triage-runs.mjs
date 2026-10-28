// Builds the saved reports of the whole-run triage eval (evals/triage/run-cases.json) and checks
// each case's labels against its report. A case from a real CI run downloads that run's JSON report
// artifact; GitHub keeps it for 14 days, so a saved one is kept, never rebuilt. A local case runs
// its specs in an isolated checkout of its state. Reports are trimmed to what triage reads. The
// labels are proposals until a person has reviewed the summary this prints.
//
// Usage: npm run eval:triage:runs:build [-- --only <case-id>]   (no model calls)
// Needs: gh signed in (CI cases), the test credentials (.env or exported) and browsers (local cases).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createCheckout, loadConfig, runPlaywright } from './checkout.mjs';
import { expectedKnownBugFailures, labelTests, loadRunCases, reportPath } from './run-cases.mjs';

// The checkouts have no .env; load it as src/config/env.ts would, exported variables first.
if (existsSync('.env')) process.loadEnvFile('.env');

const { values: options } = parseArgs({ options: { only: { type: 'string' } } });

/** Keeps what the qa server and a reader of the report use; drops steps, output and attachments. */
function trimSuite(suite) {
  return {
    title: suite.title,
    file: suite.file,
    ...(suite.specs?.length ? { specs: suite.specs.map(trimSpec) } : {}),
    ...(suite.suites?.length ? { suites: suite.suites.map(trimSuite) } : {}),
  };
}

function trimSpec(spec) {
  return {
    title: spec.title,
    file: spec.file,
    line: spec.line,
    tests: spec.tests.map((test) => ({
      projectName: test.projectName,
      expectedStatus: test.expectedStatus,
      status: test.status,
      ...(test.annotations?.length
        ? { annotations: test.annotations.map(({ type, description }) => ({ type, description })) }
        : {}),
      results: test.results.map((result) => ({
        status: result.status,
        ...(result.error?.message ? { error: { message: result.error.message } } : {}),
      })),
    })),
  };
}

function trim(report) {
  return {
    stats: report.stats,
    errors: (report.errors ?? []).map((error) => ({ message: error.message })),
    suites: report.suites.map(trimSuite),
  };
}

function downloadCiReport(runId) {
  const dir = mkdtempSync(path.join(tmpdir(), 'ci-report-'));
  try {
    execFileSync('gh', [
      'run',
      'download',
      String(runId),
      '--name',
      'playwright-report-json',
      '--dir',
      dir,
    ]);
    return JSON.parse(readFileSync(path.join(dir, 'report.json'), 'utf8'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runLocally(c, config) {
  const checkout = createCheckout(c.state, config.states[c.state]);
  try {
    return runPlaywright(checkout.dir, { name: c.id, ...c.source });
  } finally {
    checkout.cleanup();
  }
}

const config = loadConfig();
const cases = loadRunCases().cases.filter((c) => !options.only || c.id === options.only);
mkdirSync(path.dirname(reportPath(cases[0])), { recursive: true });

for (const c of cases) {
  const file = reportPath(c);
  if (c.source.ciRun && existsSync(file)) {
    console.log(`${c.id}: kept the saved report of CI run ${String(c.source.ciRun)}`);
  } else {
    const report = c.source.ciRun ? downloadCiReport(c.source.ciRun) : runLocally(c, config);
    const text = `${JSON.stringify(trim(report), null, 2)}\n`;
    // The repository is public: a machine's paths must not end up in a saved report.
    for (const local of [homedir(), tmpdir(), path.resolve(tmpdir())]) {
      if (text.includes(local)) throw new Error(`Case "${c.id}": the report contains ${local}`);
    }
    writeFileSync(file, text);
  }

  const report = JSON.parse(readFileSync(file, 'utf8'));
  const labelled = labelTests(c, report);
  const groups = c.groups.map((group, index) => {
    const tests = labelled.filter((t) => t.group === index);
    return `${group.category} x${String(tests.length)}`;
  });
  console.log(
    `${c.id}: ${String(labelled.length)} tests need action (${groups.join(', ') || 'none'}), ` +
      `${String(expectedKnownBugFailures(report))} expected known-bug failures`,
  );
  for (const test of labelled) {
    console.log(
      `  [${c.groups[test.group].category}] ${test.file}:${String(test.line)} ${test.title} (${test.outcome})`,
    );
  }
}
