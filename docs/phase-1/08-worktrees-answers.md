# Module 8 answers: Worktrees and parallelism

Answers to the exercises and checkpoint in [08-worktrees.md](08-worktrees.md). Written by the mentor for later study. Runs are from this repo on 2026-10-24 and 2026-10-25, Claude Code v2.1.308, git 2.37, branch `learn/m08-worktrees`.

## Exercise A: inventory

A probe worktree created with `git worktree add .claude/worktrees/probe -b worktree-probe main`, the same layout `claude --worktree` uses.

**Inside the worktree:**

- Missing: `node_modules/`, `.env`, `CLAUDE.local.md`, `.auth/` (all gitignored).
- `npm run typecheck` and `npm run lint` **worked anyway**: Node resolves modules by walking up the directory tree, and a worktree nested in the repo finds the main checkout's `node_modules` (`@playwright/test` resolved to `<repo>/node_modules/...`). npm also puts the parent's `node_modules/.bin` on the path.
- `npm run test:local` stopped at once, before any browser started: `Invalid environment configuration: ✖ is required ... at SAUCE_PASSWORD`. The zod check in `src/config/env.ts` doing its job.

**In the main checkout, with the worktree present:**

- `git status` listed `?? .claude/worktrees/`.
- ESLint linted **126 files, 63 of them the worktree's copies**. Prettier reported the worktree's files as not ignored. `tsconfig.json` includes `**/*.ts`, so `tsc` type-checked them too.
- The proof that this matters: one unused variable added to `src/utils/pricing.ts` _in the worktree_ made the **main checkout's** `npm run lint` fail (`'halfFinished' is assigned a value but never used`). A parallel agent's work in progress breaks everyone else's gates, `/check` included.
- The main Claude session, after reading one file in the worktree, discovered the worktree's skills as directory-scoped duplicates (`.claude/worktrees/probe:write-test` and so on): extra descriptions in context on every later call.

## Exercise B: make worktrees usable and safe

**Exclude the folder from the main checkout's tools** (all verified with the probe present):

| Change                                         | Effect                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| `/.claude/worktrees/` in `.gitignore`          | `git status` clean; Prettier reports the files as ignored          |
| `.claude/worktrees/` in ESLint `globalIgnores` | 63 files linted, 0 in worktrees (flat config ignores `.gitignore`) |
| `.claude/worktrees` in `tsconfig.json` exclude | `tsc --listFilesOnly` lists 0 worktree files                       |

**Bring in what a worktree needs, with `.worktreeinclude`:**

- `.env`: without it no test can run. The harness copies it; no agent reads or writes it, so the CLAUDE.md rule still holds.
- `CLAUDE.local.md`: it holds this machine's rules (Chrome channel, the worker limit). Without it, a worktree agent would start the default four workers per run, and two agents would saturate the machine.
- Not `.auth/`: sessions expire after 10 minutes and the setup project regenerates them on every run.
- Not `node_modules/`: the parent resolves (see A). Run `npm ci` in a worktree only when its branch changes dependencies.
- Not `.claude/settings.local.json`: permission approvals are already shared through the main checkout's copy.

**Security: does the deny rule follow the copied `.env`?** Tested with a decoy file containing `DECOY_ONLY=not-a-secret`, never the real `.env`:

- Decoy at `.claude/worktrees/probe/.env` (inside the project): `Read` **denied** ("File is in a directory that is denied by your permission settings").
- Decoy in a directory outside the project (the shape of a sibling worktree such as `git worktree add ../x`): `Read` **allowed**; the content came back.

So `.worktreeinclude` is safe together with Claude Code's default nested location, and a copied `.env` in a sibling worktree escapes `Read(./.env)`. The `.worktreeinclude` comment records that dependency. Both decoys were deleted.

## Exercise C: two agents in parallel

**Setup:**

1. `claude -p --worktree m08-fix "Reply with the single word OK." --max-turns 1` and the same for `m08-cov`. Claude Code created both under `.claude/worktrees/` from `main`, **copied `.env` and `CLAUDE.local.md` into each** (checked by existence, not by reading), and left both **locked**, as documented for `-p` runs.
2. In `m08-fix`, changed `shopping-cart-badge` to `shopping-cart-count` in `src/components/header.component.ts` and committed it there (`chore: update header component`), so that worktree's `git status` was clean.
3. Started both at once, each with `--append-system-prompt "Another agent is running Playwright on this machine at the same time: pass --workers=1 to every test run."`, `dontAsk` with an allowlist, and `git` denied:
   - A: `claude -p --worktree m08-fix "/fix-test tests/e2e/inventory.spec.ts" --strict-mcp-config ...`
   - B: `claude -p --worktree m08-cov "/write-test cover the footer on a logged-in page: the three social links and the copyright line" --strict-mcp-config --mcp-config .mcp.json ...` with the Playwright browser tools it needs to verify selectors.

**Results:**

|                | A: fix loop (selector drift)                                                       | B: coverage (footer)                                                                 |
| -------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Outcome        | Test bug, stale selector; one line restored in the component, no assertion touched | 5 `@regression` tests, a `FooterComponent`, data in `messages.ts`, app model updated |
| Evidence cited | The page snapshot shows the badge with "1"; `docs/app-exploration.md:48`           | Live app via the Playwright MCP: test ids on the `<a>`, names, hrefs, `target`/`rel` |
| Verification   | Target 23/23 on repeat; lint, typecheck; six other badge specs, 55 passed          | 15/15 on repeat; lint, typecheck, format                                             |
| Cost           | 21 turns, $0.86, 574 s                                                             | 47 turns, $1.20, 363 s                                                               |

- **Time:** wall clock 576 s in parallel versus 943 s for the two runs back to back, **39% saved**. Both were slowed by sharing the machine: B's third repeat ran at 4.6 to 9.2 s per test instead of about 1.2 s while A's suite was running. Even at one worker each, contention is visible.
- **Isolation held:** every path A read or edited was under `.claude/worktrees/m08-fix/`, every path B touched under `m08-cov/`. Neither saw the other's files, and A's fix loop read its own `test-results/`.
- **The dangerous passes:** with the wrong selector, only 3 of the 6 inventory tests failed. Every `cartBadge.toBeHidden()` check passed, because a locator that matches nothing is always "hidden". Agent A spotted this without being asked and listed the other specs whose badge-absence checks had been vacuous. A stale selector does not only break tests; it can make negative assertions silently meaningless.
- **Leak:** A tried `git show cf209ab` (denied). The injected commit's message was in the `git status` snapshot of its session, which pointed it at the header. Committing the injection removed the dirty-file leak but created a commit-message leak; a neutral, unrelated message or a squashed base would close it.
- **Scope:** B went beyond the ask. It replaced `AppPage.footerCopy` with a `footer` component, updated the five visual masks, and edited `docs/app-exploration.md`. Reasonable design, but a wider review and conflict surface than "add a test".
- **The permission finding:** B ran `curl` (to download the app's JavaScript bundle and confirm where the copyright year comes from) and an env-prefixed `npm run`, although neither was on the allowlist. The `write-test` skill's `allowed-tools: ..., Bash` pre-approved all of Bash for the invoking turn. A, under the same flags, was refused an env-prefixed command, because `fix-test` pre-approves nothing. A skill's frontmatter can widen a headless allowlist; only the explicit `git` deny held for B.

Prediction check: parallel saved about 40%, not 50%, because of contention and unequal run lengths; neither agent saw the other's files; contention slowed runs but caused no timeouts at one worker each; the `toBeHidden()` tests were the ones that kept passing.

## Exercise D: integrate and clean up

- **Conflicts:** A changed only `src/components/header.component.ts`; B changed six other files. git 2.37 has no `merge-tree --write-tree`, so the legacy form was used: `git merge-tree $(git merge-base B A) B A` printed **0 conflict markers**.
- **What becomes a PR:** B's work is real coverage. It was reviewed (conventions, no leftover `footerCopy`), the full chromium suite was run in its worktree (98 passed), and it was committed on `test/footer-coverage` as its own PR (#22, CI green including the visual-baseline render). A's work only undid an injection, so it was discarded.
- **Cleanup:** both worktrees were locked by their `-p` runs. `git worktree unlock`, then `git worktree remove` (A needed `--force` for its uncommitted revert; B was clean, and the ignored `.env` copy did not count as unclean). A's branch held only the injection commit, inspected and then deleted with `git branch -D`. B's branch stays for its PR. Removing a worktree also deletes its `.env` copy.
- **An incident worth keeping:** to review B's diff, the mentor ran `cd .claude/worktrees/m08-cov && git diff` in the interactive session. The `cd` moved the session's working directory into the worktree, and the harness then said not to `cd` back to the main checkout. Work continued once Marko approved the move back. Use `git -C <path>` and absolute paths to look into another worktree.

## Checkpoint

**1. Two agents in one checkout: two ways it goes wrong.**
The test run reads the other agent's half-edited page object, so it fails, or passes, for reasons unrelated to its own change; a fix loop then "fixes" something that was never broken. And they share one index and `HEAD`: `git add -A` by one agent commits the other's unfinished work, a `git checkout` by one switches the files under the other, and both write the same `test-results/` and `.auth/`, so the evidence one agent reads may belong to the other's run.

**2. "SAUCE_PASSWORD is required" in a fresh worktree.**
`.env` is gitignored, so a new worktree, being a fresh checkout, does not have it, and `src/config/env.ts` stops every run. The fix is a `.worktreeinclude` listing `.env`: Claude Code copies it when it creates the worktree, so no agent reads or writes the file. Keep worktrees under `.claude/worktrees/`, where the `Read(./.env)` deny rule still covers the copy.

**3. The main checkout's lint fails on a file you never touched.**
A worktree nested in the repository was in scope for the main checkout's tools: ESLint does not read `.gitignore` in flat config, and `tsconfig.json` includes `**/*.ts`. Another agent's work in progress in `.claude/worktrees/` was being linted as part of your checkout. Exclude the folder in `.gitignore` (git and Prettier), in ESLint's global ignores, and in `tsconfig.json`'s `exclude`.

**4. Why `--workers=1` each for two agents, and what a fix loop does otherwise.**
This 8-thread machine saturates at about four Chrome workers (`CLAUDE.local.md`). Two agents at the default four workers each would start eight, and two at two each would be at the limit. Saturation makes tests time out. A fix loop reading those timeouts sees what looks like a flaky or slow test: it may stop and blame flakiness, or, without the guardrails, raise a timeout or add a wait. That is a test change made to fix a machine problem. The agent that starts the others owns the budget.

**5. Footer locators in `AppPage` versus a header component edit: conflict?**
No: they touch different files (`src/pages/app.page.ts` and `src/components/header.component.ts`), and the merge check printed no conflicts. They would conflict if both edited the same lines, for example if both changed the `AppPage` constructor (where the header, menu and footer are built), or both added an entry next to each other in a hot file such as `src/data/known-bugs.ts`, `src/data/messages.ts` or `docs/app-exploration.md`. Splitting parallel tasks by area keeps that rare; when it happens, the second PR rebases after the first merges.
