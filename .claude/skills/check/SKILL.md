---
name: check
description: >-
  Run this repo's definition-of-done gates in order (lint, typecheck, format, and the affected
  tests) and report which passed. Use before pushing or opening a PR, or when asked whether a
  change is ready.
argument-hint: '[spec path, e.g. tests/e2e/cart.spec.ts; omit to run the smoke suite]'
allowed-tools: Bash(npm run *)
---

# Check: is this change ready?

Run the definition-of-done gates for a change and report the result. Do not fix anything here;
just run the gates and say what passed and what failed, with the failing output.

Run these in order and stop reporting at the first failure is not required - run all of them so the
report is complete:

1. `npm run lint`
2. `npm run typecheck`
3. `npm run format:check`
4. Tests:
   - If a spec path was given as the argument: `npm run test:local -- <path> --repeat-each=3`
     (`--repeat-each=3` guards against flakiness on a changed spec).
   - Otherwise: `npm run test:smoke` on chromium, the PR gate suite.

On this machine the local run is chromium only; Firefox and WebKit run in CI.

## Report

A short table: each gate, pass or fail, and for a failure the key lines of output. If everything
passes, say the change meets the definition of done and is ready to push. If a gate fails, say
which, show the evidence, and name the likely cause - but make no edits. This command is a status
check, not a fix loop.
