# Module 4: Subagents

Verified on 2026-10-23 against the Claude Code docs for v2.1.308 ("Subagents"), and against four subagents built and run in this repo. Worked answers to the exercises and the checkpoint, with the run results, are in [04-subagents-answers.md](04-subagents-answers.md).

## 1. Concept

A **subagent** is a second agent the main agent delegates a task to. It runs the same loop (Module 1) in its **own context window**, with its **own system prompt, tool set and model**, and when it finishes, only its **final report** returns to the caller. The caller never sees the subagent's tool calls, file reads or intermediate reasoning.

That one property, context isolation, is the whole point. A subagent that reads a 5 MB report, greps forty files and reasons for twenty turns spends all of that in its own window; the main conversation gets back a paragraph. The main context stays small and on-task (Module 2).

**Definition files.** A project subagent is a Markdown file in `.claude/agents/` (user-level ones live in `~/.claude/agents/`; the project copy wins on a name clash). The YAML frontmatter configures it; the body is its system prompt.

| Field         | Role                                                                                                                 |
| ------------- | -------------------------------------------------------------------------------------------------------------------- |
| `name`        | Required. The identifier used to invoke it and reported to hooks as `agent_type`.                                    |
| `description` | Required. **When Claude should delegate to it.** This drives automatic selection, so it is an API, not a note.       |
| `tools`       | Optional allowlist. Omitted, the subagent inherits every tool available to subagents. MCP tools as `mcp__server__*`. |
| `model`       | Optional: `sonnet`, `opus`, `haiku`, `fable`, a full id, or `inherit` (the main conversation's model).               |
| `color`       | Optional display colour in the transcript.                                                                           |

There are more (`disallowedTools`, `permissionMode`, `maxTurns`, `mcpServers`, `hooks`, `autoCompactWindow`); the four here need only the five above.

**Automatic delegation** is driven by the `description` fields: Claude reads them and routes a matching request to the right subagent, so each description must single out its own agent. The combined descriptions share a **15,000-token budget**, so they cost main context even unused: a reason to keep them sharp and few. You can also force one with an `@mention`, or run a whole session as one agent with `claude --agent <name>` (or the `agent` setting).

**A fork is the exception to isolation.** `/subtask` (or the Agent tool with `subagent_type: "fork"`) starts a subagent that inherits the full conversation instead of a fresh context, for a side task that would need too much re-explaining. A fork can't spawn further forks, and subagents can't nest past a depth limit.

**Scoping is least privilege for agents.** `tools` and `model` are set per agent: a read-only reviewer gets no `Bash` and no `Write`; a cheap model runs a mechanical scan while a capable one does judgment work. But note the boundary: `tools` controls what the subagent _can_ reach, not what runs without asking. Permissions still gate each call (Exercise C found this the hard way).

## 2. Why it matters for QA

- **Triage without drowning the main context.** A failed CI run is a 5 MB report and a 72k-character log. A triage subagent reads them in its own window and returns "3 known bugs, 0 regressions, here is the one that matters". Module 3's `qa` server is the tool it reaches for.
- **Fan-out review.** A locator reviewer, a gap analyzer and a flaky investigator are three narrow specialists. Run in parallel from one request, each keeps its own focus and context, and you get three reports instead of one tired generalist's.
- **Least privilege per task.** A locator reviewer that only reads cannot edit a test to make it pass. A triage agent that reads CI results does not hold a general `gh` shell. The `tools` field is where you enforce that.
- **Finding what is not there.** A test-gap analyzer compares the verified app model to the suite. In this repo it is meant to find the Dynamic Catalog, a whole feature `docs/app-exploration.md` flags as untested (Exercise D).
- **The report is the interface.** Because only the final report returns, a subagent that reasons well but reports vaguely is useless. Each prompt here ends with an explicit output format.

## 3. Hands-on

Four subagents in `.claude/agents/`, each scoped to the smallest tool set and a fitting model:

| Agent                | Model   | Tools                                              | Job                                                           |
| -------------------- | ------- | -------------------------------------------------- | ------------------------------------------------------------- |
| `triage`             | inherit | Read, Grep, Glob, Bash, `mcp__qa__*` (three tools) | Classify a failure: known bug / new bug / test / env / flaky  |
| `flaky-investigator` | inherit | Read, Grep, Glob, Bash                             | Run a test repeatedly, decide flaky vs stable, name the cause |
| `locator-reviewer`   | haiku   | Read, Grep, Glob (read-only)                       | Review page objects against the locator rules                 |
| `test-gap-analyzer`  | inherit | Read, Grep, Glob (read-only)                       | Rank coverage gaps from the app model vs the suite            |

Only `triage` gets the `qa` MCP tools; only `triage` and `flaky-investigator` get `Bash`. The reviewers cannot run or change anything.

### Exercise A: scope each agent (your attempt first)

For each of the four, decide the `tools` allowlist and the `model`, and justify both. Which must be read-only? Which needs the `qa` server? Where does a cheap model suffice and where would it cost you? What goes wrong if you omit `tools` entirely?

### Exercise B: write the agents

Write the four definition files. Each `description` must be specific enough to route to it and no other; each body must end with an explicit output format. Keep the combined descriptions well inside the 15,000-token budget.

### Exercise C: verify headlessly (predict first)

Run each agent as its own session and check it does its job:

```bash
claude -p "Report the coverage gaps in this suite." --agent test-gap-analyzer \
  --permission-mode dontAsk --disallowedTools "mcp__*" --output-format stream-json --verbose
claude -p "Triage CI run <id>." --agent triage \
  --strict-mcp-config --mcp-config .mcp.json --permission-mode dontAsk \
  --allowedTools "mcp__qa__analyze_ci_run" "mcp__qa__list_ci_runs" "mcp__qa__find_known_bug" \
  --output-format stream-json --verbose
```

Predict, before running: will the triage agent's `qa` tools work under `--permission-mode dontAsk` from the `tools` field alone? (The answer is the lesson of this exercise.) Does the locator reviewer, on `haiku`, catch anything, or flag the verified exceptions as faults?

### Exercise D: the planted gap (predict first)

Which single untested feature should `test-gap-analyzer` rank first, and on what evidence? Run it and check. This is a small eval: the agent either finds it or it does not.

## 4. Tradeoffs and pitfalls

- **`tools` is reach, not permission.** A subagent's `tools` allowlist says which tools exist for it; the permission system still decides whether each call runs. In headless `dontAsk`, an MCP or `Bash` tool the agent "has" is denied unless you also pre-approve it (`--allowedTools`) or add an `allow` rule. In an interactive session the user is prompted instead. Scoping and permissions are two separate layers.
- **Descriptions cost context.** All subagent descriptions load into the main window against a 15,000-token budget, used or not. Many vague agents crowd the budget and blur delegation; few sharp ones route well.
- **Delegation is a judgment, not a guarantee.** Automatic selection depends on the wording of the request and the descriptions. For a deterministic run, `@mention` the agent or use `--agent`.
- **Isolation has a price.** A fresh subagent re-reads what the main agent already read; nothing is shared. That is the right trade for large reads, wrong for a one-line question. A fork avoids the re-read by inheriting the conversation, at the cost of isolation.
- **The report is all you get.** Tune the output format, not just the reasoning. A subagent cannot be cross-examined after it returns; it can only be re-run.
- **A cheap model saves money until it misses things.** `haiku` is fine for a rule-driven scan; judgment work (triage, gap analysis) wants a stronger model. Measure before trusting a downgrade.
- **Least privilege is a safety feature.** A reviewer with `Write` can "fix" a test by weakening it (the Module 7 failure mode). Read-only tools make that impossible, not just discouraged.

## 5. Interview angle

- **"Why run a subtask as a subagent instead of in the main conversation?"** Context isolation: the subagent's large reads and long reasoning stay in its own window, and only a short report returns, so the main context stays small and focused. It also lets you scope tools and model per task, which is both cheaper and safer.
- **"How do you stop a fix-loop agent from cheating a test green?"** Give the reviewing or triaging agent read-only tools: no `Write`, no `Edit`. It can diagnose and recommend but cannot alter a test or an assertion. Enforcement is the `tools` field plus permission rules, not a polite instruction.
- **"How does Claude decide which subagent handles a request, and how do you make it reliable?"** It matches the request against the `description` fields (within a shared token budget), so descriptions must be specific and distinct. To remove the guesswork, name the agent explicitly with an `@mention` or run the session with `--agent`.

## 6. Checkpoint

1. A subagent reads a 5 MB CI report and returns a three-line summary. How much of that 5 MB reaches the main conversation, and why does that matter?
2. The `triage` agent lists `mcp__qa__analyze_ci_run` in its `tools`, yet a headless `dontAsk` run reports the call denied. Why, and what are two ways to let it through?
3. Where would you set `model: haiku`, and where would it be a false economy, among the four agents?
4. Why is a read-only `tools` list on the reviewers a stronger guardrail than writing "do not edit tests" in the prompt?
