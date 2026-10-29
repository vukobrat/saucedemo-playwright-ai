// Creates an isolated checkout of HEAD in one eval state (evals/triage/config.json): a `git archive`
// export in a neutrally named temp directory, so the agent under evaluation sees no git status,
// no history, no auto memory of this repository and no hint in its working directory's name.
// Files that would give the answers away (the golden set, this tooling, the lessons that describe
// past injections) are removed before the state's edits are applied. The builders run the suite in
// such a checkout with runPlaywright.
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const REPO = process.cwd();

/** The answer key and anything that describes how eval failures were made. */
const LEAK_PATHS = ['evals', 'scripts/eval', 'docs/phase-1', 'docs/ai-agents-learning-log.md'];

// The marker line and the blank line that usually follows it: a test body that starts with an empty
// line is a seam the agent notices ("the markers appear to have been stripped").
const MARKER_LINE = /^[ \t]*knownBug\(KNOWN_BUGS\.\w+\);[ \t]*\n(?:[ \t]*\n)?/gm;
const MARKER_IMPORTS = [
  "import { KNOWN_BUGS } from '@data/known-bugs';\n",
  "import { knownBug } from '@utils/known-bug';\n",
];

function filesUnder(dir) {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    return statSync(file).isDirectory() ? filesUnder(file) : [file];
  });
}

/** Removes every knownBug() marker and its imports from the specs. */
function stripKnownBugMarkers(dir) {
  for (const file of filesUnder(path.join(dir, 'tests')).filter((f) => f.endsWith('.ts'))) {
    const source = readFileSync(file, 'utf8');
    let stripped = source.replace(MARKER_LINE, '');
    for (const line of MARKER_IMPORTS) stripped = stripped.replace(line, '');
    if (stripped !== source) writeFileSync(file, stripped);
  }
}

/** Applies one find/replace edit; a find that does not match exactly once means a stale state. */
function applyEdit(dir, stateName, edit) {
  const file = path.join(dir, edit.file);
  const source = readFileSync(file, 'utf8');
  const matches = source.split(edit.find).length - 1;
  if (matches !== 1) {
    throw new Error(
      `State "${stateName}" is stale: its edit to ${edit.file} matches ${String(matches)} times, not once`,
    );
  }
  writeFileSync(file, source.replace(edit.find, edit.replace));
}

/**
 * @param {string} stateName A key of `states` in evals/triage/config.json, or an eval case's id.
 * @param {{ stripKnownBugMarkers: boolean, edits: { file: string, find: string, replace: string }[], remove?: string[] }} state
 *   `remove`: files deleted from the checkout, such as the specs a write-test case holds out.
 * @returns {{ dir: string, cleanup: () => void }}
 */
export function createCheckout(stateName, state) {
  const dir = mkdtempSync(path.join(tmpdir(), 'saucedemo-'));
  const archive = execFileSync('git', ['archive', '--format=tar', 'HEAD'], {
    cwd: REPO,
    maxBuffer: 256 * 1024 * 1024,
  });
  execFileSync('tar', ['-x', '-C', dir], { input: archive });

  for (const leak of LEAK_PATHS) rmSync(path.join(dir, leak), { recursive: true, force: true });
  if (state.stripKnownBugMarkers) stripKnownBugMarkers(dir);
  for (const edit of state.edits) applyEdit(dir, stateName, edit);
  for (const file of state.remove ?? []) {
    if (!existsSync(path.join(dir, file))) {
      throw new Error(`State "${stateName}" is stale: ${file} does not exist`);
    }
    rmSync(path.join(dir, file));
  }
  // The qa MCP server and Playwright run through this checkout's tooling.
  symlinkSync(path.join(REPO, 'node_modules'), path.join(dir, 'node_modules'));

  return {
    dir,
    cleanup: () => {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/**
 * Runs specs of a checkout on chromium and returns the Playwright JSON report. Needs the test
 * credentials in this process's environment and installed browsers.
 * @param {string} dir A checkout from createCheckout.
 * @param {{ name: string, specs: string[], grep?: string, noDeps?: boolean, staleAuth?: boolean, env?: Record<string, string> }} run
 */
export function runPlaywright(dir, run) {
  const reportFile = path.join(dir, 'eval-report.json');
  const args = ['playwright', 'test', ...run.specs, '--project=chromium', '--workers=2'];
  args.push('--reporter=json');
  if (run.grep) args.push('--grep', run.grep);
  if (run.noDeps) args.push('--no-deps');
  if (run.staleAuth) {
    // A saved session that no longer logs anyone in, as after the 10-minute cookie expires.
    mkdirSync(path.join(dir, '.auth'), { recursive: true });
    for (const persona of ['standard', 'problem', 'error', 'performanceGlitch', 'visual']) {
      writeFileSync(path.join(dir, '.auth', `${persona}.json`), '{"cookies":[],"origins":[]}\n');
    }
  }
  spawnSync('npx', args, {
    cwd: dir,
    env: { ...process.env, ...run.env, PLAYWRIGHT_JSON_OUTPUT_FILE: reportFile },
    stdio: 'ignore',
  });
  if (!existsSync(reportFile)) throw new Error(`Run "${run.name}" produced no report`);
  return JSON.parse(readFileSync(reportFile, 'utf8'));
}

export function loadConfig() {
  return JSON.parse(readFileSync(path.join(REPO, 'evals/triage/config.json'), 'utf8'));
}
