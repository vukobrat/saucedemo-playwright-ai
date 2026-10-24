---
name: fix-test
description: >-
  Run a failing Playwright test in a bounded fix loop: reproduce, read the evidence, classify the
  failure, fix only a real test bug at its cause, re-run, and stop on clear exit criteria. Refuses
  to make a product bug green. Use when a test fails and you want it fixed, not just explained.
argument-hint: <spec path, optionally with :line, e.g. tests/e2e/checkout.spec.ts:11>
disable-model-invocation: true
---

# Fix a failing test

Make a failing test pass only by fixing what is actually wrong. A loop that turns red into green
by weakening the test is worse than no loop: it hides a real bug behind a green check. The
guardrails in `CLAUDE.md` apply in full; the test-weakening hook will block the crude cases, but
the judgment in step 3 is yours.

## Exit criteria (decide against these after every run)

Stop and report as soon as one of these is true:

- **Fixed:** the target passes with `--repeat-each=3`, and `npm run lint` and `npm run typecheck`
  pass.
- **Not a test bug:** the failure is a product bug (known or new), an environment problem, or
  flakiness. Do not edit anything to make it green (the one exception is in step 3).
- **Out of attempts:** three fix attempts without a green run. An attempt is an edit followed by a
  re-run.
- **Only an expectation change would help:** the only edit that makes it pass changes what the test
  expects, and the app model does not prove the old expectation wrong.
- **A guardrail blocks you:** the test-weakening hook or a permission refuses an edit. Do not route
  around it with another tool.

## The loop

1. **Reproduce.** `npm run test:local -- <target>`. If it passes, re-run with `--repeat-each=5`:
   all green means there is nothing to fix; mixed results mean flakiness, so stop and recommend the
   `flaky-investigator` subagent.
2. **Read the evidence.** The error, expected versus received, and the failing line; then
   `error-context.md` (the page snapshot at the failure) in the test's folder under `test-results/`.
   Read the spec and the page objects, components, data and helpers it uses.
3. **Classify the failure** into one triage category: product bug (known or new), test bug,
   environment, or flaky. When received differs from expected, the deciding question is **which
   side is wrong**. Check the expectation against `docs/app-exploration.md` (the verified app model)
   and `src/data/known-bugs.ts`:
   - The expectation matches the app model, so **the app is wrong: a product bug.** If the defect
     is catalogued and the test lacks its `knownBug()` marker, restoring the marker as the first
     line of the test is the fix: the assertion stays exactly as it is. Confirm with
     `EXPOSE_KNOWN_BUGS=true` that the test still fails on the documented symptom. If the defect is
     not catalogued, it is a new product bug: stop, change nothing, and report it with evidence. A
     person decides whether it gets an `SD-xxx` entry.
   - The expectation contradicts the app model (wrong data, a wrong derivation, a stale selector,
     a race in the test), so **the test is wrong: a test bug.** Fix it in step 4.
   - Expired `.auth/` sessions, missing env vars, a browser that cannot start: **environment.**
     Stop and report the remedy.
   - If you cannot tell, do not guess. Ask the `triage` subagent for an independent
     classification; it cannot edit.
4. **Fix the cause, in the layer where it lives:** a selector in the page object or component
   (checked against the app model or the live app), a value in `src/data/`, a helper in
   `src/utils/`, or test logic in the spec. Make the smallest change that removes the cause.
   Never: delete or loosen an assertion, swap a matcher for a vaguer one, hardcode a value that
   should be derived, catch an assertion's error, add `skip`/`fixme`/`only`, raise a timeout, add a
   wait, or set an expected value to whatever the app returned. Never edit `playwright.config.ts`,
   CI workflows, `.claude/` or `.env`.
5. **Re-run the target.** Green: go to step 6. Red: count the attempt and go back to step 2 with
   the new evidence.
6. **Verify.** `npm run test:local -- <target> --repeat-each=3`, then `npm run lint` and
   `npm run typecheck`. If the fix touched shared code in `src/`, also run the specs that import it
   (or the smoke suite).

## Report

- **Classification and evidence:** the error line, and the app-model or catalogue line that
  decided which side is wrong.
- **What changed and why it was the cause,** one line per file, or why you changed nothing.
- **Attempts used and the verification output.**
- **For a product bug:** the `SD-xxx` id, or a proposed entry (summary, persona, steps to
  reproduce), and confirmation that the test still asserts the correct behaviour.
