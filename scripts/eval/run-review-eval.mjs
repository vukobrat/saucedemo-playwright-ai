// Runs the AI review's own prompt and command line (scripts/lib/review-run.mjs) on every case in
// evals/review/config.json, each in an isolated checkout of HEAD with the case's edits, and grades
// the findings against labelled lines. A planted violation counts as caught only when a must-fix or
// should-fix finding points at it; correct code that looks wrong (a verified exception) must never
// get one, because the author would "fix" it into a real bug. Exits non-zero when the gate fails
// or a review never happened.
//
// Usage: npm run eval:review [-- --only <case-id-prefix>] [--repeat 3] [--concurrency 3] [--model <id>]
//        npm run eval:review -- --simulate <perfect|hedged|silent|every-locator>  (tests the grader)
//        npm run eval:review -- --check [--lint]  (cases apply and labels resolve; --lint: ESLint
//        passes every planted change, so each case is one that lint cannot catch)
// Needs: `claude` signed in, except for --simulate and --check.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { runHeadless } from '../lib/claude-headless.mjs';
import { REVIEW_MODEL, REVIEW_SCHEMA, reviewArgs, reviewPrompt } from '../lib/review-run.mjs';
import { createCheckout } from './checkout.mjs';
import { pool } from './pool.mjs';

const OUT_DIR = 'eval-output';
const { values: options } = parseArgs({
  options: {
    only: { type: 'string' },
    repeat: { type: 'string', default: '1' },
    concurrency: { type: 'string', default: '3' },
    model: { type: 'string', default: REVIEW_MODEL },
    simulate: { type: 'string' },
    check: { type: 'boolean', default: false },
    lint: { type: 'boolean', default: false },
  },
});

/** How far a finding's line may be from a label's anchor: statements wrap, comments precede. */
const TOLERANCE = 2;

const config = JSON.parse(readFileSync('evals/review/config.json', 'utf8'));
const cases = config.cases.filter((c) => !options.only || c.id.startsWith(options.only));

/** The line numbers (1-based) of a label's anchors; each anchor must be on exactly one line. */
function anchorLines(dir, c, label) {
  const lines = readFileSync(path.join(dir, label.file), 'utf8').split('\n');
  return [label.at].flat().map((anchor) => {
    const found = lines.flatMap((line, index) => (line.includes(anchor) ? [index + 1] : []));
    if (found.length !== 1) {
      throw new Error(
        `Case "${c.id}" is stale: "${anchor}" is on ${String(found.length)} lines of ${label.file}, not one`,
      );
    }
    return found[0];
  });
}

/** Every label of a case with its resolved lines, in the case's checkout. */
function resolveLabels(dir, c) {
  return [
    ...c.violations.map((v) => ({ ...v, kind: 'violation', lines: anchorLines(dir, c, v) })),
    ...c.exceptions.map((e) => ({ ...e, kind: 'exception', lines: anchorLines(dir, c, e) })),
  ];
}

/** A finding's file as a repository path, however the agent wrote it. */
function normalize(file) {
  const index = file.indexOf('src/');
  return index === -1 ? file.replace(/^\.\//, '') : file.slice(index);
}

/** The label a finding points at: the nearest one in its file within the tolerance, if any. */
function labelOf(finding, labels) {
  let best;
  let bestDistance = Infinity;
  for (const label of labels) {
    if (label.file !== normalize(finding.file)) continue;
    const distance = Math.min(...label.lines.map((line) => Math.abs(line - finding.line)));
    if (distance <= TOLERANCE && distance < bestDistance) {
      best = label;
      bestDistance = distance;
    }
  }
  return best;
}

const confident = (finding) => finding.severity !== 'judgment';

function grade(review, labels) {
  const byLabel = new Map(labels.map((label) => [label, []]));
  const unlabelled = [];
  for (const finding of review.findings) {
    const label = labelOf(finding, labels);
    if (label) byLabel.get(label).push(finding);
    else unlabelled.push(finding);
  }
  const outcome = (label, hit, soft, none) => {
    const findings = byLabel.get(label);
    if (findings.some(confident)) return hit;
    return findings.length > 0 ? soft : none;
  };
  return {
    violations: labels
      .filter((l) => l.kind === 'violation')
      .map((l) => ({
        file: l.file,
        rule: l.rule,
        outcome: outcome(l, 'caught', 'hedged', 'missed'),
      })),
    exceptions: labels
      .filter((l) => l.kind === 'exception')
      .map((l) => ({
        file: l.file,
        at: l.at,
        outcome: outcome(l, 'flagged', 'noted', 'respected'),
        findings: byLabel.get(l),
      })),
    falsePositives: unlabelled.filter(confident),
    notes: unlabelled.filter((f) => !confident(f)),
  };
}

/** Scripted reviews that test the grader without model calls. */
function simulate(behaviour, dir, c, labels) {
  const violations = labels.filter((l) => l.kind === 'violation');
  const finding = (file, line, severity) => ({
    file,
    line,
    severity,
    rule: 'simulated',
    message: `simulated: ${behaviour}`,
  });
  if (behaviour === 'perfect' || behaviour === 'hedged') {
    const severity = behaviour === 'perfect' ? 'must-fix' : 'judgment';
    const findings = violations.map((v) => finding(v.file, v.lines[0], severity));
    return { verdict: findings.length ? 'findings' : 'clean', summary: 'simulated', findings };
  }
  if (behaviour === 'silent') return { verdict: 'clean', summary: 'simulated', findings: [] };
  if (behaviour === 'every-locator') {
    // Flags every line that builds a locator: finds the locator violations and every exception.
    const findings = c.files.flatMap((file) =>
      readFileSync(path.join(dir, file), 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          /\.(getBy\w+|locator)\(/.test(line) ? [finding(file, index + 1, 'must-fix')] : [],
        ),
    );
    return { verdict: 'findings', summary: 'simulated', findings };
  }
  throw new Error(`Unknown --simulate behaviour: ${behaviour}`);
}

if (options.check) {
  let labelCount = 0;
  for (const c of cases) {
    const checkout = createCheckout(c.id, { stripKnownBugMarkers: false, edits: c.edits });
    try {
      labelCount += resolveLabels(checkout.dir, c).length;
      if (options.lint) {
        const lint = spawnSync('npx', ['eslint', '--max-warnings=0', ...c.files], {
          cwd: checkout.dir,
          encoding: 'utf8',
        });
        if (lint.status !== 0) {
          throw new Error(`Case "${c.id}": ESLint rejects the change:\n${lint.stdout}`);
        }
      }
    } finally {
      checkout.cleanup();
    }
  }
  console.log(
    `${String(cases.length)} review cases apply to HEAD; ${String(labelCount)} labels resolve` +
      (options.lint ? '; ESLint passes every case' : ''),
  );
  process.exit(0);
}

const repeat = Number(options.repeat);
const jobs = cases.flatMap((c, index) =>
  Array.from({ length: repeat }, (_, run) => ({ c, run, pr: String(101 + index) })),
);

async function runJob({ c, run, pr }) {
  const checkout = createCheckout(c.id, { stripKnownBugMarkers: false, edits: c.edits });
  try {
    const labels = resolveLabels(checkout.dir, c);
    let review;
    let meta;
    try {
      if (options.simulate) review = simulate(options.simulate, checkout.dir, c, labels);
      else
        ({ output: review, meta } = await runHeadless({
          prompt: reviewPrompt(pr, c.files),
          schemaFile: REVIEW_SCHEMA,
          cwd: checkout.dir,
          env: { ...process.env, CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' },
          args: reviewArgs({ model: options.model }),
        }));
    } catch (failure) {
      const error = failure instanceof Error ? failure.message : String(failure);
      console.error(`no-run   ${c.id} #${String(run + 1)}: ${error}`);
      return { id: c.id, run, error };
    }
    const graded = grade(review, labels);
    const caught = graded.violations.filter((v) => v.outcome === 'caught').length;
    const flagged = graded.exceptions.filter((e) => e.outcome === 'flagged').length;
    console.error(
      `${c.id} #${String(run + 1)}: caught ${String(caught)}/${String(graded.violations.length)}, ` +
        `exceptions flagged ${String(flagged)}, false positives ${String(graded.falsePositives.length)}`,
    );
    return { id: c.id, run, review, meta, ...graded };
  } finally {
    checkout.cleanup();
  }
}

const results = await pool(jobs, Number(options.concurrency), runJob);

const done = results.filter((r) => !r.error);
const sum = (rows, pick) => rows.reduce((total, r) => total + pick(r), 0);
const countOf = (rows, key, outcome) =>
  sum(rows, (r) => r[key].filter((x) => x.outcome === outcome).length);
const violations = sum(done, (r) => r.violations.length);
const caught = countOf(done, 'violations', 'caught');
const hedged = countOf(done, 'violations', 'hedged');
const critical = countOf(done, 'exceptions', 'flagged');
const falsePositives = sum(done, (r) => r.falsePositives.length);
const notes = sum(done, (r) => r.notes.length);
const recall = violations === 0 ? 1 : caught / violations;
const { gate } = config;
const passed =
  critical <= gate.maxCriticalErrors &&
  recall >= gate.minRecall &&
  falsePositives / repeat <= gate.maxFalsePositivesPerRun;
const noRun = results.length - done.length;
const verdictText = noRun > 0 ? 'INCONCLUSIVE' : passed ? 'PASS' : 'FAIL';
const cost = sum(done, (r) => r.meta?.costUsd ?? 0);

const where = (f) => `\`${normalize(f.file)}:${String(f.line)}\``;
const lines = [
  `## Review eval: ${String(cases.length)} cases x ${String(repeat)}`,
  '',
  `**Gate: ${verdictText}** (exceptions flagged <= ${String(gate.maxCriticalErrors)}, planted violations caught >= ${String(100 * gate.minRecall)}%, ` +
    `false positives per run <= ${String(gate.maxFalsePositivesPerRun)}). Model ${options.simulate ? `none (simulated: ${options.simulate})` : options.model}.`,
  '',
  `Caught ${String(caught)}/${String(violations)} planted violations (${(100 * recall).toFixed(0)}%), ${String(hedged)} only as "judgment". ` +
    `Correct code flagged as a problem: ${String(critical)}. False positives: ${String(falsePositives)}. Judgment notes elsewhere: ${String(notes)}. ` +
    `No review: ${String(noRun)}. Estimated cost: $${cost.toFixed(2)}.`,
  '',
  '| Case | Run | Caught | Hedged | Missed | Exceptions flagged | False positives | Notes | Turns | Cost |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ...results.map((r) =>
    r.error
      ? `| ${r.id} | ${String(r.run + 1)} | no review: ${r.error.slice(0, 80)} | | | | | | | |`
      : `| ${r.id} | ${String(r.run + 1)} | ${String(countOf([r], 'violations', 'caught'))}/${String(r.violations.length)} | ` +
        `${String(countOf([r], 'violations', 'hedged'))} | ${String(countOf([r], 'violations', 'missed'))} | ` +
        `${String(countOf([r], 'exceptions', 'flagged'))} | ${String(r.falsePositives.length)} | ${String(r.notes.length)} | ` +
        `${String(r.meta?.turns ?? '-')} | ${r.meta ? `$${r.meta.costUsd.toFixed(3)}` : '-'} |`,
  ),
];

// Every finding the labels do not expect, for a person to read: a false positive may be a real
// problem nobody planted, and then the labels need fixing, not the agent.
const unexpected = done.flatMap((r) => [
  ...r.exceptions
    .filter((e) => e.outcome === 'flagged')
    .flatMap((e) => e.findings.filter(confident).map((f) => ({ r, f, kind: 'exception flagged' }))),
  ...r.falsePositives.map((f) => ({ r, f, kind: 'false positive' })),
]);
if (unexpected.length > 0) {
  lines.push('', '### Findings the labels do not expect', '');
  for (const { r, f, kind } of unexpected) {
    lines.push(
      `- ${kind}, ${r.id} #${String(r.run + 1)}: **${f.severity}** ${where(f)} (${f.rule}): ${f.message}`,
    );
  }
}
const missed = done.flatMap((r) =>
  r.violations.filter((v) => v.outcome !== 'caught').map((v) => ({ r, v })),
);
if (missed.length > 0) {
  lines.push('', '### Planted violations not caught', '');
  for (const { r, v } of missed) {
    lines.push(`- ${v.outcome}, ${r.id} #${String(r.run + 1)}: \`${v.file}\`: ${v.rule}`);
  }
}

mkdirSync(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
writeFileSync(
  `${OUT_DIR}/review-${stamp}.json`,
  `${JSON.stringify({ verdict: verdictText, model: options.model, results }, null, 2)}\n`,
);
writeFileSync(`${OUT_DIR}/review-latest.md`, `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
process.exit(verdictText === 'PASS' ? 0 : 1);
