# Module 8: Worktrees and parallelism

Verified on 2026-10-24 against the Claude Code docs for v2.1.308 ("Run parallel sessions with worktrees", "Common workflows") and against two agents run in parallel in worktrees of this repo. Worked answers to the exercises and the checkpoint, with the run results, are in [08-worktrees-answers.md](08-worktrees-answers.md).

## 1. Concept

**Parallel agents need separate working trees.** Two agents in one checkout share one set of files, one git index, one `HEAD`, one `test-results/` and one `.auth/`. Their edits interleave, a test run picks up the other agent's half-written file, and `git add -A` commits someone else's work. The model is not the problem; the shared filesystem is.

**A git worktree is another working directory attached to the same repository.** It shares the object store, refs and config, and has its own files, index and `HEAD`. A branch can be checked out in only one worktree at a time. It is cheap: no clone and no network, just a checkout.

**What Claude Code adds:**

| Feature               | What it does                                                                                                                                                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `claude --worktree n` | Creates `.claude/worktrees/n/` on branch `worktree-n` and starts the session there. Base: the remote's default branch (`worktree.baseRef: "fresh"`) or your local `HEAD` (`"head"`). `"#123"` branches from a PR. |
| `.worktreeinclude`    | `.gitignore`-syntax list of **gitignored** files to copy into each new worktree, such as `.env`. Tracked files are never copied.                                                                                  |
| Subagent isolation    | `isolation: worktree` in an agent's frontmatter (or on the Agent tool) gives each run a temporary worktree, removed automatically if it made no changes.                                                          |
| Isolation enforcement | Inside a worktree, Claude Code refuses edits to the main checkout, commands whose working directory is the main checkout, and git redirected into it. It does not track what `cp` or a shell redirect writes.     |
| Cleanup               | On interactive exit, a clean worktree is removed and one with work prompts you. A `-p` run has no exit prompt: its worktree and lock stay until `git worktree unlock` and `git worktree remove`.                  |
| Shared state          | The `.git` directory, permission approvals (saved to the main checkout's `.claude/settings.local.json`), and untracked skills and agents read through from the main checkout.                                     |

**A fresh worktree is a fresh checkout,** so everything gitignored is missing. In this repo:

| Missing           | Effect                                                       | Fix                                                               |
| ----------------- | ------------------------------------------------------------ | ----------------------------------------------------------------- |
| `node_modules/`   | None here: a nested worktree resolves the parent's modules   | Run `npm ci` in the worktree when its branch changes dependencies |
| `.env`            | Every test run stops: `SAUCE_PASSWORD` is required           | `.worktreeinclude` copies it; the agent never reads it            |
| `CLAUDE.local.md` | The agent loses this machine's rules (channel, worker limit) | `.worktreeinclude` copies it                                      |
| `.auth/`          | None: the `setup` project logs in again on every run         | Nothing; per-worktree sessions are what you want                  |
| `test-results/`   | Each worktree has its own evidence                           | Nothing; that is isolation working                                |

**Nesting has a cost.** Worktrees under `.claude/worktrees/` sit inside the repository, so the main checkout's own tools see them: `git status` lists them, ESLint linted 63 duplicate files, Prettier checked them, and `tsc` (which includes `**/*.ts`) type-checked them. A parallel agent's half-finished file then fails the _main_ checkout's gates. Even the main Claude session picked up the worktree's skills as duplicates once it read a file there. The fix is to exclude the folder everywhere: `.gitignore` (which also covers Prettier), ESLint's global ignores, and `tsconfig.json`'s `exclude`.

## 2. Why it matters for QA

- **Stabilize and extend at the same time.** One agent fixes a red test while another adds coverage, each on its own branch that becomes its own PR. Without isolation, the fix loop reads evidence produced by the other agent's half-built test.
- **Local test state is per checkout.** `.auth/`, `test-results/` and the HTML report live in the working tree. Separate worktrees keep each agent's evidence clean, which the fix loop depends on (it reads `error-context.md` from its own `test-results/`).
- **Worktrees isolate files, not the system under test.** SauceDemo keeps the cart in the browser, so parallel runs cannot interfere on the server, and DummyJSON fakes its writes. Against a real backend with a shared database, parallel agents also need data isolation (their own accounts or tenants), which no worktree provides.
- **Cleaner experiments.** An injected failure committed inside its own worktree leaves that worktree's `git status` clean, which closes one of the Module 7 leaks.

## 3. Hands-on

Built in this module: `/.claude/worktrees/` in `.gitignore`, the folder in ESLint's global ignores and in `tsconfig.json`'s `exclude`, and a `.worktreeinclude` that copies `.env` and `CLAUDE.local.md`.

### Exercise A: inventory (your attempt first)

Create a worktree under `.claude/worktrees/`. Before running anything, predict: which files are missing, what fails first in `npm run test:local`, and what changes for the main checkout's `git status`, lint, format check and type check.

### Exercise B: make worktrees usable and safe

Decide how each missing file gets into a worktree (or why it should not), and stop the main checkout's tools from seeing worktrees. Then check the security side: `.worktreeinclude` puts a copy of `.env` somewhere new. Does the `Read(./.env)` deny rule still cover it? Test it with a decoy, never with the real file. Does the answer change for a worktree outside the repository?

### Exercise C: two agents in parallel (predict first)

Create two worktrees with `claude -p --worktree <name>`. In one, commit an injected selector drift (`shopping-cart-badge` to `shopping-cart-count` in the header component) and run `/fix-test tests/e2e/inventory.spec.ts`. In the other, run `/write-test` for the footer (social links and the copyright line). Start both at once, each told to use `--workers=1`.

Predict: how much wall time does running in parallel save over the sum of the two runs? Does either agent see the other's files? Do the test runs slow each other into timeouts? Which of the existing inventory tests still _pass_ with the wrong selector, and why is that dangerous?

### Exercise D: integrate and clean up

Check whether the two branches conflict (`git merge-tree`), decide which result becomes a PR, and remove the worktrees a `-p` run leaves locked behind.

## 4. Tradeoffs and pitfalls

- **Parallel speed versus the machine.** N agents times M workers each is the real Chrome count. Past the machine's limit, tests time out, and a fix loop reading those timeouts may classify a healthy test as flaky or "fix" it with a longer timeout. Whoever starts the agents owns the budget.
- **Parent `node_modules` is convenient and fragile.** A nested worktree resolves the main checkout's dependencies with no install. On a branch that changes `package.json`, it silently runs the wrong versions; install in that worktree.
- **Nested or sibling.** Nested (`.claude/worktrees/`, the default) keeps the copied `.env` under the project's deny rule and shares `node_modules`, but must be excluded from every tool. A sibling worktree (`git worktree add ../x`) is invisible to the main checkout's tools, but a `.env` copied there is outside the project's deny rule.
- **Review is the serial bottleneck.** Two agents produce two branches, and a person still reviews and merges each one. Parallelism helps only as far as review keeps up.
- **Hot files conflict.** `src/data/known-bugs.ts`, `src/fixtures/index.ts`, `docs/app-exploration.md` and the learning log are touched by most feature work. Split parallel work by area so two agents rarely share a file.
- **Headless worktrees linger.** A `-p` run leaves its worktree and lock behind; clean up deliberately, after harvesting the result.
- **A skill's `allowed-tools` widens a headless allowlist.** Both agents ran with the same `dontAsk` allowlist. The agent running `/write-test`, whose skill pre-approves `Bash`, ran `curl` and env-prefixed commands the allowlist did not name; the agent running `/fix-test`, which pre-approves nothing, was refused the same kind of command. Only an explicit `--disallowedTools` deny still held. For unattended runs, scope every skill's `allowed-tools` as tightly as the run's own allowlist.
- **`cd` is a move.** In an interactive session, a `cd` into a worktree moved the whole session's working directory there, and the harness then told the agent not to go back. Inspect other worktrees with `git -C <path>` and absolute paths instead.

## 5. Interview angle

- **"How do you run several coding agents on one repository without chaos?"** One worktree per agent and one branch per task, so files, index and test artifacts are isolated; copy only the gitignored files each needs; exclude the worktrees from the main checkout's tooling; budget shared resources (CPU, test workers, API cost); partition work by area to avoid conflicts; and keep a person reviewing each branch.
- **"What does a worktree isolate, and what not?"** Files, the index, `HEAD` and per-checkout artifacts. Not the git object store and refs, not gitignored files (they are missing until copied), not the machine's CPU, and not the system under test or its data.
- **"Two agents are done. How do you integrate their work?"** Check conflicts before merging (`git merge-tree`), open one PR per branch, run the full gates on each, and merge in an order that keeps `main` green.

## 6. Checkpoint

1. Two agents share one checkout; one runs the suite while the other edits a page object. Name two concrete ways that goes wrong.
2. A fresh worktree's test run stops with "SAUCE_PASSWORD is required". Why, and what fix keeps "agents never read or write `.env`" true?
3. The main checkout's `npm run lint` fails on a file you never touched. What happened, and how do you prevent it?
4. Why do two agents running tests at once on this machine need `--workers=1` each, and what does a fix loop do with the timeouts if they don't?
5. One branch adds footer locators to `AppPage`, the other edits the header component. Will they conflict? When would they?
