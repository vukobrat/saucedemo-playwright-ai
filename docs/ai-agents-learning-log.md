# AI Agents Learning Log

A running record of building this framework with Claude Code: what was built, the agentic concepts each step demonstrated, and interview notes. Newest entries are appended at the end of each phase.

Entry format: **Built** (what changed in the repo), **Concepts** (what the step taught), **Interview notes** (likely questions and how a strong answer sounds).

---

## Phase 0 - Framework, built agentically

### 2026-10-21 - Planning and live app exploration

**Built**

- Approved architecture plan (POM + components + fixtures, persona auth via `storageState`, known-bug markers, sharded CI in the Playwright container).
- Verified app model, later committed as `docs/app-exploration.md`.

**Concepts**

- **Plan mode is enforced by the harness, not by the prompt.** In plan mode the model can only read and explore; edits and side effects are blocked until the human approves. Asking "make a plan first" in a normal chat is only a request; plan mode is a hard gate.
- **MCP turns a browser into tools.** Playwright MCP exposes `browser_navigate`, `browser_snapshot`, `browser_evaluate`, `browser_run_code_unsafe` and others. The snapshot is the accessibility tree, which hides `data-test` attributes, so selectors were mapped with `browser_evaluate` against the DOM.
- **Batch tool calls.** One `run_code` script that probes six personas replaced dozens of click calls: fewer round trips, fewer permission prompts, less context consumed. Tradeoff: `browser_run_code_unsafe` executes arbitrary code in the MCP server process (RCE-equivalent), acceptable for a local, trusted session only.
- **Permission prompts are part of the loop.** Typing a note into a permission prompt counts as a denial, so the call never runs. Allow rules in settings remove repeated prompts for trusted tools.
- **Agent findings are hypotheses until verified.** The first multi-persona probe reused one browser page; leaked state made four personas look completely broken. Re-running with a fresh context per user showed the real, much narrower defects. Same principle as Playwright's per-test context isolation, and the reason triage agents need evals.
- **Verify versions against registries, not memory.** Findings: TypeScript 7 is out but `typescript-eslint` only supports `<6.1.0`; Node 24 officially needs macOS 13.5 (the binary still runs on 12.7); the Playwright docs CI example uses older action majors than the latest releases; the Docker tag was checked in the registry before being planned.

**Interview notes**

- _How do you stop an AI agent from inventing selectors?_ Give it a real browser through MCP, require verification on the live app before a locator is written, and record the verified selector map in a file the agent reads. In this repo two "obvious" locators (the menu `data-test` on an image, role queries inside an `aria-hidden` menu) would have failed.
- _What went wrong when you used an agent for exploration?_ The shared-page false positives above. A strong answer names the failure, the detection (results too broad to be plausible, re-verification), and the systemic fix (isolation, verify-before-report rule in CLAUDE.md).

### 2026-10-21 - Step 1: bootstrap

**Built** - `package.json` with exact pins, Node 24 via `.nvmrc`, strict `tsconfig.json`, `.gitignore`, MIT license.

**Concepts**

- Reproducibility starts before the first test: pinned runtime, pinned dependencies, lockfile.
- Playwright transpiles TypeScript but never type-checks it, so `tsc --noEmit` is a separate gate.

**Interview notes**

- _Why does a Playwright project need a separate typecheck step?_ Playwright runs tests even with type errors; only `tsc` catches them. In CI it runs in the quality job before any browser starts, which is cheaper than failing a test run.

### 2026-10-21 - Step 2: CLAUDE.md, shared settings, pinned MCP server

**Built** - `CLAUDE.md`, `docs/app-exploration.md`, this log, `.claude/settings.json`, and `.mcp.json` pinned to `@playwright/mcp@0.0.83` with `--isolated` and `--test-id-attribute=data-test`.

**Concepts**

- **CLAUDE.md is context, not configuration.** It is loaded into every session and followed probabilistically. Official guidance: keep each file under 200 lines; specific, concise rules are followed more consistently.
- **Memory scopes.** Managed (org), user (`~/.claude/CLAUDE.md`), project (`CLAUDE.md`), local (`CLAUDE.local.md`, gitignored), path-scoped rules in `.claude/rules/`, and nested `CLAUDE.md` files in subdirectories that load on demand when Claude works there. All are concatenated, not overridden.
- **Rules carry their reason.** "No `waitForTimeout`. Why: auto-retrying assertions are the defence against flakiness." The reason lets the agent generalize to cases the rule did not name, and lets humans prune stale rules.
- **Reference instead of `@import`.** `@path` imports load the whole file at launch, every session. The 150-line app model is referenced by plain path, so it costs context only when a task needs it.
- **Permissions are deterministic.** Evaluation order is deny, then ask, then allow, across every settings scope; an allow can never override a deny. Project allow rules only apply after workspace trust; deny and ask always apply. A `Read(./.env)` deny also blocks `cat .env` in Bash, but not a script that opens the file itself; OS-level sandboxing is the real boundary.
- **Encode team agreements as rules.** "The human merges PRs" is a `deny` on `gh pr merge`, not a sentence in a prompt. Editing CI workflows is an `ask`.
- **Supply-chain hygiene for agent tools.** `@playwright/mcp@latest` would run whatever was published last; pinning an exact version makes tool behavior reproducible and reviewable via Dependabot. `--isolated` keeps the MCP browser profile in memory so no session leaks between explorations.

**Interview notes**

- _CLAUDE.md, permissions or hooks: which do you use for what?_ CLAUDE.md for guidance and conventions (probabilistic). Permissions for capability boundaries per tool call (deterministic allow/ask/deny). Hooks for deterministic automation or validation with custom logic, for example running lint after every edit or blocking edits that delete assertions. Example from this repo: "ask before editing workflows" exists both as a CLAUDE.md rule and as an `ask` permission rule.
- _How do you keep an agent's context small in a large test repo?_ Short root CLAUDE.md, path-scoped rules for specific folders, reference large docs by path instead of importing them, and delegate exploration to subagents (Phase 1).

### 2026-10-21 - Step 3: ESLint, Prettier, Husky, lint-staged

**Built** - `eslint.config.mjs` (typescript-eslint strict type-checked, eslint-plugin-playwright, eslint-comments, Prettier compat), Prettier config, Husky pre-commit (lint-staged) and pre-push (typecheck).

**Concepts**

- **Move conventions from prose to mechanism.** CLAUDE.md says "no locators in specs, every test tagged, no hard waits"; ESLint now fails the commit when any of these is broken. Prose guides the agent; the linter catches it when guidance is ignored, for humans and agents alike.
- **Test your guardrails.** The config was validated with throwaway probe files containing deliberate violations: 14 out of 14 were reported, and a clean file passed, which also proved that describe-level tags satisfy `require-tags`. An unverified lint rule gives false confidence.
- **Close the escape hatches.** Agents tend to make a red check green by adding `eslint-disable`. `require-description` forces a written reason and `reportUnusedDisableDirectives` removes stale ones, so every suppression shows up in review.
- **Type-aware linting catches the most common Playwright bug.** `@typescript-eslint/no-floating-promises` flags a missing `await` on `page.goto()`, which otherwise causes races that look like flakiness.
- **Hooks give fast feedback, CI enforces.** Pre-commit lints only the staged files (seconds); pre-push runs the typecheck. Both can be bypassed with `--no-verify`, so CI repeats them as the real gate.

**Interview notes**

- _How do you enforce test conventions across a team, or across agents?_ Encode them as lint rules with clear messages, verify the rules with negative examples, run them in pre-commit and again in CI, and require written reasons for suppressions.
- _Why `no-floating-promises` in a Playwright repo?_ A missing `await` lets the test continue before the action finishes. The result is intermittent failures that get misdiagnosed as flakiness and "fixed" with retries or timeouts instead of the actual missing `await`.

### 2026-10-21 - Safety layers in practice: rewriting git history

**What happened** - The first commits were made with the wrong git identity (a global work email). Fixing them required rewriting history and force-pushing `main`.

**Concepts**

- **Auto mode has an independent classifier.** In auto mode, a separate classifier reviews risky actions. It blocked both the history rewrite and the force push as "Git Destructive", even though the request was legitimate. The agent stopped and handed the exact commands to the human instead of looking for a loophole.
- **Layered guardrails.** Three independent layers covered the same risk: the project `deny` rule on force pushes, the auto-mode classifier, and `--force-with-lease` (refuses to overwrite remote work it has not seen). Any one of them failing still leaves the others.
- **Identity is configuration, not habit.** A repo-local `user.email` (the GitHub noreply address of the right account) fixes attribution for every future commit, independent of global git config.

**Interview notes**

- _Would you let an agent force-push or rewrite history?_ No. Destructive, outward-facing operations stay with a human. The agent prepares and verifies the change locally (same tree hash, correct authors), then hands over the exact commands. In this repo that is enforced by a deny rule plus the auto-mode classifier, not by trust.

### 2026-10-21 - Step 4: typed env config and Playwright config

**Built** - `src/config/env.ts` (zod schema, `process.loadEnvFile()`, frozen typed `env` object), `.env.example`, `playwright.config.ts` (fullyParallel, CI-only retries and `forbidOnly`, blob+github reporters on CI, `retain-on-failure` traces/videos, `data-test` as test id, chromium/firefox/webkit projects).

**Concepts**

- **Fail fast, with a message a human or agent can act on.** Missing `SAUCE_PASSWORD` stops the run before any browser starts and says which variable and how to fix it. Each failure path (missing, empty, invalid URL, invalid boolean) was triggered on purpose to check the message.
- **Precedence by design.** `process.loadEnvFile()` never overrides existing variables (verified with a probe), so CI secrets and shell exports always beat a stray local `.env`. No `dotenv` dependency needed on Node 22+.
- **Single point of access.** Only `src/config/env.ts` reads `process.env`; everything else imports a typed, frozen object. Typos become compile errors instead of silent `undefined`.
- **Agents and secrets.** The `Read(./.env)` deny rule also blocks Claude from writing `.env`, so a human creates it. The agent works from `.env.example`, which documents every variable without values.
- **Config grows with the code.** Only the browser projects exist now; setup, a11y, visual and api projects arrive with the steps that need them, so the config never points at code that does not exist.

**Interview notes**

- _How do you manage environments and secrets in a test framework?_ One typed config module validated at startup (zod), an `.env.example` as documentation, real secrets only from the CI secret store or local untracked files, explicit precedence (environment over file), and no URLs or credentials anywhere else in the code.
- _Why `trace: 'retain-on-failure'` instead of `'on-first-retry'`?_ With `on-first-retry`, only the second attempt is recorded: the original failure never has a trace, a flaky test that passes on retry leaves a trace of the passing run (which shows nothing wrong), and a run without retries has no trace at all. Recording always and keeping only failures guarantees evidence for the first failure, which is what triage (human or agent) needs. The cost is some recording overhead on every test.

### 2026-10-21 - Step 5: quality CI workflow

**Built** - `.github/workflows/ci.yml` with a `quality` job: `npm ci`, lint, format check, typecheck, on pull requests, pushes to `main` and manual dispatch.

**Concepts**

- **CI runs the same commands as a developer.** Every step is an npm script, so a red CI check reproduces locally with one command. The full sequence was run locally from a clean `npm ci` before pushing.
- **Supply-chain hardening.** Actions are pinned to full commit SHAs (a tag like `@v7` can be repointed, as in the 2025 `tj-actions` compromise), the workflow token is read-only (`permissions: contents: read`), and the job has a timeout.
- **Concurrency.** A new push to a PR cancels the outdated run; runs on `main` are never cancelled, so every merge gets a complete result.
- **Lint the pipeline too.** `actionlint` statically checks workflow syntax, expressions and embedded shell before the first push, which is cheaper than debugging in CI.
- **CI changes need a human.** `.github/workflows/**` is on the project's `ask` list, so an agent cannot change the pipeline silently, and the PR review is the second check.

**Interview notes**

- _How do you secure a GitHub Actions pipeline?_ Least-privilege `GITHUB_TOKEN` per workflow or job, SHA-pinned third-party actions kept current by Dependabot, secrets only in the jobs that need them, no secrets for pull requests from forks, timeouts and concurrency limits, and branch protection that requires the checks to pass.

### 2026-10-21 - Step 6: page objects, components, fixtures and test data

**Built** - Typed data layer (`users`, `products` in integer cents, `sort-options` with an expected-order function, verbatim `messages`, `CustomerBuilder`), helpers (`pricing`, `seed`), components (header, side menu, product card, cart item), seven page objects on `BasePage`/`AppPage`, and fixtures (`pages`, seeded `faker`) merged into one `test` exported from `@fixtures`. Plus a platform fix: `BROWSER_CHANNEL` and `RECORD_VIDEO`, because Playwright 1.64 ships no browsers or ffmpeg for macOS 12.

**Concepts**

- **Verify, then write.** Before writing a single page object, one batched MCP probe resolved every planned locator on the live app and returned match counts. It found four differences from the plan (product links are `role="button"`, the page title is outside the header, the close-menu trap, the sort `aria-label`).
- **Observation is not diagnosis.** The probe also proved one of my own "verified" facts wrong: the side menu had no `link` roles because the items are `<a role="button">`, not because of `aria-hidden` (that reading was taken mid-animation). The original observation was correct; the explanation was not. Triage agents will make exactly this mistake, which is why the eval in Phase 1 scores the classification and reasoning, not just "it failed".
- **Role locators carry state.** Because the closed menu is `aria-hidden`, `getByRole('button', { name: 'Logout' })` matches only an open menu: `click()` waits for it and `toBeHidden()` means closed. The test-id locator reports off-screen items as visible, so it would give false confidence.
- **Prove the abstraction end to end.** A throwaway spec drove every page object through a full purchase in system Chrome and derived every expectation from the data layer (`sortProducts`, `orderTotals`), so the helpers were validated against the real app, not just type-checked. A second run confirmed the faker seed and generated customer are identical.
- **Discover platform constraints early.** Installing browsers revealed that Playwright 1.64 dropped macOS 12. The fix is explicit configuration (`BROWSER_CHANNEL=chrome`, `RECORD_VIDEO=false`) instead of OS auto-detection, so CI behavior stays obvious.
- **Guardrails apply to the agent too.** ESLint rejected an unnecessary `eslint-disable` I wrote (`reportUnusedDisableDirectives`).

**Interview notes**

- _`data-test` ids or role locators?_ Roles first for interactive controls, because they test what users and assistive tech see and they respect `aria-hidden` (the side menu example). Test ids for data and structure, and where the accessible name is ambiguous (two "View details" buttons per card). Never CSS classes or DOM position. Verify both kinds on the live app.
- _How do you make random test data reproducible?_ A faker instance per test seeded from a stable hash of the test id, with the seed recorded as an annotation. Data differs across tests, but a rerun of the same test uses the same data.
- _Where do assertions go in a page object model?_ In specs, so the intent of each test is readable. The one exception is a navigation guard (`expectLoaded()`), which every page transition needs and which carries no test-specific intent.

### 2026-10-21 - Step 7: persona auth setup and login specs

**Built** - `setup` project that logs in each persona through the UI and saves `storageState` to `.auth/`; a `persona` fixture option (`test.use({ persona: 'problem' })`, `null` for logged out) that overrides the built-in `storageState`; `login.spec.ts` (happy path, five data-driven rejections, dismissible error, protected-route redirect) and `session.spec.ts` (every persona's saved session, logout ends the session); npm test scripts.

**Concepts**

- **Authenticate once, reuse everywhere.** Five UI logins per run instead of one per test. Sessions are browser-independent, so the setup project runs in one browser and feeds all of them.
- **Scope timeouts to where they are justified.** `performance_glitch_user` needs about 5.1 s to log in. Only the setup project gets a 15 s `expect` timeout; specs keep the default so slowness stays visible where it is a bug.
- **Verify framework claims empirically.** The docs say dependencies run even under filters; a `--grep @smoke` run confirmed the setup project still runs. `--repeat-each=5` on the smoke tests found no flakiness (15/15).
- **Configure the linter to understand the abstraction.** `expect-expect` did not recognise `inventoryPage.expectLoaded()` as an assertion; `assertFunctionPatterns: ['^expect']` teaches it the project convention instead of disabling the rule.

**Interview notes**

- _How do you handle authentication in a large Playwright suite?_ A setup project logs in once per role and saves `storageState`; a fixture option selects the role per test or describe block; login itself is tested by a small set of specs that start logged out. Mind session lifetime (here 10 minutes), so setup runs on every invocation and every CI shard.
- _How do you test login negatives without duplicating code?_ A typed table of `{ scenario, username, password, error }` and one parametrised test; error strings come from a constants module copied verbatim from the app.
