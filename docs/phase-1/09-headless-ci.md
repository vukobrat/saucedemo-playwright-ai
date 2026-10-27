# Module 9: Headless runs and CI

Verified on 2026-10-27 against the Claude Code docs for v2.1.308 ("Run Claude Code programmatically", "CLI reference", "Claude Code GitHub Actions", "Authentication") and against two agent workflows built and run in this repository's GitHub Actions. Worked answers to the exercises and the checkpoint, with the run results, are in [09-headless-ci-answers.md](09-headless-ci-answers.md).

## 1. Concept

**Headless is the same agent loop with nobody in it.** `claude -p "<task>"` runs one task and exits. Everything a person would decide in an interactive session has to be decided in advance on the command line, because there is nobody to answer a prompt:

| Decision                 | Flags used here                                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Which tools exist        | `--tools "Read,Grep,Glob"` (built-ins), `--strict-mcp-config --mcp-config <json>` (only the servers named)      |
| Which calls are approved | `--permission-mode dontAsk`: anything not pre-approved is **denied**, not asked; `--allowedTools` for MCP tools |
| How far it may go        | `--max-turns`, `--max-budget-usd` (print mode only; subagent spend counts)                                      |
| What context it loads    | `--append-system-prompt`, `--setting-sources`, and `--bare` (see below)                                         |
| What it returns          | `--output-format json` and `--json-schema <schema>`                                                             |

**The output is a contract.** `--output-format json` returns one object with `result`, `session_id`, `num_turns`, `total_cost_usd`, `duration_ms`, `is_error`, `subtype` and `permission_denials`. Add `--json-schema` and the answer arrives validated in `structured_output`. If the run ends without valid structured output (a turn cap, a refusal), the field is simply absent, so a script must check for it and treat its absence as a failure, never as an empty report.

**`--bare` versus project context.** `--bare` skips hooks, skills, plugins, MCP servers, auto memory and CLAUDE.md, so a run behaves the same on every machine; the docs recommend it for scripts and say it will become the `-p` default. Without it, a `-p` run loads the checkout's `.claude/settings.json` hooks and connects its `.mcp.json` servers, with no trust dialog. The repository is input that can execute code. `--bare` also ignores `CLAUDE_CODE_OAUTH_TOKEN`, so it needs an API key.

**Authentication in CI** is a secret, never a file in the repo:

- `ANTHROPIC_API_KEY`, a Claude Console key billed per use, suits teams and shared secrets.
- `CLAUDE_CODE_OAUTH_TOKEN`, from `claude setup-token`, is a one-year token on a Pro, Max, Team or Enterprise plan. It is tied to the person who created it and counts against their plan.
- If both are set, the API key wins.

**Two ways into GitHub Actions.** `anthropics/claude-code-action@v1` gives you `@claude` mentions and, with a `prompt`, automation on any event. It posts comments itself, authenticates as the Claude GitHub App (a broad permission set) or with a token you pass, and refuses bot actors and users without write access. The alternative, used here, is to install the pinned CLI in a step and run `claude -p` like any other command.

**The pattern: the agent returns data, the pipeline acts.** The agent gets read-only tools, no GitHub write token and a JSON Schema. A plain workflow step turns its JSON into the job summary or the PR comment. The agent reads untrusted text, such as CI output, pull request code and comments, so assume it can be prompt-injected. If all it can do is return a report, the worst case is a wrong report, which a person sees, rather than an action taken in your name.

## 2. Why it matters for QA

- **The nightly fails at 02:00 and someone reads it at 09:00.** A triage summary waiting in the failed run saves the first hour of every red morning: which tests, which category, the deciding evidence, the next action. The known-bug catalogue is what makes "80 failures" a non-event.
- **Page-object review is mechanical rule checking,** which is what a small model does well and cheaply. It catches what lint cannot: the verified selector traps in `.claude/rules/pages.md` and assertions hidden in page objects.
- **An agent in CI is a check, so it must be reproducible.** Both agents are npm scripts (`agent:triage`, `agent:review`), the same command locally and in CI, as `.claude/rules/ci.md` requires for every check.
- **Triage reads code, so it must read the code that ran.** A triage agent pointed at today's `main` explains yesterday's failure with the wrong source.

## 3. Hands-on

Built in this module:

- `scripts/lib/claude-headless.mjs`: runs `claude -p` with a schema, an empty stdin, and a hard failure when no structured output comes back.
- `npm run agent:triage -- <run-id>` and `npm run agent:review -- <pr-number>`, with schemas in `scripts/schemas/`.
- `.github/workflows/nightly-triage.yml`: triggered by a failed scheduled CI run, a manual dispatch, or a PR that changes the triage. It writes the job summary.
- `.github/workflows/ai-review.yml`: the `ai-review` label triggers it, and it posts one comment, edited on re-runs.
- The `CLAUDE_CODE_OAUTH_TOKEN` repository secret, created by Marko.

### Exercise A: the contract (your attempt first)

Design the triage report schema. What makes a run "green" when 80 tests failed as expected? What must a failure entry carry so a person can act without opening the logs? When should the script fail instead of producing a report?

### Exercise B: the flags (predict first)

Choose tools, permission mode, caps and context for each agent. Then predict: what happens to `--json-schema` if you run the project's triage agent with `--agent triage`? Why can this repo not use `--bare`?

### Exercise C: run it locally, then in CI

Run `npm run agent:triage -- <latest nightly run id>`, then push and let the PR's own "Nightly triage / Triage" job run the same command. Predict the turns, cost and verdict.

### Exercise D: a real failure, triaged from two checkouts

Push a scratch branch with `TAX_RATE` set to `0.07`, dispatch CI on it, and triage the failed run twice: once from the current checkout (where the rate is 0.08) and once from a worktree at the failing commit. Predict how the two reports differ, and what that means for a `workflow_run`-triggered job.

### Exercise E: the review, end to end

Open a probe PR with a new, unused component that breaks rules lint cannot see (a CSS class locator, the `open-menu` test-id trap, an assertion inside a component). Add the label, then remove and re-add it. Predict: which violations are caught, and how many comments exist afterwards?

### Exercise F: threat model the review

A pull request author controls every file in the checkout. List what they could try against the review job (hooks, MCP config, the agent's instructions, the code under review, the environment) and what stops each one.

## 4. Tradeoffs and pitfalls

- **`--agent` drops structured output.** With `--agent triage`, the agent's `tools` list became the session's whole toolset and `--json-schema` silently returned no `structured_output`: no error, no cost to speak of. The scripts load `.claude/agents/<name>.md` with `--append-system-prompt` instead, which keeps one source for the instructions. The cost: the agent's `tools` and `model` frontmatter no longer apply, so the scripts restate them.
- **The schema validator is not a full draft-2020-12 implementation.** A `$schema` key naming the 2020-12 meta-schema was rejected (`no schema with key or ref`). Keep schemas to plain keywords, and run the script once locally before trusting CI.
- **Check out the run's commit.** On a `workflow_run` event, `actions/checkout` checks out the default branch as it is now. Measured on one failed run triaged twice: from current `main`, the agent got the category right but could only guess where the wrong value came from; from the failing commit, it named the file, line and fix. The workflow now checks out `workflow_run.head_sha`. A manual dispatch for an older run still reads today's code.
- **`--setting-sources user` cuts both ways.** It stops a pull request's `.claude/settings.json` hooks from running on the runner (verified: with it, the project hook did not load). It also removes the project's own guardrails, such as the Module 6 test-weakening hook. That is right for a read-only reviewer and wrong for a CI fix loop.
- **What the label gate and `pull_request` do not stop.** Fork PRs get no secrets, and only maintainers can label. But on `pull_request`, the workflow, the scripts, the agent's instructions and CLAUDE.md all come from the PR's own checkout. A same-repo PR could remove every safeguard in the script or rewrite the reviewer's prompt, and the code under review can try to inject instructions. The real boundary is who can push a same-repo branch, plus the maintainer reading the diff before adding the label. Read-only tools, `dontAsk`, no MCP and no GitHub token bound what that achieves to a misleading comment. For untrusted contributors, run the tooling from the base branch and treat the PR checkout as data only.
- **Subscription token or API key.** The subscription token needs no API bill, but it belongs to one person, shares that person's plan limits, expires after a year, and rules out `--bare`. An API key from the Console is the team option. Either way, the caps are client-side estimates, not billing limits.
- **Costs measured here:** triage $0.05 to $0.08 per run (3 to 7 turns, under 30 s); review under $0.01 per PR on Haiku. The turn and budget caps are an order of magnitude above that, as a backstop rather than a target.
- **Scheduled workflows go quiet.** GitHub disables a public repository's schedules after 60 days without activity, and with it the nightly that triggers the triage. Watch for the email.
- **CI status is not infallible.** On this PR, a "Merge reports" job stayed "pending" after every step had succeeded. Branch protection relies on the required checks; do not read meaning into a stuck optional one.

## 5. Interview angle

- **"How would you run an AI agent in CI safely?"** As a check: a pinned CLI version, read-only tools, `dontAsk` with an explicit allowlist, turn and budget caps, only the MCP servers it needs, and schema-validated output that a deterministic step acts on. The agent never holds a write token. Gate expensive or exposed runs (labels, same-repo only), keep secrets in the CI secret store, and make the same command runnable locally.
- **"Why structured output instead of letting the agent post?"** It separates judgment from action. The schema makes the result machine-checkable (a missing field fails the job instead of posting nonsense), the posting code is reviewable and deterministic, and a prompt-injected agent can only produce a wrong report, never a merge, a push or a comment it chose itself.
- **"Your CI triage agent was confidently vague. Why might that be?"** It may be reading different code from what ran. Here, a `workflow_run` job checked out today's `main` while the failure came from an older commit; checking out `workflow_run.head_sha` turned "the rate may be in a different branch" into "line 4 of pricing.ts says 0.07".

## 6. Checkpoint

1. A headless run hits `--max-turns` before it answers. What does the pipeline see, and why must the job fail instead of posting an empty report?
2. Why can this repository's CI agents not use `--bare`, and what do they give up by not using it?
3. A same-repo PR adds a `PreToolUse` hook to `.claude/settings.json` that sends the environment to a server, and a maintainer then adds `ai-review`. What stops it? What could the PR still do?
4. The triage of a failed nightly ran against current `main`. What goes wrong, and what is the fix?
5. `--agent triage --json-schema ...` returned no `structured_output`. What happened, and how do you keep one source for the agent's instructions anyway?
