// Facts about what an agent changed in a checkout, for the evals that grade the checkout rather
// than the agent's report (fix-loop, write-test): which files changed, whether an assertion or a
// knownBug() marker was lost or added, the catalogue's keys and ids, and the tests of a Playwright
// JSON report.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

function filesUnder(dir, root) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    return statSync(file).isDirectory() ? filesUnder(file, root) : [path.relative(root, file)];
  });
}

/** The code an agent may change: sources, specs, and the app model. */
export function snapshot(dir) {
  const files = [
    ...filesUnder(path.join(dir, 'src'), dir),
    ...filesUnder(path.join(dir, 'tests'), dir),
  ];
  files.push('docs/app-exploration.md');
  return new Map(files.map((file) => [file, readFileSync(path.join(dir, file), 'utf8')]));
}

/** Added, edited and deleted files between two snapshots. */
export function changedFiles(before, after) {
  return [...new Set([...before.keys(), ...after.keys()])].filter(
    (file) => before.get(file) !== after.get(file),
  );
}

/** Lines that assert: an expect() call or a matcher. Prettier keeps them stable. */
export const ASSERTION = /\bexpect(?:\.soft)?\s*\(|\.(?:not\.)?to[A-Z]\w*\(/;

/** True when an assertion line of `before` is missing or changed in `after`. */
export function assertionsChanged(before, after) {
  const lines = (text) =>
    text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => ASSERTION.test(l));
  const remaining = lines(after);
  return lines(before).some((line) => {
    const index = remaining.indexOf(line);
    if (index === -1) return true;
    remaining.splice(index, 1);
    return false;
  });
}

const MARKER = /knownBug\(KNOWN_BUGS\.(\w+)\)/g;

/** The catalogue keys of every knownBug() marker in a file. */
export const markers = (text) => [...text.matchAll(MARKER)].map((m) => m[1]);

/** Items of `after` that `before` does not have, counting repeats. */
export function added(before, after) {
  const remaining = [...after];
  for (const item of before) {
    const index = remaining.indexOf(item);
    if (index !== -1) remaining.splice(index, 1);
  }
  return remaining;
}

/** Catalogue key to id (`SD-xxx`, `DJ-xxx`) of src/data/known-bugs.ts. */
export function catalogueIds(text) {
  return new Map([...text.matchAll(/(\w+): \{\s*id: '((?:SD|DJ)-\d+)'/g)].map((m) => [m[1], m[2]]));
}

/** Every test of a Playwright JSON report, with the titles of the suites around it. */
export function walkTests(suites, found = [], titles = []) {
  for (const suite of suites ?? []) {
    const suiteTitles = [...titles, suite.title];
    for (const spec of suite.specs ?? [])
      for (const test of spec.tests ?? []) found.push({ spec, test, titles: suiteTitles });
    walkTests(suite.suites, found, suiteTitles);
  }
  return found;
}
