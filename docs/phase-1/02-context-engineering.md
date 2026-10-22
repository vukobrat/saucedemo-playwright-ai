# Module 2: Context engineering

Verified against the Claude Code docs for v2.1.306 (Oct 2026): "How Claude remembers your project", "Explore the context window", "Hooks reference" (InstructionsLoaded) and "Tools reference". Rules, the InstructionsLoaded payload and shell reads re-checked on v2.1.308.

## 1. Concept

The context window is everything the model sees on a call. It is rebuilt and re-sent on **every** model call, so whatever sits in it is paid for every turn.

**What fills it:**

| Loaded    | What                                                                                                                                | When                                               |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Always    | System prompt, tool definitions (MCP tools as deferred names), skill descriptions                                                   | Session start                                      |
| Always    | `CLAUDE.md` files from the working directory up to the root, `CLAUDE.local.md`, unscoped `.claude/rules/*.md`, files they `@import` | Session start                                      |
| Always    | Auto-memory index `MEMORY.md` (first 200 lines or 25 KB) and the git status snapshot                                                | Session start                                      |
| On demand | Path-scoped rules (`paths:` frontmatter) and nested `CLAUDE.md` in subdirectories                                                   | When Claude reads, writes or edits a matching file |
| Growing   | Your prompts, Claude's answers, **tool results** (file contents, command output, logs)                                              | Every turn                                         |

**Memory scopes.** Managed (organization), user (`~/.claude/CLAUDE.md`, `~/.claude/rules/`), project (`CLAUDE.md` or `.claude/CLAUDE.md`, `.claude/rules/`), local (`CLAUDE.local.md`, gitignored, per worktree). They are concatenated from the filesystem root down, not overridden. Auto memory is separate: notes Claude writes itself, per repository, shared across worktrees.

**A path-scoped rule loads** when Claude uses Read, Write or Edit on a matching file, or views one matching file with `cat`, `nl`, `bat`/`batcat`, `head`, `tail`, `sed -n 'X,Yp'`, `grep` (`egrep`, `fgrep`) or `rg`, with no pipes or redirects. A search that prints no matches, any other command on the file (`wc`, `npx playwright test tests/e2e/login.spec.ts`) and a recursive `grep -r` do not load it. Exercise C verifies this with `grep`, `grep -r`, a pipe and `wc`.

**Compaction.** Near the limit (or on `/compact`), the conversation is replaced by a summary. Afterwards:

| Re-injected from disk                                                                  | Back only on demand                                                                                                    | Summarized away                                                   |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Project-root CLAUDE.md, unscoped rules, auto memory, skill descriptions, the plan file | Path-scoped rules, nested CLAUDE.md (when a matching file is touched again); up to 5 recently edited files are re-read | Instructions given only in chat, tool results, earlier rule loads |

**Subagents protect the main context.** A subagent works in its own context window; only its summary comes back. Reading a 5 MB HTML report or a long CI log there costs your session a few hundred tokens instead of everything (Module 4).

**Measured in this repo** (clean environment, one-word answer): the first call is 27,872 tokens with the project scope and 23,315 without, so the original 12,000-character `CLAUDE.md` cost about 4,600 tokens on every call. After the split in this module it costs about 2,500. The 15,700-character app model in `docs/app-exploration.md` is referenced by path, not `@import`ed, so it costs nothing until a task reads it.

## 2. Why it matters for QA

- **Test artifacts are huge.** HTML reports, traces, CI logs and full spec files dwarf any instruction file. An agent that `cat`s a report has spent its context before it starts reasoning. Grep, summarize, or delegate the reading to a subagent.
- **Conventions must be present exactly when they matter.** Locator rules are essential while editing a page object and noise while answering a question about CI. Path-scoped rules give both.
- **Long fix loops compact.** A rule you gave only in chat ("don't touch the assertions") disappears after compaction. Guardrails belong in the root CLAUDE.md, which is re-injected.
- **Machine-specific facts mislead others.** "Use `BROWSER_CHANNEL=chrome`" is true on one macOS 12 laptop and wrong in CI or for a contributor. Shared instructions should only contain shared truths.

## 3. Hands-on

Tooling:

- `npm run context:budget` lists every instruction file, when it loads, and each CLAUDE.md section's share.
- `npm run agent:trace -- <file>` now also reads `--output-format json` results.

Run the commands **in a plain terminal, not through a Claude session**. A `claude -p` started by another Claude session inherits its environment (`CLAUDECODE=1`, the entrypoint, the effort level), which changes the context size; that is why runs started from different places reported 28,700 and 40,700 tokens for similar tasks.

### Exercise A: measure (predict first)

Prediction: what share of the first call's context is this repo's `CLAUDE.md`? Then:

```bash
claude -p "Reply with the single word OK." --permission-mode dontAsk --disallowedTools "mcp__*" \
  --output-format json < /dev/null > traces/m2-with-project.json
claude -p "Reply with the single word OK." --setting-sources user,local --permission-mode dontAsk --disallowedTools "mcp__*" \
  --output-format json < /dev/null > traces/m2-without-project.json
npm run agent:trace -- traces/m2-with-project.json
npm run agent:trace -- traces/m2-without-project.json
npm run context:budget
```

`--setting-sources user,local` leaves out the project scope (its CLAUDE.md, rules and settings), so the difference between the two runs is what the project costs per call.

### Exercise B: design the split (your attempt first)

Using `npm run context:budget`, decide for **each `##` section of CLAUDE.md**, and for each bullet of `## Commands`, where it belongs:

1. **Root CLAUDE.md:** needed in almost every task, or must survive compaction (guardrails).
2. **Path-scoped rule** in `.claude/rules/<name>.md` with `paths:` globs: only relevant when working on certain files. Name the globs.
3. **`CLAUDE.local.md`:** true only on your machine.
4. **A docs file** referenced by path: long procedures needed rarely.
5. **Delete:** stale or duplicated.

Send the proposal as a short list. I will review it, implement it, and measure the result.

### Answers to Exercises A and B (reference, written by the mentor on request)

**Exercise A: results.** Measured with a clean environment (`env -i`, equivalent to a plain terminal):

| Run                                                    | First-call context                   |
| ------------------------------------------------------ | ------------------------------------ |
| With project scope                                     | 27,872 tokens                        |
| Without project scope (`--setting-sources user,local`) | 23,315 tokens                        |
| **Cost of the project scope (mostly CLAUDE.md)**       | **4,557 tokens, 16% of the context** |

The same pair launched from inside a VS Code Claude session measured 40,701 vs 36,183: the base grows by 12,800 tokens with the inherited environment, the project's cost stays the same. `npm run context:budget` shows where the 12,082 characters of CLAUDE.md go: `## Commands` 34%, `## Locators` 11%, `## Architecture` 10%, `## Writing tests` 9%, `## Guardrails` 9%, `## Known application bugs` 7%. That is about 2.7 characters per token, not the 4 a rule of thumb assumes.

Side finding: two runs that "produced no output" were not Claude Code failures. A zsh script kept `--setting-sources user,local` in an unquoted variable; zsh does not word-split it, so the CLI received one invalid argument. Write flags out literally (or use an array) in zsh.

**Exercise B: proposed split.** The deciding question is not the topic but **when the rule must be in context**:

- Path-scoped rules load only when Claude **reads or edits** a matching file. Rules about **running** things (test commands, git, hooks) and rules that must **survive compaction** (guardrails) therefore stay in the root CLAUDE.md.
- Rules about **editing** one part of the codebase move to a path-scoped rule for that part.

| Current content                                                                                                                                                        | Destination                                                                                          | Why                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `## Project`                                                                                                                                                           | Root                                                                                                 | Needed in every task; points to the app model.                                                                                                        |
| Commands: `nvm use`, `.env` setup (agents never read or write `.env`)                                                                                                  | Root, shortened                                                                                      | Every task may run something; the `.env` rule is a guardrail.                                                                                         |
| Commands: macOS 12 browsers (`BROWSER_CHANNEL`, `RECORD_VIDEO`), `--workers=2` on the Intel Mac, Docker not available locally                                          | `CLAUDE.local.md`                                                                                    | True only on the maintainer's machine; wrong in CI and for contributors.                                                                              |
| Commands: the list of npm test scripts, typecheck, lint, format, Husky (never `--no-verify`), "never invent a script"                                                  | Root, one line each                                                                                  | Run from the shell, which never loads path-scoped rules.                                                                                              |
| Commands: setup project runs every time; `--no-deps` only with fresh `.auth/`                                                                                          | Root                                                                                                 | About running tests, so it must be present without a file read.                                                                                       |
| Commands: `test:api` details (typed clients, `parseBody`)                                                                                                              | `.claude/rules/api.md` with `src/api/**`, `tests/api/**`                                             | Only relevant when writing API code.                                                                                                                  |
| Commands: visual baselines procedure                                                                                                                                   | `.claude/rules/visual.md` with `tests/visual/**`                                                     | Only relevant when touching visual tests or baselines.                                                                                                |
| Commands: Docker scripts, `check:versions` (upgrade Playwright and the image together), "CI runs only npm scripts", pipeline, required check names, SHA-pinned actions | `.claude/rules/ci.md` with `.github/**`, `Dockerfile`, `.dockerignore`, `package.json`, `scripts/**` | Only relevant when changing CI, the image or dependencies. `package.json` is included so a Playwright upgrade loads the "upgrade both together" rule. |
| Commands: "More scripts are added to this list as each framework step lands"                                                                                           | Delete                                                                                               | Stale since Phase 0 ended.                                                                                                                            |
| `## Architecture`                                                                                                                                                      | Root                                                                                                 | Any change needs the map; prevents duplicate abstractions.                                                                                            |
| `## Page objects and components`, `## Locators` (with the verified traps and "verify with MCP first")                                                                  | `.claude/rules/pages.md` with `src/pages/**`, `src/components/**`                                    | Locators exist only there; lint already bans them in specs.                                                                                           |
| `## Writing tests`, `## Known application bugs`                                                                                                                        | `.claude/rules/tests.md` with `tests/**`, `src/fixtures/**`, `src/data/known-bugs.ts`                | Needed when writing or editing specs, fixtures or the bug catalogue.                                                                                  |
| `## Guardrails for agents`                                                                                                                                             | Root                                                                                                 | Must survive compaction and apply to every task.                                                                                                      |
| `## Definition of done`, `## Git`                                                                                                                                      | Root                                                                                                 | Commits and checks happen through the shell in every task.                                                                                            |

A flaw found while classifying: one bullet in `## Commands` mixed three concerns (visual baselines, the Intel Mac worker count, and general test flags). Mixed bullets are a sign that a file has grown by appending.

Expected effect: the root CLAUDE.md shrinks from about 12,000 to about 6,500 characters, saving roughly 2,000 tokens on every call, while the moved rules still load exactly when their files are touched. Exercise C verifies the second half of that claim.

### Result of the split (2026-10-22)

Implemented as proposed, with four refinements found while moving the text:

- **The running-vs-editing test applies per sentence, not per bullet.** "Never update visual baselines locally" is about running a script (`test:visual:update` is in `package.json`), so it stays in the root; only the baseline procedure moved to `visual.md`.
- **New root rule: change files with Read, Edit and Write, not `sed -i` or redirection.** A shell write never loads the matching rule, and agents are allowed to edit through the shell.
- **`--workers=2` belongs to every local run, not to visual tests.** `playwright.config.ts` sets no `workers`, so Playwright starts four on the 8-thread Mac, and visual tests skip on macOS anyway. The mixed bullet had hidden a wrong placement, not just a long one.
- **`src/utils/known-bug.ts` joined the `tests.md` globs**, next to the catalogue it serves.

Nothing was lost in the move: the 13 lines of the old file that do not appear verbatim in the new files were checked by hand; all are merges or rewrites, plus the one stale sentence deleted. Prettier rewrote the `paths:` quotes to single quotes (the repo's `singleQuote` also applies to YAML frontmatter); both are valid YAML. `CLAUDE.local.md` is gitignored and holds three bullets: the macOS 12 browser switches, `--workers=2`, and no Docker on this machine.

Re-measured with the Exercise A method. Each configuration ran twice, and both runs gave identical counts:

| First-call context                                   | Before                            | After           |
| ---------------------------------------------------- | --------------------------------- | --------------- |
| All scopes                                           | 27,872                            | 26,259          |
| Without project (`--setting-sources user,local`)     | 23,315                            | 23,714          |
| User scope only (`--setting-sources user`)           | 23,315 (no `CLAUDE.local.md` yet) | 23,329          |
| **Project scope** (all scopes minus without project) | **4,557 (16%)**                   | **2,545 (10%)** |
| `CLAUDE.local.md` (without project minus user only)  | -                                 | 385             |

- **2,012 tokens saved on every call** for CI and contributors, as predicted. On the maintainer's machine `CLAUDE.local.md` adds 385 back, so the net saving there is 1,627.
- **Almost all of the project scope's cost is the CLAUDE.md text.** 12,082 characters cost 4,557 tokens and 6,703 cost 2,545: the same 2.6 characters per token, and a line through both points has a fixed part of only about 40 tokens.
- **A moved rule costs nothing until it loads, and about as much as before when it does.** Loading `tests.md` costs 855 tokens, measured with a temporary unscoped copy of its body (27,114 vs 26,259). All five rules together are 6,305 characters, about 2,500 tokens; a typical task touches one or two areas.

### Exercise C: prove the rules load (after the split)

An `InstructionsLoaded` hook logs every instruction file that loads and why. Predict which files each run loads, then:

```bash
HOOK='{"hooks":{"InstructionsLoaded":[{"hooks":[{"type":"command","command":"cat >> traces/instructions.jsonl; echo >> traces/instructions.jsonl"}]}]}}'
claude -p "Summarize README.md in one sentence." --settings "$HOOK" \
  --permission-mode dontAsk --allowedTools "Read" --disallowedTools "mcp__*" < /dev/null
claude -p "Read tests/e2e/login.spec.ts and list the conventions it must follow." --settings "$HOOK" \
  --permission-mode dontAsk --allowedTools "Read" --disallowedTools "mcp__*" < /dev/null
cat traces/instructions.jsonl
```

Then probe the shell boundary. Only Bash is available, so the agent cannot fall back to Read:

```bash
claude -p "Run exactly this command and nothing else, then report its output: grep -n expect tests/e2e/login.spec.ts" \
  --settings "$HOOK" --permission-mode dontAsk --allowedTools "Bash(grep *)" \
  --disallowedTools "mcp__*" "Read" "Grep" "Glob" < /dev/null
```

Repeat with `grep -n waitForTimeout tests/e2e/login.spec.ts` (no matches), `grep -rn expect tests/e2e` (recursive) and `wc -l tests/e2e/login.spec.ts` (`--allowedTools "Bash(wc *)"`). Move `traces/instructions.jsonl` aside after each run so every run has its own log.

**Predictions (written before the runs):**

| Run                                         | Expected loads                                                                                                                                                                      |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 Read `README.md`                         | `CLAUDE.md` (Project) and `CLAUDE.local.md` (Local), both `session_start`. No rule matches `README.md`. The auto-memory index is not a CLAUDE.md or rules file, so no event for it. |
| C2 Read `tests/e2e/login.spec.ts`           | The same two, plus `tests.md` with `path_glob_match`, `trigger_file_path` the spec. `pages.md` only if the agent follows an import into `src/pages/`.                               |
| C3 `grep -n expect` on the spec (9 matches) | The same two, plus `tests.md`: grep on one file with output counts as a read.                                                                                                       |
| C4 `grep -n waitForTimeout` on the spec (0) | Only the two `session_start` loads: a search that prints nothing does not count as a read.                                                                                          |
| C5 `grep -rn expect tests/e2e`              | Only the two `session_start` loads: recursive, not one file.                                                                                                                        |
| C6 `wc -l` on the spec                      | Only the two `session_start` loads: `wc` is not in the list of viewing commands, so it stands in for "running a command on the file", like `npx playwright test`.                   |

**Results (2026-10-22).** Every prediction held. A seventh run was added afterwards to separate what the agent saw from how it saw it:

| Run        | What the trace shows                                      | Loaded                                                 | Prediction                                      |
| ---------- | --------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------- |
| C1         | One Read of `README.md`                                   | `CLAUDE.md`, `CLAUDE.local.md` (`session_start`)       | Held                                            |
| C2         | One Read of the spec, no imports followed                 | Both, plus `tests.md` (`path_glob_match`, by the spec) | Held; no `pages.md`, because no import was read |
| C3         | `grep -n expect` on the spec: 9 lines, 504 characters     | Both, plus `tests.md`                                  | Held                                            |
| C4         | `grep -n waitForTimeout` on the spec: no output           | Session start only                                     | Held                                            |
| C5         | `grep -rn expect tests/e2e`: 111 lines from 9 specs       | Session start only                                     | Held                                            |
| C6         | `wc -l` on the spec                                       | Session start only                                     | Held                                            |
| C7 (added) | C3's command piped through `cat`: the same 504 characters | Session start only                                     | The pipe alone prevents the load                |

What the runs showed:

- **Whether a rule loads depends on how the agent touched the file, not on what it saw.** C3 and C7 put the same 504 characters of the spec into context; only C3 got the test conventions. C5 saw parts of nine specs and got none. An agent that diagnoses a failure with recursive greps and test runs works without the test rules until it opens a file, which is why the guardrails stay in the root and file changes go through Read, Edit and Write.
- **The rule arrives mid-conversation.** In the C2 session transcript, the root CLAUDE.md is an `instructions` attachment before the first model call; `tests.md` is a `nested_memory` attachment right after the Read result, before the second call. That is message history, which is why compaction can summarize it away. The agent noticed: its answer began "Reading the spec loaded the path-scoped rule `.claude/rules/tests.md`".
- **The hook reports normalized globs.** `tests/**` arrives as `"tests"` in `globs`, so a script must not compare the payload with the frontmatter text.
- **No event for auto memory.** `MEMORY.md` loads at session start but is neither a CLAUDE.md nor a rule, so the hook does not see it.
- **Turn-to-turn context growth is not a measuring tool.** C7's second call grew more than C3's although no rule loaded. Its first call was 744 tokens smaller because one MCP server was still `pending` at start, and its instructions arrived mid-run. MCP servers connect even when `mcp__*` tools are disallowed (Module 1), and they change the context. Single-call runs gave identical numbers every time, so all costs in this module come from those.

The hook runs asynchronously, so each run waited one second before moving its log. The 15 runs of the re-measurement and Exercise C cost $1.84.

### Exercise D (optional, interactive)

In an interactive session: run `/context` to see the breakdown, `/memory` to see which memory files are loaded, then `/compact focus on <topic>` and `/context` again. Which entries shrank, and which came back?

## 4. Tradeoffs and pitfalls

- **Path-scoped rules are not durable.** They live in message history, so compaction summarizes them away until a matching file is touched again. Anything that must hold for the whole session (guardrails, git rules) stays in the root CLAUDE.md.
- **Shell-only work skips rules.** Running tests or a recursive grep does not count as reading a file, so an agent that never opens a spec may never load the test rules. In Exercise C, two runs put the same 504 characters of a spec into context; only the one without a pipe loaded the test rules.
- **Fragmentation has a cost.** Ten small rule files are harder to keep consistent than one; contradictions between them make the model pick one at random. Split by real boundaries (tests, page objects, API, CI), not by topic for its own sake.
- **`@import` is convenient and eager.** An imported file loads at launch on every call; reference large documents by path instead.
- **`CLAUDE.local.md` is per worktree.** A gitignored local file exists only in the worktree where it was created; to share personal instructions across worktrees, import a file from your home directory.
- **Memory can be wrong.** Auto memory is written by the model; review it like code. A stale memory is followed as confidently as a correct one.
- **Measure, do not estimate.** A characters-divided-by-four estimate put this CLAUDE.md at about 3,000 tokens; the measured difference was about 4,600. Markdown full of paths, flags and backticks tokenizes at 2.2 to 2.7 characters per token here. The before and after measurements put the fixed overhead of the project scope at only about 40 tokens, so almost all of the cost is the text itself.

## 5. Interview angle

- **"Your agent follows the conventions at first but ignores them later in a long session. Why, and what do you do?"** Instructions given in chat or loaded with a path-scoped rule are summarized away when the context compacts. Durable rules go in the root CLAUDE.md, which is re-injected after compaction; long sessions are split with `/clear` between tasks; large reads go to subagents so compaction happens less.
- **"How do you keep an agent's context small in a large test repository?"** A short root CLAUDE.md with only cross-cutting rules and guardrails, path-scoped rules for tests, page objects, API and CI, large reference docs linked rather than imported, no ambient MCP servers for focused tasks, and logs or reports grepped or read by a subagent. Measure the per-call cost before and after.
- **"CLAUDE.md, rules, memory, skills: what goes where?"** CLAUDE.md: always-true project conventions and guardrails. Path rules: conventions for one part of the codebase. Auto memory: facts the agent learned about working with you. Skills: step-by-step procedures loaded only when invoked (Module 5).

## 6. Checkpoint

1. After `/compact`, which instructions are guaranteed to be back, and which return only on demand?
2. A rule has `paths: ["tests/**"]`. Does it load when the agent runs `npx playwright test tests/e2e/login.spec.ts`? When it runs `grep -n expect tests/e2e/login.spec.ts`? Why?
3. Where do these belong, and why: "never weaken assertions"; the visual-baseline update procedure; "my Mac needs `BROWSER_CHANNEL=chrome`"; the 150-line app model?
4. What did measuring show that estimating did not?
