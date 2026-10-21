# CLAUDE.md

Project memory for Claude Code and any agent working in this repo. Keep it under 200 lines. Every rule states why it exists: rules with reasons are followed more reliably and are easier to prune when the reason no longer applies.

## Project

Playwright + TypeScript test framework for https://www.saucedemo.com (Swag Labs), plus an API test layer against https://dummyjson.com (SauceDemo has no public backend API). This is a public portfolio repo: code must read like production enterprise work.

The verified app model (users, routes, selectors, exact messages, catalog, known defects) is in `docs/app-exploration.md`. Read it before writing or changing tests. It is referenced here, not imported, so it costs context only when a task needs it.

## Commands

- `nvm use` - selects Node 24 from `.nvmrc`. Why: CI and the Playwright Docker image run Node 24.
- Setup: `cp .env.example .env` and fill in the values (a human does this; agents never read or write `.env`). `src/config/env.ts` validates it with zod at startup and names any missing or invalid variable. Shell and CI variables override `.env`.
- Local browsers: Playwright 1.64 ships no browsers or ffmpeg for macOS 12. There, set `BROWSER_CHANNEL=chrome` and `RECORD_VIDEO=false` and run only `--project=chromium`; Firefox and WebKit run in CI (Linux). Why: the maintainer's machine is macOS 12, and a test run that cannot start is not a test failure.
- `npm test` - all projects (CI, Docker). `npm run test:local` - chromium only, the default on a dev machine. `npm run test:smoke` / `test:regression` / `test:persona` - by tag. `npm run test:a11y` - axe gate (zero WCAG 2.2 AA violations) on every page state; PRs run it with smoke.
- Visual regression: `npm run test:visual` compares against Linux baselines in `tests/visual/__screenshots__/` and skips on other platforms. To change baselines, never run `--update-snapshots` locally: dispatch the "Visual baselines" workflow (it also runs on PRs touching `tests/visual/`), download its `visual-baselines` artifact, inspect every image, and commit them in the PR. Why: CI must not approve its own screenshots, and only Linux renders match CI. On the maintainer's 8-thread Intel Mac, add `-- --workers=2`: four local Chrome workers saturate the machine and cause timeouts that are not test failures. `npm run test:headed`, `npm run test:ui`, `npm run report`. Pass Playwright flags after `--`, e.g. `npm run test:local -- tests/e2e/login.spec.ts`.
- Every run starts with the `setup` project (logs in each persona, about 8 s), also under `--grep`. Never run specs with `--no-deps` unless `.auth/` is fresh (sessions expire after 10 minutes).
- `npm run docker:build` then `SAUCE_PASSWORD=... npm run test:docker -- <playwright flags>` - the suite in the official Playwright image (Linux, all browsers). Not available on macOS 12; CI proves it via `.github/workflows/docker.yml`.
- `npm run check:versions` - `@playwright/test` in package.json and node_modules must equal the Dockerfile image tag. Why: CI picks its container image from the Dockerfile, and a mismatch leaves no usable browsers. Upgrade both together, never one.
- `npm run typecheck` - `tsc --noEmit`. Why: Playwright transpiles TypeScript without type checking, so type errors only surface here.
- `npm run lint` / `npm run lint:fix` - ESLint with type-aware and Playwright rules, zero warnings allowed. Why: most conventions in this file are enforced here, not just written down.
- `npm run format` / `npm run format:check` - Prettier.
- Git hooks (Husky): pre-commit runs lint-staged on staged files, pre-push runs the typecheck. Never bypass them with `--no-verify`. Why: they are the cheapest place to catch a broken commit.
- CI (`.github/workflows/ci.yml`) runs exactly these npm scripts. Never put checks in a workflow that have no npm script equivalent; the only workflow logic is planning which suite and shard count to run. Why: anything CI checks must be reproducible locally with one command.
- Pipeline: quality job (lint, format, typecheck, versions, plan) then sharded tests in the Playwright container, a "Playwright tests" gate, merged HTML report (artifact), and Pages publishing from `main`. PRs and `main`: `@smoke` on chromium, 2 shards. Nightly 02:00 UTC and manual dispatch: everything, 4 shards. "Lint, format and typecheck" and "Playwright tests" are required checks on `main`; do not rename those jobs.
- Actions are pinned to full commit SHAs with a `# vX.Y.Z` comment. Why: tags can be moved to malicious code; SHAs cannot.

More scripts (lint, format, test suites) are added to this list as each framework step lands. Never invent a script that is not in `package.json`.

## Architecture (where code goes)

- `src/config/` - typed, zod-validated env config. The only code that reads `process.env`. Why: one source of truth, fail fast on bad config.
- `src/data/` - users, product catalog, messages, builders. Why: no magic strings in specs.
- `src/components/` - shared UI (header with cart badge, side menu, product card, cart item), each scoped to a root locator.
- `src/pages/` - one page object per route: locators and intent methods.
- `src/fixtures/` - fixtures that inject page objects, persona auth and API clients. Specs import `test` and `expect` from `@fixtures` only.
- `src/api/` - DummyJSON clients and zod response schemas.
- `src/utils/` - small pure helpers (pricing, known bugs, auth state paths).
- Pages extend `BasePage` (routed screen, `expectLoaded()`) or `AppPage` (adds header, side menu, title). Test data with randomness comes from builders fed the per-test `faker` fixture, which is seeded from the test id. Import across folders through the tsconfig aliases (`@fixtures`, `@data/*`, `@pages/*`, `@components/*`, `@utils/*`, `@config/*`).
- `tests/{setup,e2e,personas,a11y,visual,api}/` - specs only, no raw locators.

Why: a predictable map prevents duplicate abstractions when several agents or people add code in parallel.

## Page objects and components

- Pages expose `readonly` locators and intent methods (`addToCart(product)`), not assertions. The only exception is `expectLoaded()`. Why: assertions stay visible in the spec, and pages stay reusable for positive and negative tests.
- Methods take typed data (`Product`, `Customer`), not raw strings. Why: compile-time safety and one place to change data.
- No retries, `if` branches or try/catch in page objects to "handle" broken UI. Why: that hides real bugs; we want them visible.

## Locators

Priority: `getByRole` with an accessible name for interactive controls, then `getByTestId` (configured to `data-test`) for structure and data, then `getByText` or `getByLabel` for content. Never CSS classes, XPath or `nth()` without a comment explaining why. Why: classes and DOM position change with styling; roles and test ids are a contract.

Verified exceptions, do not "fix" these back:

- Open/close menu: `getByRole('button', { name: 'Open Menu' })` / `'Close Menu'`. The `open-menu` and `close-menu` test ids sit on `<img>` elements covered by the buttons, so clicking them times out.
- Side menu items are `<a role="button">`: use `getByRole('button', { name: 'Logout' })`, not `link`. Role locators only match while the menu is open, which is what we want; the test ids report closed items as visible.
- Product card "View details" links: both image and title are `role="button"` with the same name; use the `item-<id>-title-link` test id.
- Products: address them by name through the product card component, not by slug-built ids such as `add-to-cart-sauce-labs-backpack`.

Before adding a locator, verify it on the live app with the Playwright MCP server (`browser_snapshot`, `browser_evaluate`, `ariaSnapshot()`), and check the cause, not just the symptom. Why: never assume a selector; this app has several traps, and one of them was first documented with the wrong cause.

## Writing tests

- Web-first assertions only (`await expect(locator).toHaveText(...)`). No `waitForTimeout`, no `force: true`, no manual `isVisible()` polling. Why: auto-retrying assertions are the main defence against flakiness.
- Every test carries a suite tag: `@smoke` (critical path, PR gate), `@regression`, `@persona`, `@a11y`, `@visual` or `@api`. Why: CI selects suites by tag.
- Logged-in tests reuse `storageState` through the `persona` fixture option (default `standard`; `test.use({ persona: 'problem' })`). Only login specs log in through the UI, with `test.use({ persona: null })`. Why: speed, and the session cookie has a 10-minute TTL that the setup project refreshes on every run.
- Derive expected values from typed data (catalog prices, `pricing.ts`); never hardcode totals. Why: one fact, one place.
- Tests are independent: no order dependencies, no shared mutable state. Why: `fullyParallel` and sharding run them in any order on any worker.
- Deep links (`/inventory.html`, `/cart.html`) return HTTP 404 while the SPA renders correctly. Do not assert on the navigation response status.

## Known application bugs

Personas `problem_user`, `error_user`, `performance_glitch_user` and `visual_user` have deliberate defects (catalogued in `docs/app-exploration.md`). Test the correct behavior and call `knownBug(KNOWN_BUGS.<entry>)` (`src/utils/known-bug.ts`) as the first line of the test. It marks the test as expected to fail and adds a `known-bug` annotation. Every defect gets one entry with a stable `SD-xxx` id in `src/data/known-bugs.ts`; never pass an ad hoc object. After adding a marker, run the test with `EXPOSE_KNOWN_BUGS=true` and confirm it fails on the documented symptom, not on something else. Why: the suite stays green while the bug exists and turns red when it is fixed, forcing the marker to be removed. `EXPOSE_KNOWN_BUGS=true` disables the marker to produce real failures with traces (eval data for triage agents).

## Guardrails for agents

- Never weaken a test to make it pass: do not delete or loosen assertions, swap a specific matcher for a vaguer one, raise timeouts blindly, or add `skip`, `fixme` or `knownBug` without evidence. If the app is wrong, it is a known bug; if the test is wrong, fix the test and explain why. Why: false greens are the most expensive failure mode of agentic fix loops.
- Diagnose before fixing: read the error, trace and screenshot, reproduce, then classify the failure (product bug, test bug, environment, flaky). Why: guessed fixes are usually wrong fixes.
- Verify agent findings before reporting them. Why: during exploration a shared browser page leaked state and made four personas look broken; a fresh context per user proved otherwise.
- Ask before changing Playwright `projects` or `.claude/settings.json`; CI workflow changes are reviewed in the PR. Never read `.env`. Why: these affect every run and every contributor, or leak credentials.
- No URLs or credentials outside `src/config/`. Why: environments and secrets must be swappable, and this repo is public.

## Definition of done

`npm run typecheck`, `npm run lint` and `npm run format:check` pass, and the affected specs pass locally. Fix lint errors at the cause; an `eslint-disable` needs a `-- reason` and is a review topic. New behavior comes with a test. Why: CI should confirm quality, not discover problems.

## Git

- Conventional Commits (`feat:`, `fix:`, `test:`, `chore:`, `ci:`, `build:`, `docs:`), one logical step per commit, imperative mood. Why: the history is part of the portfolio and must be reviewable.
- Work on feature branches and open PRs with `gh`. Never merge PRs and never push to `main`; the human reviews and merges. Why: a human stays in the loop for everything that lands.
- Do not use the em dash character in code, docs or commit messages; use a regular hyphen. Why: house style.
