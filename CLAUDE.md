# CLAUDE.md

Project memory for Claude Code and any agent working in this repo. Keep it under 200 lines and limited to what almost every task needs. Every rule states why it exists: rules with reasons are followed more reliably and are easier to prune when the reason no longer applies.

Conventions for one part of the codebase are path-scoped rules in `.claude/rules/` that load when a matching file is read or edited: `pages.md` (page objects, components, locators), `tests.md` (specs, fixtures, known bugs), `api.md`, `visual.md` and `ci.md` (workflows, Docker, dependencies). Change files with the Read, Edit and Write tools, not `sed -i` or shell redirection. Why: a shell write does not load the matching rule, so its conventions would be missing exactly while the file changes.

## Project

Playwright + TypeScript test framework for https://www.saucedemo.com (Swag Labs), plus an API test layer against https://dummyjson.com (SauceDemo has no public backend API). This is a public portfolio repo: code must read like production enterprise work.

The verified app model (users, routes, selectors, exact messages, catalog, known defects) is in `docs/app-exploration.md`. Read it before writing or changing tests. It is referenced here, not imported, so it costs context only when a task needs it.

## Commands

- `nvm use` - selects Node 24 from `.nvmrc`. Why: CI and the Playwright Docker image run Node 24.
- Setup: `cp .env.example .env`, filled in by a human; agents never read or write `.env`. `src/config/env.ts` validates it with zod at startup and names any missing or invalid variable. Shell and CI variables override `.env`.
- Tests: `npm test` (all projects; CI, Docker), `npm run test:local` (chromium only, the default on a dev machine), `test:smoke` / `test:regression` / `test:persona` (by tag), `test:a11y` (zero WCAG 2.2 AA violations on every page state; PRs run it with smoke), `test:api` (DummyJSON, needs `API_USERNAME`/`API_PASSWORD`; nightly, not in the PR gate, because the API is a third party), `test:visual` (Linux baselines, skips elsewhere), `test:headed`, `test:ui`, `report`. Pass Playwright flags after `--`, e.g. `npm run test:local -- tests/e2e/login.spec.ts`.
- Never update visual baselines locally (`--update-snapshots`, `test:visual:update`); they come from the "Visual baselines" workflow. Why: CI must not approve its own screenshots, and only Linux renders match CI.
- Every run starts with the `setup` project (logs in each persona, about 8 s), also under `--grep`. Never run specs with `--no-deps` unless `.auth/` is fresh (sessions expire after 10 minutes).
- `npm run docker:build` then `SAUCE_PASSWORD=... npm run test:docker -- <playwright flags>` - the suite in the official Playwright image (Linux, all browsers).
- `npm run typecheck` - `tsc --noEmit`. Why: Playwright transpiles TypeScript without type checking, so type errors only surface here.
- `npm run lint` / `npm run lint:fix` - ESLint with type-aware and Playwright rules, zero warnings allowed. Why: most conventions in these rules are enforced here, not just written down.
- `npm run format` / `npm run format:check` - Prettier. `npm run check:versions` - Playwright package equals the Dockerfile image tag.
- Git hooks (Husky): pre-commit runs lint-staged on staged files, pre-push runs the typecheck. Never bypass them with `--no-verify`. Why: they are the cheapest place to catch a broken commit.
- Parallel work: one `claude --worktree <name>` per agent, under `.claude/worktrees/` (excluded from git, lint and tsc); `.worktreeinclude` copies `.env` and `CLAUDE.local.md` in. Agents running tests at the same time share the machine's worker budget. Why: agents in one checkout overwrite each other's files, index and test results.
- `npm run agent:triage -- <run-id>` / `npm run agent:review -- <pr-number>` - the CI agents (nightly triage, `ai-review` label), run locally with `gh` and a Claude login. Why: an agent result in CI must be reproducible with one command, like any check.
- `npm run eval:triage` - the triage agent on the golden set in `evals/triage/`, gated (`-- --repeat 3` for consistency, `--judge` for an evidence check). `eval:triage:build` rebuilds the set from real runs (no model calls); review its labels before committing. `npm run eval:triage:runs` replays whole CI runs through the nightly triage's own command (`eval:triage:runs:build` rebuilds their reports; a CI run's report can only be fetched for 14 days). `npm run eval:fix-loop` grades `/fix-test` on what it changes (needs browsers and credentials; run it before changing the skill). Why: an agent change is only an improvement if the eval says so.
- Never invent a script that is not in `package.json`.

## Architecture (where code goes)

- `src/config/` - typed, zod-validated env config. The only code that reads `process.env`. Why: one source of truth, fail fast on bad config.
- `src/data/` - users, product catalog, messages, builders. Why: no magic strings in specs.
- `src/components/` - shared UI (header with cart badge, side menu, product card, cart item), each scoped to a root locator.
- `src/pages/` - one page object per route: locators and intent methods.
- `src/fixtures/` - fixtures that inject page objects, persona auth and API clients. Specs import `test` and `expect` from `@fixtures` only.
- `src/api/` - DummyJSON clients, zod response contracts (one per endpoint), verbatim error messages.
- `src/utils/` - small pure helpers (pricing, known bugs, auth state paths).
- `src/mcp/` - the `qa` MCP server (SDK v2, stdio): read-only tools over the known-bug catalogue and CI results. Run with `npm run mcp:qa`; launched via `.mcp.json`. Imports the catalogue from `@data/known-bugs`, never duplicates it.
- Pages extend `BasePage` (routed screen, `expectLoaded()`) or `AppPage` (adds header, side menu, title). Test data with randomness comes from builders fed the per-test `faker` fixture, which is seeded from the test id. Import across folders through the tsconfig aliases (`@fixtures`, `@data/*`, `@pages/*`, `@components/*`, `@utils/*`, `@config/*`).
- `tests/{setup,e2e,personas,a11y,visual,api}/` - specs only, no raw locators.
- `evals/triage/` - eval data: code states and runs (`config.json`), the reviewed golden set (`golden.json`), and whole-run cases (`run-cases.json`) with their saved reports (`reports/`); the tooling is in `scripts/eval/`. Never let an evaluated agent see these files: the runner removes them from its checkout.

Why: a predictable map prevents duplicate abstractions when several agents or people add code in parallel.

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
