// Creates an isolated checkout of HEAD in one eval state (evals/triage/config.json): a `git archive`
// export in a neutrally named temp directory, so the agent under evaluation sees no git status,
// no history, no auto memory of this repository and no hint in its working directory's name.
// Files that would give the answers away (the golden set, this tooling, the lessons that describe
// past injections) are removed before the state's edits are applied.
import { execFileSync } from 'node:child_process';
import {
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
 * @param {string} stateName A key of `states` in evals/triage/config.json.
 * @param {{ stripKnownBugMarkers: boolean, edits: { file: string, find: string, replace: string }[] }} state
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
  // The qa MCP server and Playwright run through this checkout's tooling.
  symlinkSync(path.join(REPO, 'node_modules'), path.join(dir, 'node_modules'));

  return {
    dir,
    cleanup: () => {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export function loadConfig() {
  return JSON.parse(readFileSync(path.join(REPO, 'evals/triage/config.json'), 'utf8'));
}
