// The cases of the whole-run triage eval (evals/triage/run-cases.json) and their labels. A case is
// one CI run: its saved report, the code state that produced it, and groups that label every test
// in the report that needs an owner action. The eval reads each report itself rather than through
// the qa server whose output the agent sees, so a bug in the server cannot hide in the grades.
import { readFileSync } from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();

export function loadRunCases() {
  return JSON.parse(readFileSync(path.join(REPO, 'evals/triage/run-cases.json'), 'utf8'));
}

/** Where a case's saved report lives. */
export function reportPath(c) {
  return path.join(REPO, 'evals/triage/reports', `${c.id}.json`);
}

export function readReport(c) {
  return JSON.parse(readFileSync(reportPath(c), 'utf8'));
}

/** Every test of a report with its spec. */
export function* walk(suites) {
  for (const suite of suites ?? []) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) yield { spec, test };
    }
    yield* walk(suite.suites);
  }
}

const isKnownBug = (test) => test.annotations?.some((a) => a.type === 'known-bug') ?? false;

/**
 * The tests of a report that need an owner action, once per spec however many projects ran it:
 * failed (or timed out) without the outcome its marker expects, passed despite a knownBug()
 * marker, or flaky.
 */
export function actionTests(report) {
  const tests = new Map();
  for (const { spec, test } of walk(report.suites)) {
    if (test.status !== 'unexpected' && test.status !== 'flaky') continue;
    // Unexpected under a knownBug() marker means passed only when it did pass: a marked test
    // that times out is unexpected too, because the marker expects "failed", not "timedOut".
    const passed = test.results?.at(-1)?.status === 'passed';
    let outcome = 'failed';
    if (test.status === 'flaky') outcome = 'flaky';
    else if (isKnownBug(test) && test.expectedStatus === 'failed' && passed) {
      outcome = 'passed-known-bug';
    }

    const key = `${spec.file}::${spec.title}`;
    const entry = tests.get(key) ?? {
      file: spec.file,
      line: spec.line,
      title: spec.title,
      outcome,
    };
    if (outcome === 'failed') entry.outcome = 'failed'; // a real failure anywhere outweighs a flake
    tests.set(key, entry);
  }
  return [...tests.values()];
}

/** Known-bug tests that failed as expected, per project, as the qa server counts them. */
export function expectedKnownBugFailures(report) {
  let count = 0;
  for (const { test } of walk(report.suites)) {
    if (isKnownBug(test) && test.expectedStatus === 'failed' && test.status === 'expected') {
      count += 1;
    }
  }
  return count;
}

function matches(match, test) {
  return (
    (!match.files || match.files.includes(test.file)) &&
    (!match.titles || match.titles.includes(test.title)) &&
    (!match.outcome || match.outcome === test.outcome)
  );
}

/**
 * Labels every action test of a case's report with the index of the one group that matches it.
 * Throws when a test matches no group or several, or a group matches nothing: the labels no
 * longer describe the report.
 */
export function labelTests(c, report) {
  const labelled = actionTests(report).map((test) => {
    const groups = c.groups.flatMap((group, index) => (matches(group.match, test) ? [index] : []));
    if (groups.length !== 1) {
      throw new Error(
        `Case "${c.id}": ${test.file} "${test.title}" (${test.outcome}) matches ` +
          `${String(groups.length)} groups, not one`,
      );
    }
    return { ...test, group: groups[0] };
  });
  const unused = c.groups.findIndex((_, index) => !labelled.some((t) => t.group === index));
  if (unused !== -1) {
    throw new Error(`Case "${c.id}": group ${String(unused + 1)} matches no test in the report`);
  }
  return labelled;
}

const SPEC_FILE = /[\w.-]+\.(?:spec|setup)\.ts/g;
const normalize = (text) => text.toLowerCase().replace(/\s+/g, ' ');

/**
 * Whether one entry of a report's `tests` names a test: it contains the test's title, and the
 * test's spec file when it names any (titles repeat across specs).
 */
export function names(entry, test) {
  if (!normalize(entry).includes(normalize(test.title))) return false;
  const files = entry.match(SPEC_FILE);
  return !files || files.includes(path.basename(test.file));
}
