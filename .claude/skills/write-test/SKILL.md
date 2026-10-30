---
name: write-test
description: >-
  Write a new Playwright test for this SauceDemo framework following its conventions: fixtures,
  tags, typed data, web-first assertions, and the knownBug marker for defects. Use when asked to
  add a test, cover a feature or flow, or write a spec in tests/.
argument-hint: <what to test, e.g. "cart badge updates when removing an item">
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(npm run *), Bash(EXPOSE_KNOWN_BUGS=true npm run *)
---

# Write a Playwright test

Add a test that follows this repo's conventions exactly. Produce real, passing, convention-clean
code, not a sketch. Never weaken the suite to make something pass.

## Before writing

1. **Read the conventions, do not reinvent them.** Open `.claude/rules/tests.md` (writing tests and
   known bugs) and, if you will touch a page object or component, `.claude/rules/pages.md`. The
   verified app model (users, routes, exact messages, catalog, known defects) is in
   `docs/app-exploration.md`; trust it over any assumption.
2. **Find the right spec file.** Group the test with its feature in `tests/` (`e2e/`, `personas/`,
   `a11y/`, `visual/`, `api/`). Read a neighbouring spec to match structure and the local style.
3. **Decide the persona.** Logged-in tests reuse `storageState` through the `persona` fixture
   (default `standard`; `test.use({ persona: 'problem' })`). Only login specs log in through the
   UI, with `test.use({ persona: null })`.

## Writing

1. **Locators live in page objects, never in the spec.** If you need a locator that does not exist
   yet, add it to the page object or component (use the `add-page-object` skill for a new screen),
   after verifying it on the live app with the Playwright MCP server. ESLint blocks raw locators in
   `tests/`.
2. **Import from `@fixtures` only:** `import { test, expect } from '@fixtures';`. Pull page objects
   from the fixture arguments, data from `@data/*`.
3. **Tag every test** with exactly one suite tag: `@regression`, `@persona`, `@a11y`, `@visual`
   or `@api`, usually once on the `describe`. `@smoke` is not a suite but the PR gate: add it on
   top of the suite tag for a critical path only, never instead of it.
4. **Derive expected values from typed data** (catalog prices, `pricing.ts`), never hardcode totals.
   Random data comes from builders fed the per-test `faker` fixture.
5. **Web-first assertions only** (`await expect(locator).toHaveText(...)`). No `waitForTimeout`, no
   `force: true`, no manual `isVisible()` polling. Keep tests independent: no order dependency, no
   shared mutable state.
6. **Assert the correct behaviour even when the app is wrong.** If the app misbehaves, it is a bug,
   not a reason to soften the test. If it is a known defect, add an entry with a stable `SD-xxx`
   id to `src/data/known-bugs.ts` and call `knownBug(KNOWN_BUGS.<entry>)` as the first line. Then
   run the test with `EXPOSE_KNOWN_BUGS=true` and confirm it fails on the documented symptom.

## Before you are done

Run, and make them pass, for the spec you added:

```bash
npm run lint && npm run typecheck && npm run format:check && npm run test:local -- <spec> --repeat-each=3
```

`--repeat-each=3` proves the test is not flaky. On this machine the local run is chromium only.
Run these as written, without pipes or other commands chained in: this skill pre-approves `npm run`
commands only (also with `EXPOSE_KNOWN_BUGS=true`), and anything else waits for a person's approval,
or is denied in a headless run. Read code with Read, Grep and Glob, not with shell commands.
Report what you added, why each assertion is there, and the command output. If a new behaviour is a
known bug, say so and name the `SD-xxx` id.
