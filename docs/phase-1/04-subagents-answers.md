# Module 4 answers: Subagents

Answers to the exercises and checkpoint in [04-subagents.md](04-subagents.md). Written by the mentor for later study. Runs are from this repo on 2026-10-23, Claude Code v2.1.308, branch `learn/m04-subagents`, each agent run as its own session with `--agent <name>`.

## Exercise A: scope each agent

The principle is least privilege: give each agent the smallest tool set that lets it do its one job, and the cheapest model that does it well.

| Agent                | `model`   | `tools`                                                                                           | Why                                                                                                                                    |
| -------------------- | --------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `triage`             | `inherit` | `Read, Grep, Glob, Bash, mcp__qa__find_known_bug, mcp__qa__list_ci_runs, mcp__qa__analyze_ci_run` | Classification is judgment, so the full model. It is the only agent that needs the `qa` server, and `Bash` only as a fallback to `gh`. |
| `flaky-investigator` | `inherit` | `Read, Grep, Glob, Bash`                                                                          | Needs `Bash` to run the suite repeatedly; deciding flaky vs real from traces is judgment. No `qa` tools.                               |
| `locator-reviewer`   | `haiku`   | `Read, Grep, Glob`                                                                                | A rule-driven scan against a fixed list, so a cheap model suffices. Read-only: a reviewer must not edit.                               |
| `test-gap-analyzer`  | `inherit` | `Read, Grep, Glob`                                                                                | Reasoning over the app model vs coverage wants a strong model. Read-only: it reports, never writes.                                    |

- **Read-only** are the two reviewers (`locator-reviewer`, `test-gap-analyzer`): no `Bash`, no `Write`, no `Edit`. They physically cannot change a test to make it pass.
- **Needs the `qa` server:** only `triage`. Giving it to the others would waste their description budget and blur delegation.
- **Cheap model pays off** on `locator-reviewer` (match code against explicit rules) and would be a false economy on `triage` and `test-gap-analyzer`, where a weak model misclassifies or misses gaps.
- **Omitting `tools` entirely** makes the agent inherit every tool available to subagents, including `Write`, `Edit` and `Bash`. A "reviewer" would then be able to edit code, and a triage agent would hold a general shell. The allowlist is the guardrail; leaving it off removes it.

## Exercise B: the four agents

Written to `.claude/agents/{triage,flaky-investigator,locator-reviewer,test-gap-analyzer}.md`. Each `description` is specific enough to route to it alone and says "use proactively / when ..."; each body ends with an explicit output format, because the report is all the caller gets. The four descriptions together are a few hundred tokens, well inside the 15,000-token budget.

Design choices worth noting:

- The bodies encode the repo's verified facts so the agent does not re-derive them: `triage` is told the known personas and that `events.backtrace.io` 401s are noise; `locator-reviewer` is told the verified selector exceptions **not** to flag; `flaky-investigator` is told `performance_glitch_user`'s slowness is a known bug, not flakiness; `test-gap-analyzer` is pointed at `docs/app-exploration.md` as the inventory.
- Every body forbids the cheat path in its own words (no weakening assertions, no editing to reproduce), reinforced by the read-only `tools` on the reviewers.

## Exercise C: verify headlessly

Each agent was run as its own session. Results:

**`test-gap-analyzer`** (3 tools, read-only, no MCP): read `docs/app-exploration.md`, globbed `tests/**` and `src/**`, read all 18 specs and the data files, then grepped for each feature. Verdict below (Exercise D).

**`triage`** against the real CI run 40003269955:

- **First run, `--agent triage --permission-mode dontAsk`, no `--allowedTools`:** every `mcp__qa__*` call and the `gh` fallback were **denied**. The agent reported honestly that it could not reach the CI results and listed the three tools it was blocked on. This is the lesson: the `tools` frontmatter made the qa tools _available_, but `dontAsk` denies any call that would otherwise prompt, and MCP tools prompt by default.
- **Second run, same plus `--allowedTools "mcp__qa__analyze_ci_run" "mcp__qa__list_ci_runs" "mcp__qa__find_known_bug"`:** it called `analyze_ci_run(40003269955)`, got `{regressions: 0, flaky: 0, knownBugExpected: 3}`, and concluded **"not a regression; 3 known bugs expected to fail, so the run is green."** It added that the PR gate only covers `@smoke` on chromium/a11y/visual, so a clean result there does not cover the full suite. One `gh` `Bash` call was denied (I did not allow `Bash`), and the agent simply used the qa tools instead, which is the read-only path we want.

The permission layer and the tool-scope layer are independent. In an interactive session the second run's tools would surface as prompts the user answers; in headless they must be pre-approved.

**`locator-reviewer`** (`--agent locator-reviewer`, read-only): ran on `claude-haiku-5-5` with 3 tools, read all 13 files under `src/pages` and `src/components` plus `.claude/rules/pages.md`, and flagged a real judgment call that lint cannot make: `login(username: string, password: string)` takes raw strings against the "methods take typed data" rule, while noting the JSDoc reason and recommending the deviation be recorded in `pages.md` if intended. It did **not** flag the verified selector exceptions. A cheap model handled the rule-based review well.

**`flaky-investigator`** (`--agent flaky-investigator`, `Bash` pre-approved) on the stable test `an empty cart shows no items and no badge` with repeat 3: ran `npm run test:local -- ... --repeat-each=3 --workers=2`, got **3 passed / 0 failed**, and returned "stable, no failure reproduced", with the caveat that 3 runs is a quick check not a proof, and the note that `performance_glitch_user`'s 5.9 s setup login is its known slowness (SD-301/302), not flakiness. A broad `Bash` command it first tried (`BROWSER_CHANNEL=... npm run ...`) was denied because the allowlist was `Bash(npm run test:local *)`; it adapted to the allowed form.

## Exercise D: the planted gap

Prediction: `test-gap-analyzer` should rank the **Dynamic Catalog** first. It is the one feature `docs/app-exploration.md` names and then marks "(currently untested)", it has three routes (Lazy Load, Spinner, Slider), and a grep for it hits only docs, never `src/` or `tests/`.

Result: it ranked the Dynamic Catalog **#1**, with exactly that evidence: the app-model lines (39, 49, 141-149), a case-insensitive search for `dynamic|lazy-load|spinner|slider|sentinel` matching only docs, no page object, and `SideMenuComponent` carrying no Dynamic Catalog locator. It also confirmed the suite is otherwise strong (all eight exact messages asserted, every catalogue entry carrying a `knownBug()` test) and recommended mapping the selectors with the Playwright MCP first. The small eval passed: the agent found the planted gap on evidence, not a guess.

## Checkpoint

**1. How much of a 5 MB report reaches the main conversation, and why it matters.**
Only the subagent's final report, a few hundred tokens. The 5 MB, the forty file reads and the twenty turns of reasoning all stay in the subagent's own context window and are discarded when it returns. That is the reason to delegate: the main conversation never pays the context cost of the raw material, so it stays small and on-task through a long session (Module 2). A main agent that `cat`-ed the report itself would spend most of its window before it could reason.

**2. Why `analyze_ci_run` was denied despite being in `tools`, and two fixes.**
The `tools` field controls which tools the subagent _can_ reach; it is not a permission grant. `--permission-mode dontAsk` auto-denies any call that would otherwise prompt, and MCP tools prompt by default, so the call was denied. Two ways through: pre-approve the tools for the run (`--allowedTools "mcp__qa__analyze_ci_run" ...`, or a `permissions.allow` rule in settings), or run interactively so the user answers the prompt. Scope and permission are separate layers; satisfying one does not satisfy the other.

**3. Where `model: haiku` fits and where it is a false economy.**
Fits `locator-reviewer`: matching code against an explicit rule list is mechanical, and the run confirmed haiku did it well. A false economy on `triage` and `test-gap-analyzer`, where the work is judgment (classifying a failure, reasoning over coverage) and a weaker model misclassifies or misses gaps, which costs far more than the tokens saved. `flaky-investigator` also wants the stronger model, since reading traces to name a cause is judgment. Downgrade only after measuring that quality holds.

**4. Why read-only `tools` beats "do not edit tests" in the prompt.**
A prompt instruction is guidance the model can misread, forget after compaction, or be talked out of by a confusing situation; it is not enforced. Omitting `Write` and `Edit` from the `tools` allowlist makes editing impossible: the tools are not in the agent's set, so there is nothing to call. For a reviewer whose whole value is an independent read, that removes the most expensive failure mode, an agent "fixing" a red test by weakening it (Module 7), structurally rather than by persuasion.
