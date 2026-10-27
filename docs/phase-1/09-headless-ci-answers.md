# Module 9 answers: Headless runs and CI

Answers to the exercises and checkpoint in [09-headless-ci.md](09-headless-ci.md). Written by the mentor for later study. Runs are from this repo on 2026-10-25 to 2026-10-27, Claude Code v2.1.308, branch `learn/m09-headless-ci` (PR #25), with throwaway probes on PR #26 and the scratch branch `scratch/m09-failing-run`, both deleted afterwards.

## Exercise A: the contract

`scripts/schemas/triage-report.schema.json`, required fields only, no extra properties allowed:

- `runId`, and `verdict` as an enum: `green` (no failure needs an owner action), `needs-attention`, `infrastructure` (the run broke before tests could report), `inconclusive`. "Green" is about owner actions, not about zero failures: a nightly with 80 expected `knownBug()` failures is green.
- `expectedKnownBugFailures` as its own integer, so the expected failures are counted, not hidden and not mistaken for regressions.
- `failures`: one entry **per cause**, not per test (the same broken constant fails two tests), each with `tests`, `category` (the five triage categories), optional `knownBugId`, `evidence` (the one line that decides the category) and `action` (what the owner does next). That is everything a person needs at 09:00 without opening the logs.
- The review schema is the same idea: `verdict`, `summary`, and `findings` with `file`, `line`, `severity` (`must-fix`, `should-fix`, `judgment`), `rule` (named after `.claude/rules/pages.md`), `message` and optional `suggestion`.

**When the script fails instead of reporting:** whenever `structured_output` is missing or `is_error` is true. A capped, refused or crashed run must turn the job red, never become an empty "nothing found" report. `runHeadless` throws in exactly that case, and the workflow's report steps then have nothing to post.

## Exercise B: the flags

| Flag                | Triage                                        | Review                                                     |
| ------------------- | --------------------------------------------- | ---------------------------------------------------------- |
| `--tools`           | `Read,Grep,Glob`                              | `Read,Grep,Glob`                                           |
| MCP                 | `--strict-mcp-config` with only the qa server | `--strict-mcp-config`, none                                |
| `--allowedTools`    | the three `mcp__qa__*` tools                  | none needed                                                |
| `--permission-mode` | `dontAsk`                                     | `dontAsk`                                                  |
| `--model`           | `claude-sonnet-5-5` (pinned)                  | `claude-haiku-5-5` (the agent's own model)                 |
| Caps                | 25 turns, $3                                  | 15 turns, $1                                               |
| Instructions        | `.claude/agents/triage.md` body, appended     | `.claude/agents/locator-reviewer.md` body, appended        |
| Extra               | none                                          | `--setting-sources user`; no `GH_TOKEN` in its environment |

**The `--agent` prediction, measured.** Minimal probes, each `claude -p "Return x set to 1." --output-format json --json-schema '{...x: integer...}'`:

| Extra flag                  | `structured_output` |
| --------------------------- | ------------------- |
| none                        | `{"x":1}`           |
| `--tools "Read,Grep,Glob"`  | `{"x":1}`           |
| `--permission-mode dontAsk` | `{"x":1}`           |
| `--model claude-sonnet-5-5` | `{"x":1}`           |
| `--agent triage`            | **missing**         |

With `--agent`, the agent's `tools` frontmatter becomes the session's toolset and the structured answer silently disappears; the run still reports `subtype: success`. The first real triage run hit this: the agent wrote a correct answer in prose ("green, 80 expected"), and the script, correctly, refused to treat it as a report. The fix keeps one source: `agentInstructions(name)` strips the frontmatter from the agent file and passes the body with `--append-system-prompt`.

One more failure before that, at zero cost: the CLI rejected the schema (`no schema with key or ref "https://json-schema.org/draft/2020-12/schema"`) because of its `$schema` key. Removed from both schemas.

**Why no `--bare`:** Marko chose a subscription token (`CLAUDE_CODE_OAUTH_TOKEN`), and `--bare` does not read it. The agents also need what `--bare` skips: CLAUDE.md, the rules and the agent files. The price is that a `-p` run loads the checkout's hooks and MCP config, which the review job neutralizes with `--setting-sources user` and `--strict-mcp-config`.

## Exercise C: locally, then in CI

- **Local**, `npm run agent:triage -- 40171682088` (that night's nightly): green, 80 expected known-bug failures, 3 turns, $0.05, 6 s.
- **CI**, the PR's own job (run 40519825844): it picked the latest nightly (40465214792) and returned green, 80 expected, 3 turns, $0.05, 6 s, with the report in the job summary and the `triage-report` artifact. The whole job took 30 s, most of it `npm ci` and the CLI install. It proved the secret, the pinned install, `gh` access to the report artifact and the summary step together.
- Also on that PR: lint, smoke shards, the "Playwright tests" gate and the Docker smoke test passed. "Merge reports" stayed "pending" after every one of its steps had succeeded, a GitHub status glitch on an optional check.

## Exercise D: a real failure, triaged from two checkouts

CI run 40522247763: smoke suite dispatched on `scratch/m09-failing-run` (`TAX_RATE = 0.07`). It failed on the checkout totals test, and the merge job still produced `report.json` (it runs unless the run was cancelled). Triaged twice with the same command:

|                     | A: from the current checkout (rate 0.08 there)                                                               | B: from a worktree at the failing commit                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Category            | test bug                                                                                                     | test bug                                                                                               |
| Evidence            | Expected $6.16, received $7.04; $87.97 at 8% is $7.04, at 7% is $6.16; "the tree I read has TAX_RATE = 0.08" | Same arithmetic, plus "`TAX_RATE = 0.07` in src/utils/pricing.ts:4", whose own comment examples are 8% |
| Action              | "Check which commit CI ran ... the 7% rate may be in a different branch or commit", then a conditional plan  | "Change TAX_RATE in src/utils/pricing.ts to 0.08 ... Don't touch the assertion."                       |
| Expected known bugs | 3                                                                                                            | 3                                                                                                      |
| Cost                | 7 turns, $0.08, 24 s                                                                                         | 6 turns, $0.05, 17 s                                                                                   |

Both were honest. A even noticed that the code it read could not have produced the failure. But only B could name the cause. A `workflow_run` job checks out the default branch as it is at triage time, which is report A. The fix (commit `33abdce`): `ref: ${{ github.event.workflow_run.head_sha }}` on the checkout. Dispatch and PR runs keep the default checkout, so a manual triage of an old run still reads today's code.

Prediction check: same category either way, because the failure message alone shows 7% versus 8%; the difference is whether the action is a fix or a hunt.

## Exercise E: the review, end to end

Probe PR #26 into this branch: a new, unused `src/components/menu-toggle.component.ts` with a CSS class locator, `getByTestId('open-menu')`, and an `expect` inside `open()`. **Lint passed it** (pre-commit and CI), which is the point.

- Adding `ai-review` started run 40522418613. The agent ran 4 turns on Haiku, under a cent, and `github-actions[bot]` posted one comment with three **must-fix** findings on lines 9, 10 and 15: the CSS class, the `open-menu` trap ("targets an `<img>` that the button covers ... the verified exception says to address the Open Menu button by role"), and the assertion in a component method. Each came with the right rule and a usable suggestion.
- Removing and re-adding the label started run 40522684864. Afterwards there was still **one** comment, created 14:34:58 and updated 14:36:41: `--edit-last --create-if-none` edited it.
- Locally, against merged PR #22, the review came back clean (5 turns, $0.003); with two violations planted temporarily in the footer component, it flagged both as must-fix on lines 15 and 16.

## Exercise F: threat model the review

| A PR author tries to...                                | What stops it                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Run it from a fork to reach the secret                 | Fork PRs get no secrets, and the job's `if` skips them                                                                                                                                                                                                                           |
| Trigger it repeatedly to burn the plan                 | Only maintainers can add labels; `labeled` is the only trigger; concurrency cancels duplicates; caps of 15 turns and $1                                                                                                                                                          |
| Add a hook in `.claude/settings.json`                  | `--setting-sources user`: project settings, hooks included, do not load. Verified with a decoy `tests/` file outside the repo: with default sources the project hook blocked an assertion-deleting Edit; with `--setting-sources user` the Edit went through                     |
| Add an MCP server in `.mcp.json`                       | `--strict-mcp-config` with no `--mcp-config`: no servers at all                                                                                                                                                                                                                  |
| Give the reviewer `Bash` in its agent file             | The script appends only the body; `--tools Read,Grep,Glob` is the toolset, and `dontAsk` denies anything else                                                                                                                                                                    |
| Use the GitHub token                                   | The script deletes `GH_TOKEN` and `GITHUB_TOKEN` before starting the agent; posting happens in a later step the agent cannot influence beyond the comment text                                                                                                                   |
| Edit the workflow or `scripts/agent-review.mjs` itself | **Not stopped by tooling.** On `pull_request`, the workflow and the scripts come from the PR, so a same-repo PR can drop every flag above. The boundary is that only collaborators can push same-repo branches, and a maintainer chooses to add the label after reading the diff |
| Rewrite the reviewer's instructions or inject via code | **Not stopped.** The agent body and CLAUDE.md come from the PR checkout, and reviewed code is input. The outcome is bounded to a wrong or misleading comment. For untrusted contributors, check out the base branch for the tooling and the PR only as data                      |

## Checkpoint

**1. The run hits `--max-turns` before answering.**
`claude -p` exits with an error result and no `structured_output`. `runHeadless` checks exactly that and throws, so the step fails and the summary or comment step has no report to post. An empty report would read as "nothing found": a false green produced by the infrastructure, the most expensive failure mode in this whole phase. Red with a reason is honest.

**2. Why no `--bare`, and what is lost.**
`--bare` does not read `CLAUDE_CODE_OAUTH_TOKEN`, and the agents need the repo's CLAUDE.md, rules and agent files, which `--bare` skips. What is lost is the guarantee that nothing from the checkout runs: a non-bare `-p` run loads project hooks and MCP servers without a trust prompt. The review job buys most of that back with `--setting-sources user` and `--strict-mcp-config`. The triage job runs on trusted code (a scheduled run on `main`, or a same-repo PR), so it keeps the project settings.

**3. A same-repo PR adds an exfiltrating hook, then gets the label.**
The hook never loads, because the review runs with `--setting-sources user`, as the decoy test showed. The PR also cannot add an MCP server (`--strict-mcp-config`), extend the toolset (`--tools`, `dontAsk`) or reach the GitHub token (removed from the agent's environment). What it can still do: rewrite the reviewer's instructions or plant instructions in the reviewed code, so that the posted comment is wrong or misleading. Everything else in the PR (the workflow itself, the scripts) is also PR-controlled, which is why the label (a maintainer's decision) and the same-repo condition are part of the boundary.

**4. Triage against current `main`.**
The agent explains a failure using code that did not run. In Exercise D, that turned a precise diagnosis ("line 4 says 0.07") into a hedge ("the 7% rate may be in a different branch or commit"). Worse cases are easy to imagine: a test fixed since the nightly reads as healthy, or a renamed page object reads as missing. The fix is to check out `github.event.workflow_run.head_sha`, which the workflow now does.

**5. `--agent triage --json-schema` returned no `structured_output`.**
`--agent` made the agent's `tools` list the session's whole toolset, and the mechanism that delivers the schema-validated answer was no longer available. The run still succeeded, with prose only. To keep one source, load the agent file's body (frontmatter stripped) with `--append-system-prompt` and restate its tool and model choices as CLI flags. The instructions stay in `.claude/agents/`, used by the same agent locally and in CI.
