#!/usr/bin/env node
// PreToolUse hook (Edit|Write): block an edit that weakens a spec in tests/ by removing
// assertions or adding a disabling marker. This is defense-in-depth on top of ESLint, which
// checks the final state of a file and so cannot see that an edit *removed* an assertion while
// leaving the test in place - the classic way a fix loop turns a red test green (Module 7).
//
// Scope: only files under tests/. It never blocks adding a knownBug() marker (that is the
// framework's legitimate mechanism and keeps the assertion), only removing assertions or adding
// skip/only/fixme/force/waitForTimeout. It fails open: any parse or read error allows the edit,
// because a quality guardrail must not wedge all test editing when the hook itself breaks.
//
// Input: PreToolUse JSON on stdin. Output: exit 0 to allow, exit 2 with a stderr message to block.
import { existsSync, readFileSync } from 'node:fs';

const allow = () => process.exit(0);
const block = (reason) => {
  process.stderr.write(`${reason}\n`);
  process.exit(2);
};

try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const tool = input.tool_name;
  const toolInput = input.tool_input ?? {};
  const file = toolInput.file_path ?? '';

  // Guard spec and other test files only; page objects, data and config are out of scope.
  if (!/(^|\/)tests\/.+\.ts$/.test(file)) allow();

  let before = '';
  let after = '';
  if (tool === 'Edit') {
    before = toolInput.old_string ?? '';
    after = toolInput.new_string ?? '';
  } else if (tool === 'Write') {
    after = toolInput.content ?? '';
    before = existsSync(file) ? readFileSync(file, 'utf8') : '';
  } else {
    allow();
  }

  const count = (text, pattern) => (text.match(pattern) ?? []).length;
  const added = (pattern) => count(after, pattern) > count(before, pattern);

  const reasons = [];

  // Assertions: expect(...) and the page-object guard expectLoaded(...). A net drop means the
  // edit removed a check. This is the one weakening ESLint cannot catch from the final state.
  const assertions = /\bexpect(?:Loaded)?\s*\(/g;
  const removed = count(before, assertions) - count(after, assertions);
  if (removed > 0)
    reasons.push(`removes ${removed} assertion(s) (expect / expectLoaded) from a spec`);

  if (added(/\.\s*(?:skip|only|fixme)\s*\(/g)) reasons.push('adds a skip / only / fixme marker');
  if (added(/force\s*:\s*true/g)) reasons.push('adds force: true');
  if (added(/waitForTimeout/g)) reasons.push('adds waitForTimeout');

  if (reasons.length > 0) {
    block(
      `Blocked: this edit to ${file} ${reasons.join('; ')}.\n` +
        'Do not make a failing test pass by weakening it. If the app is wrong it is a known bug: ' +
        'add a stable SD-xxx entry and call knownBug() with evidence (the assertion stays). If the ' +
        'test is wrong, fix the cause. A deliberate assertion refactor should be made by a person, ' +
        'or justified explicitly in the request.',
    );
  }

  allow();
} catch {
  // Fail open: never wedge test editing because of a hook error.
  allow();
}
