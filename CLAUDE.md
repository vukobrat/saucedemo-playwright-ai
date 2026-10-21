# CLAUDE.md

Project memory for Claude Code and any agent working in this repo. Keep it under 200 lines. Every rule states why it exists: rules with reasons are followed more reliably and are easier to prune when the reason no longer applies.

## Project

Playwright + TypeScript test framework for https://www.saucedemo.com (Swag Labs), plus an API test layer against https://dummyjson.com (SauceDemo has no public backend API). This is a public portfolio repo: code must read like production enterprise work.

The verified app model (users, routes, selectors, exact messages, catalog, known defects) is in `docs/app-exploration.md`. Read it before writing or changing tests. It is referenced here, not imported, so it costs context only when a task needs it.

## Commands

- `nvm use` - selects Node 24 from `.nvmrc`. Why: CI and the Playwright Docker image run Node 24.
- Setup: `cp .env.example .env` and fill in the values (a human does this; agents never read or write `.env`). `src/config/env.ts` validates it with zod at startup and names any missing or invalid variable. Shell and CI variables override `.env`.
- `npm run typecheck` - `tsc --noEmit`. Why: Playwright transpiles TypeScript without type checking, so type errors only surface here.
- `npm run lint` / `npm run lint:fix` - ESLint with type-aware and Playwright rules, zero warnings allowed. Why: most conventions in this file are enforced here, not just written down.
- `npm run format` / `npm run format:check` - Prettier.
- Git hooks (Husky): pre-commit runs lint-staged on staged files, pre-push runs the typecheck. Never bypass them with `--no-verify`. Why: they are the cheapest place to catch a broken commit.

More scripts (lint, format, test suites) are added to this list as each framework step lands. Never invent a script that is not in `package.json`.

## Architecture (where code goes)

- `src/config/` - typed, zod-validated env config. The only code that reads `process.env`. Why: one source of truth, fail fast on bad config.
- `src/data/` - users, product catalog, messages, builders. Why: no magic strings in specs.
- `src/components/` - shared UI (header with cart badge, side menu, product card, cart item), each scoped to a root locator.
- `src/pages/` - one page object per route: locators and intent methods.
- `src/fixtures/` - fixtures that inject page objects, persona auth and API clients. Specs import `test` and `expect` from `@fixtures` only.
- `src/api/` - DummyJSON clients and zod response schemas.
- `src/utils/` - small pure helpers (pricing, known bugs, auth state paths).
- `tests/{setup,e2e,personas,a11y,visual,api}/` - specs only, no raw locators.

Why: a predictable map prevents duplicate abstractions when several agents or people add code in parallel.

## Page objects and components

- Pages expose `readonly` locators and intent methods (`addToCart(product)`), not assertions. The only exception is `expectLoaded()`. Why: assertions stay visible in the spec, and pages stay reusable for positive and negative tests.
- Methods take typed data (`Product`, `Customer`), not raw strings. Why: compile-time safety and one place to change data.
- No retries, `if` branches or try/catch in page objects to "handle" broken UI. Why: that hides real bugs; we want them visible.

## Locators

Priority: `getByRole` with an accessible name for interactive controls, then `getByTestId` (configured to `data-test`) for structure and data, then `getByText` or `getByLabel` for content. Never CSS classes, XPath or `nth()` without a comment explaining why. Why: classes and DOM position change with styling; roles and test ids are a contract.

Verified exceptions, do not "fix" these back:

- Open menu: `getByRole('button', { name: 'Open Menu' })`. `data-test="open-menu"` sits on an `<img>` covered by the button, so clicking it times out.
- Side menu links: `getByTestId('logout-sidebar-link')` and siblings. The menu wrapper keeps `aria-hidden="true"` while open, so role queries find nothing.
- Products: address them by name through the product card component, not by slug-built ids such as `add-to-cart-sauce-labs-backpack`.

Before adding a locator, verify it on the live app with the Playwright MCP server (`browser_snapshot`, `browser_evaluate`). Why: never assume a selector; this app already has two traps.

## Writing tests

- Web-first assertions only (`await expect(locator).toHaveText(...)`). No `waitForTimeout`, no `force: true`, no manual `isVisible()` polling. Why: auto-retrying assertions are the main defence against flakiness.
- Every test carries a suite tag: `@smoke` (critical path, PR gate), `@regression`, `@persona`, `@a11y`, `@visual` or `@api`. Why: CI selects suites by tag.
- Logged-in tests reuse `storageState` through the `persona` fixture option. Only login specs log in through the UI. Why: speed, and the session cookie has a 10-minute TTL that the setup project refreshes on every run.
- Derive expected values from typed data (catalog prices, `pricing.ts`); never hardcode totals. Why: one fact, one place.
- Tests are independent: no order dependencies, no shared mutable state. Why: `fullyParallel` and sharding run them in any order on any worker.
- Deep links (`/inventory.html`, `/cart.html`) return HTTP 404 while the SPA renders correctly. Do not assert on the navigation response status.

## Known application bugs

Personas `problem_user`, `error_user`, `performance_glitch_user` and `visual_user` have deliberate defects (catalogued in `docs/app-exploration.md`). Test the correct behavior and mark the defect with `knownBug({ id, summary })` from `src/utils/known-bug.ts`, which calls `test.fail()` and adds an issue annotation. Why: the suite stays green while the bug exists and turns red when it is fixed, forcing the marker to be removed. `EXPOSE_KNOWN_BUGS=true` disables the marker to produce real failures with traces (eval data for triage agents).

## Guardrails for agents

- Never weaken a test to make it pass: do not delete or loosen assertions, swap a specific matcher for a vaguer one, raise timeouts blindly, or add `skip`, `fixme` or `knownBug` without evidence. If the app is wrong, it is a known bug; if the test is wrong, fix the test and explain why. Why: false greens are the most expensive failure mode of agentic fix loops.
- Diagnose before fixing: read the error, trace and screenshot, reproduce, then classify the failure (product bug, test bug, environment, flaky). Why: guessed fixes are usually wrong fixes.
- Verify agent findings before reporting them. Why: during exploration a shared browser page leaked state and made four personas look broken; a fresh context per user proved otherwise.
- Ask before changing `.github/workflows/`, Playwright `projects`, or `.claude/settings.json`. Never read `.env`. Why: these affect every run and every contributor, or leak credentials.
- No URLs or credentials outside `src/config/`. Why: environments and secrets must be swappable, and this repo is public.

## Definition of done

`npm run typecheck`, `npm run lint` and `npm run format:check` pass, and the affected specs pass locally. Fix lint errors at the cause; an `eslint-disable` needs a `-- reason` and is a review topic. New behavior comes with a test. Why: CI should confirm quality, not discover problems.

## Git

- Conventional Commits (`feat:`, `fix:`, `test:`, `chore:`, `ci:`, `build:`, `docs:`), one logical step per commit, imperative mood. Why: the history is part of the portfolio and must be reviewable.
- Work on feature branches and open PRs with `gh`. Never merge PRs and never push to `main`; the human reviews and merges. Why: a human stays in the loop for everything that lands.
- Do not use the em dash character in code, docs or commit messages; use a regular hyphen. Why: house style.
