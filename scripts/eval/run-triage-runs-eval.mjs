// Runs the nightly CI triage on every whole run in evals/triage/run-cases.json and grades its
// report: the verdict, and for every test that needs an owner action, whether the report lists it
// under the labelled category (and known-bug id). Each run is replayed with the production prompt
// and command line (scripts/lib/triage-run.mjs) in an isolated checkout of the code that produced
// it; the qa server reads the saved report instead of downloading it. Exits non-zero when the gate
// in run-cases.json fails.
//
// Usage: npm run eval:triage:runs [-- --repeat 3] [--only <case-id-prefix>] [--concurrency 3]
//          [--model <id>] [--instructions <file>]
//          [--simulate perfect|titles|green|test-bugs|counts]   (tests the grader, no model calls)
//        npm run eval:triage:check   (no model calls: every saved report still matches its labels)
// Needs: `claude` signed in. No browsers and no GitHub access: the reports are in the repository.
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { cell, runHeadless } from '../lib/claude-headless.mjs';
import {
  TRIAGE_MODEL,
  TRIAGE_REPORT_SCHEMA,
  triageRunArgs,
  triageRunPrompt,
} from '../lib/triage-run.mjs';
import { createCheckout, loadConfig } from './checkout.mjs';
import { pool } from './pool.mjs';
import {
  expectedKnownBugFailures,
  labelTests,
  loadRunCases,
  names,
  readReport,
  reportPath,
} from './run-cases.mjs';

const OUT_DIR = 'eval-output';
const PRODUCT_BUGS = new Set(['known-product-bug', 'new-product-bug']);

const { values: options } = parseArgs({
  options: {
    repeat: { type: 'string', default: '1' },
    only: { type: 'string' },
    concurrency: { type: 'string', default: '3' },
    check: { type: 'boolean', default: false },
    model: { type: 'string', default: TRIAGE_MODEL },
    instructions: { type: 'string' },
    // Replaces the agent with a scripted report, to prove the grader tells good and bad apart.
    simulate: { type: 'string' },
  },
});
const repeats = Number(options.repeat);

const config = loadConfig();
const { cases: allCases, gate } = loadRunCases();

if (options.check) {
  // A rebuilt report or an edited label can stop matching; catch it in the PR that caused it.
  for (const c of allCases) {
    if (!(c.state in config.states)) throw new Error(`Case "${c.id}" has an unknown state`);
    labelTests(c, readReport(c));
  }
  console.log(`${String(allCases.length)} whole-run cases match their saved reports`);
  process.exit(0);
}

const cases = allCases.filter((c) => !options.only || c.id.startsWith(options.only));
const instructions = options.instructions ? readFileSync(options.instructions, 'utf8') : undefined;

// The saved reports, under the run ids the replay asks about.
const reportsDir = mkdtempSync(path.join(tmpdir(), 'ci-reports-'));
for (const c of cases) copyFileSync(reportPath(c), path.join(reportsDir, `${c.runId}.json`));

// The replay must not reach the live repository, whose runs are not the saved ones: an empty gh
// config signs gh out, as in the CI job, which gives it no token.
const ghConfigDir = mkdtempSync(path.join(tmpdir(), 'gh-'));
const env = { ...process.env, GH_CONFIG_DIR: ghConfigDir, CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' };
delete env.GH_TOKEN;
delete env.GITHUB_TOKEN;

async function triage(c, dir) {
  const { qa } = JSON.parse(readFileSync(path.join(dir, '.mcp.json'), 'utf8')).mcpServers;
  return runHeadless({
    prompt: triageRunPrompt(c.runId),
    schemaFile: TRIAGE_REPORT_SCHEMA,
    cwd: dir,
    env,
    args: triageRunArgs({
      qaServer: { ...qa, args: [...qa.args, '--reports-dir', reportsDir] },
      model: options.model,
      instructions,
    }),
  });
}

/**
 * Scripted reports for testing the grader without model calls: the labels themselves (perfect),
 * the same with bare titles (titles), every run called green (green), every cause called a test
 * bug (test-bugs), or each cause summarized as a count instead of its tests (counts).
 */
function simulate(behaviour, c, labelled, report) {
  const failures = c.groups.map((group, index) => {
    const own = labelled.filter((t) => t.group === index);
    let tests = own.map((t) => `${t.file}:${String(t.line)} ${t.title}`);
    if (behaviour === 'titles') tests = own.map((t) => t.title);
    if (behaviour === 'counts') tests = [`${String(own.length)} tests`];
    return {
      tests,
      category: behaviour === 'test-bugs' ? 'test-bug' : group.category,
      ...(group.knownBugId ? { knownBugId: group.knownBugId } : {}),
      evidence: group.decidingFact,
      action: 'simulated',
    };
  });
  const green = behaviour === 'green';
  return {
    runId: c.runId,
    verdict: green ? 'green' : c.verdicts[0],
    summary: `Simulated: ${behaviour}.`,
    expectedKnownBugFailures: expectedKnownBugFailures(report),
    failures: green ? [] : failures,
  };
}

const describe = (failure) => [failure.category, failure.knownBugId].filter(Boolean).join(' ');

function grade(c, labelled, answer) {
  const critical = [];
  if (answer.verdict === 'green' && c.groups.length > 0) {
    critical.push('green verdict on a run that needs action');
  }
  const tests = labelled.map((test) => {
    const label = c.groups[test.group];
    const listedIn = answer.failures.filter((f) => f.tests.some((entry) => names(entry, test)));
    const right =
      listedIn.length > 0 &&
      listedIn.every(
        (f) =>
          f.category === label.category && (!label.knownBugId || f.knownBugId === label.knownBugId),
      );
    // The costly mistakes: a real defect missing from the report, or one that invites "fixing" a
    // correct test.
    if (PRODUCT_BUGS.has(label.category) && listedIn.length === 0) {
      critical.push(`product bug not reported: ${test.title}`);
    } else if (
      PRODUCT_BUGS.has(label.category) &&
      listedIn.some((f) => f.category === 'test-bug')
    ) {
      critical.push(`product bug called a test bug: ${test.title}`);
    }
    return { ...test, label: describe(label), listedAs: listedIn.map(describe), right };
  });
  const groupScores = c.groups.map((_, index) => {
    const own = tests.filter((t) => t.group === index);
    return own.filter((t) => t.right).length / own.length;
  });
  return {
    verdictRight: c.verdicts.includes(answer.verdict),
    tests,
    groupScores,
    notListed: tests.filter((t) => t.listedAs.length === 0).length,
    critical,
  };
}

const results = [];
for (const stateName of [...new Set(cases.map((c) => c.state))]) {
  const checkout = createCheckout(stateName, config.states[stateName]);
  try {
    const jobs = cases
      .filter((c) => c.state === stateName)
      .flatMap((c) => Array.from({ length: repeats }, (_, repeat) => ({ c, repeat })));
    results.push(
      ...(await pool(jobs, Number(options.concurrency), async ({ c, repeat }) => {
        const report = readReport(c);
        const labelled = labelTests(c, report);
        let answer;
        let meta;
        let error;
        try {
          ({ output: answer, meta } = options.simulate
            ? { output: simulate(options.simulate, c, labelled, report), meta: { costUsd: 0 } }
            : await triage(c, checkout.dir));
        } catch (failure) {
          error = failure instanceof Error ? failure.message : String(failure);
        }
        const graded = answer ? grade(c, labelled, answer) : undefined;
        const ok = graded && graded.verdictRight && graded.groupScores.every((s) => s === 1);
        console.error(
          `${ok ? 'ok  ' : 'MISS'} ${c.id} #${String(repeat + 1)}: ${answer?.verdict ?? error}`,
        );
        const expected = expectedKnownBugFailures(report);
        return { id: c.id, repeat, verdicts: c.verdicts, expected, answer, error, meta, ...graded };
      })),
    );
  } finally {
    checkout.cleanup();
  }
}
rmSync(reportsDir, { recursive: true, force: true });
rmSync(ghConfigDir, { recursive: true, force: true });

// Metrics per repeat; the gate must hold in every repeat. Tests are scored per label group, so a
// run with sixty failures of one cause counts as much as a run with one.
const percent = (n, d) =>
  d === 0 ? 'n/a' : `${String(n)}/${String(d)} (${String(Math.round((100 * n) / d))}%)`;
const sum = (rows, pick) => rows.reduce((total, row) => total + pick(row), 0);
const perRepeat = Array.from({ length: repeats }, (_, repeat) => {
  const rows = results.filter((r) => r.repeat === repeat);
  const answered = rows.filter((r) => r.answer);
  const scores = answered.flatMap((r) => r.groupScores);
  return {
    total: rows.length,
    verdictRight: answered.filter((r) => r.verdictRight).length,
    testAccuracy: scores.length === 0 ? 1 : sum(scores, (s) => s) / scores.length,
    actionTests: sum(answered, (r) => r.tests.length),
    notListed: sum(answered, (r) => r.notListed),
    critical: sum(answered, (r) => r.critical.length),
    noAnswer: rows.length - answered.length,
    costUsd: sum(rows, (r) => r.meta?.costUsd ?? 0),
  };
});
const passed = perRepeat.every(
  (m) =>
    m.verdictRight / m.total >= gate.minVerdictAccuracy &&
    m.testAccuracy >= gate.minTestAccuracy &&
    m.critical <= gate.maxCriticalErrors,
);
// A run that got no answer (a usage limit, an outage) says nothing about the agent's judgment.
const unanswered = results.filter((r) => !r.answer);
const verdict = unanswered.length > 0 ? 'INCONCLUSIVE' : passed ? 'PASS' : 'FAIL';
const reasons = [...new Set(unanswered.map((r) => r.error ?? 'unknown'))];

const columns = (pick) => perRepeat.map(pick).join(' | ');
const lines = [
  `## Whole-run triage eval: ${String(cases.length)} CI runs x ${String(repeats)} repeat(s)`,
  '',
  `**Gate: ${verdict}** (verdict right >= ${String(100 * gate.minVerdictAccuracy)}%, ` +
    `tests classified right >= ${String(100 * gate.minTestAccuracy)}% per label group, ` +
    `critical errors <= ${String(gate.maxCriticalErrors)}, in every repeat). ` +
    (options.simulate
      ? `Simulated reports (${options.simulate}), no model calls.`
      : `Model ${options.model}, the nightly triage's prompt and command line` +
        (options.instructions ? `, instructions ${options.instructions}` : '') +
        '.'),
  ...(unanswered.length > 0
    ? [
        '',
        `${String(unanswered.length)} of ${String(results.length)} runs got no answer, so the agent ` +
          `was not fully measured. Re-run when the cause is gone: ${reasons.join('; ')}`,
      ]
    : []),
  '',
  `| Metric | ${columns((_, i) => `Repeat ${String(i + 1)}`)} |`,
  `| --- | ${columns(() => '---')} |`,
  `| Verdict right | ${columns((m) => percent(m.verdictRight, m.total))} |`,
  `| Tests classified right (mean per label group) | ${columns((m) => `${String(Math.round(100 * m.testAccuracy))}%`)} |`,
  `| Tests needing action that the report leaves out | ${columns((m) => `${String(m.notListed)} of ${String(m.actionTests)}`)} |`,
  `| Critical errors (false green, product bug left out or called a test bug) | ${columns((m) => String(m.critical))} |`,
  `| No answer (not the agent's judgment) | ${columns((m) => String(m.noAnswer))} |`,
  `| Estimated cost | ${columns((m) => `$${m.costUsd.toFixed(2)}`)} |`,
  '',
  '| Run | Verdict (label) | Right per label group | Left out | Known-bug count (agent / report) | Cost |',
  '| --- | --- | --- | --- | --- | --- |',
  ...results.map((r) => {
    const run = `${r.id} #${String(r.repeat + 1)}`;
    if (!r.answer) return `| ${run} | no answer | | | | |`;
    const groups = r.groupScores.map((s) => `${String(Math.round(100 * s))}%`).join(', ') || '-';
    return (
      `| ${run} | ${r.answer.verdict} (${r.verdicts.join(' or ')}) | ${groups} | ` +
      `${String(r.notListed)} of ${String(r.tests.length)} | ` +
      `${String(r.answer.expectedKnownBugFailures)} / ${String(r.expected)} | ` +
      `$${r.meta.costUsd.toFixed(2)} |`
    );
  }),
];
const misses = results.flatMap((r) =>
  (r.tests ?? [])
    .filter((t) => !t.right)
    .map((t) => ({ run: `${r.id} #${String(r.repeat + 1)}`, test: t })),
);
if (misses.length > 0) {
  lines.push('', '| Run | Test | Label | Listed as |', '| --- | --- | --- | --- |');
  for (const { run, test } of misses) {
    const listed = test.listedAs.join(', ') || 'left out';
    lines.push(`| ${run} | ${cell(`${test.file} ${test.title}`)} | ${test.label} | ${listed} |`);
  }
}
const criticals = results.flatMap((r) =>
  (r.critical ?? []).map((reason) => `${r.id} #${String(r.repeat + 1)}: ${reason}`),
);
if (criticals.length > 0) lines.push('', 'Critical errors:', ...criticals.map((c) => `- ${c}`));

mkdirSync(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
writeFileSync(
  `${OUT_DIR}/triage-runs-${stamp}.json`,
  `${JSON.stringify({ verdict, perRepeat, results }, null, 2)}\n`,
);
writeFileSync(`${OUT_DIR}/triage-runs-latest.md`, `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
process.exit(verdict === 'PASS' ? 0 : 1);
