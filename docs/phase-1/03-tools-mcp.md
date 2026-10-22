# Module 3: Tools and MCP

Verified on 2026-10-22 against the Claude Code docs for v2.1.308 ("Tools reference", "Connect Claude Code to tools via MCP", "Configure permissions"), the MCP specification revision 2026-07-28, the MCP TypeScript SDK v2 (`@modelcontextprotocol/server` 2.3.1) and the `@playwright/mcp` 0.0.83 README.

## 1. Concept

**A tool is a contract the model reads:** a name, a description and a JSON Schema for the input. The model never runs anything. It emits a tool call; the harness checks permissions, executes, and returns the result as the next message (Module 1). The definition costs context on every call, the result once, until compaction.

**Built-in tools.** The tools reference lists 46, not all enabled in every session: file tools (Read, Write, Edit, Glob, Grep, NotebookEdit, LSP), shells (Bash, PowerShell, Monitor), the web (WebFetch, WebSearch), delegation (Agent, Skill), planning and task tools, and `ToolSearch`, which loads the definitions of deferred MCP tools.

**MCP** (Model Context Protocol) is an open protocol through which a client, here Claude Code, uses capabilities that a server exposes. Its three primitives differ in who decides to use them:

| Primitive | Who decides                       | In Claude Code                                                                          |
| --------- | --------------------------------- | --------------------------------------------------------------------------------------- |
| Tools     | The model                         | `mcp__<server>__<tool>`, called like a built-in tool                                    |
| Resources | The user or the app attaches them | `@server:protocol://path` in a prompt; the model can also list and read them with tools |
| Prompts   | The user invokes them             | `/mcp__<server>__<prompt> <args>`                                                       |

**Transports.** stdio: Claude Code starts the server as a child process and talks over stdin and stdout, so a stdio server must log only to stderr. Streamable HTTP: a remote server. The current spec revision (2026-07-28) made the protocol stateless: no `initialize` handshake, every request carries its version and client capabilities, and servers implement `server/discover`. SDK v2 (`@modelcontextprotocol/server`, `/client`) implements it; `@modelcontextprotocol/sdk` 1.x is the previous line.

**How Claude Code loads servers:**

- **Scopes.** Local (`~/.claude.json`, this project, only you), project (`.mcp.json`, committed, needs approval in interactive sessions), user (`~/.claude.json`, all your projects), then plugin servers and claude.ai connectors. Precedence follows that order, and the whole entry of the winning scope is used; fields are not merged.
- **Variables.** `${VAR}` and `${VAR:-default}` expand in `command`, `args`, `env`, `url` and `headers`, so secrets stay out of `.mcp.json`.
- **Tool search (default on).** At session start only tool names and server instructions are loaded; `ToolSearch` loads a definition when Claude needs it. `ENABLE_TOOL_SEARCH=false` loads every definition upfront; `auto` loads upfront while they fit in 10% of the window. Server instructions and upfront descriptions are cut at 4,096 characters, deferred descriptions at 16,384.
- **Output limits.** A warning above 10,000 tokens, a default cap of 25,000 (`MAX_MCP_OUTPUT_TOKENS`). A text result over 50,000 characters is saved to a file and replaced by its path. Error text over about 11,000 characters keeps only the first and last 5,000.
- **Hints a server can give.** Annotations `readOnlyHint` (Claude Code then runs the calls in parallel with other read-only calls) and `idempotentHint` (safe to repeat after a dropped connection). `_meta` keys: `anthropic/alwaysLoad`, `anthropic/maxResultSizeChars` (up to 500,000), `anthropic/requiresUserInteraction` (a prompt on every call, whatever the mode or allow rules; denied in `dontAsk`).
- **Isolation for headless runs.** `--strict-mcp-config` with `--mcp-config <file>` uses only the servers you pass.

**Permissions:**

- `mcp__<server>__*` (or `mcp__<server>`) allows every tool of one server; `mcp__<server>__<tool>` allows one. Deny and ask rules accept globs such as `mcp__*`; an allow glob must start with a literal `mcp__<server>__`.
- Rules cannot look at MCP tool arguments: Claude Code skips any `mcp__` rule with parentheses in a settings file. Allowing `browser_navigate` allows every URL.
- **An MCP server is a process running as you.** Read and Edit deny rules cover Claude's file tools and the shell file commands Claude Code recognizes, not "a Python or Node script that opens files itself", and the sandbox covers Bash, PowerShell and Monitor, not MCP servers. For what a server does, the permission rule on its tools is the only control Claude Code applies.

**When a tool beats a prompt (or a script).** Build a tool when:

- the answer needs data the model cannot see or should not reach directly (another system, credentials, the network);
- the work is deterministic, such as parsing, joining and counting, which code does exactly and a model reading text only approximates;
- the raw material is large and the answer is small;
- you want a narrower permission than a general tool such as Bash;
- several consumers reuse it (chat, subagents, CI).

A prompt, a CLAUDE.md rule or a skill wins when the task is judgment over material already in reach. A CLI script plus a skill wins when the agent has a shell anyway and the output is small: no protocol, no server process, no tool definitions in context. The Playwright MCP README itself recommends its CLI with skills for coding agents, because "CLI invocations are more token-efficient", and keeps MCP for loops that need persistent browser state.

## 2. Why it matters for QA

- **Triage needs facts, not text.** The only CI run of this repo that failed (39670242164) left a 5.5 MB HTML report and a 72,170-character failed-job log. The log marks seven tests with `✘`, but only five failed: the other two are `knownBug()` expected failures, which the list reporter marks the same way. A tool that returns the report's verdicts (unexpected, flaky, expected failure with its `SD-xxx` id) answers "what broke" in a few hundred tokens and cannot miscount.
- **Known-bug ids are the join key.** `SD-xxx` connects the catalogue, the `knownBug()` markers in specs, CI results and, in Module 10, eval labels. A tool can return that join; a prompt can only ask the model to rebuild it by reading files.
- **A narrow tool is a smaller permission than a shell.** Allowing `Bash(gh *)` so an agent can read CI results also allows `gh api -X DELETE`. A read-only `get_ci_run` tool cannot delete anything.
- **The Playwright MCP server grounded every selector in Phase 0, and it is the most powerful tool configured here.** Exercise D shows why.
- **Tool output is untrusted input.** Error messages, logs and page text come from systems the agent does not control; a pull request from a fork can print anything into a CI log.

## 3. Hands-on

Run the commands **in a plain terminal**, not through a Claude session, for the reason measured in Module 2. `npm run agent:trace` now also shows how many of a run's tools come from MCP.

### Exercise A: what MCP costs (predict first)

Write down four predictions before running anything:

1. How many MCP tools does this environment expose, and from how many servers?
2. How many tokens do MCP servers add to the first call with tool search on (the default)?
3. How many with tool search off (`ENABLE_TOOL_SEARCH=false`)?
4. How many does the Playwright MCP server alone add when its tools load upfront?

```bash
claude mcp list
claude -p "Reply with the single word OK." --permission-mode dontAsk \
  --output-format stream-json --verbose < /dev/null > traces/m3-default.jsonl
claude -p "Reply with the single word OK." --strict-mcp-config --permission-mode dontAsk \
  --output-format stream-json --verbose < /dev/null > traces/m3-no-mcp.jsonl
ENABLE_TOOL_SEARCH=false claude -p "Reply with the single word OK." --permission-mode dontAsk \
  --output-format stream-json --verbose < /dev/null > traces/m3-upfront.jsonl
ENABLE_TOOL_SEARCH=false claude -p "Reply with the single word OK." --strict-mcp-config --mcp-config .mcp.json \
  --permission-mode dontAsk --output-format stream-json --verbose < /dev/null > traces/m3-playwright-upfront.jsonl
for f in traces/m3-*.jsonl; do echo "== $f"; npm run -s agent:trace -- "$f" | head -3; done
```

`--strict-mcp-config` without `--mcp-config` starts no MCP server at all, so the difference to the default run is what MCP costs on every call.

### Exercise B: design the QA server (your attempt first)

Design a `qa` MCP server for this repo. Its consumers are you in chat, the triage subagent of Module 4 and the nightly CI triage of Module 9. It must answer:

1. **Is this failure a known bug?** Which catalogue entry, and which tests carry its marker?
2. **What happened in a CI run** (by default the latest nightly on `main`)? Real failures, flaky tests, and known bugs that unexpectedly passed (probably fixed), each with its error message and a link to the report.

Constraints: read-only; a normal answer under about 2,000 tokens, with explicit truncation; `SD-xxx` and `DJ-xxx` ids as join keys; GitHub access through the `gh` login or `GITHUB_TOKEN`, never a token in code or output; error messages and logs treated as untrusted data.

For **each tool**: name; description (the first sentence carries the words Claude would search for); input schema with types, defaults and enums; output (text, or `structuredContent` with an `outputSchema`); size limit; error behavior (`isError` with an actionable message, or an empty result); annotations.

Also decide:

- **Primitive:** the catalogue as a tool, a resource, or both? Is there a prompt worth exposing?
- **MCP or not:** what does a server buy here over `npm run` scripts plus a skill (Module 5)? Name the deciding criteria from section 1.
- **Data source for CI results.** What exists today:

  | Source                                    | Retention    | Notes                                                                                                                   |
  | ----------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------- |
  | Blob reports (`blob-report-<shard>`)      | 1 day        | Zip of Playwright's internal format, one per shard                                                                      |
  | Merged HTML report                        | 14 days      | 5.5 MB for one run; data embedded in the page                                                                           |
  | Job logs (`gh run view --log-failed`)     | With the run | 72,170 characters for one failed shard; `✘` for real and expected failures alike                                        |
  | Check-run annotations (`github` reporter) | With the run | File, line and message per failed test                                                                                  |
  | JSON report                               | -            | Not produced yet. `merge-reports --reporter html,json` with `PLAYWRIGHT_JSON_OUTPUT_FILE` would add it in the merge job |

- **Location and runtime:** where the code lives (the architecture map in CLAUDE.md has no slot for it yet), and how it runs. Node 24 strips TypeScript types natively, and `src/data/known-bugs.ts` has no imports.

### Exercise C: build and verify (after the design review)

Implement the reviewed design with SDK v2 over stdio, register it in `.mcp.json`, check it with the MCP Inspector in CLI mode, and run it headlessly with `--strict-mcp-config --mcp-config .mcp.json --allowedTools "mcp__qa__*"`. Then compare, for run 39670242164, the agent's answer and context size using the tool against using `gh run view --log-failed`. The exact commands are written once the server exists.

### Exercise D: review the Playwright MCP permissions (your attempt first)

`.claude/settings.json` allows `mcp__playwright__*`. The server exposes 25 tools, among them `browser_run_code_unsafe` ("executes arbitrary JavaScript in the Playwright server process and is RCE-equivalent"), `browser_evaluate` and `browser_file_upload`. Its file access is limited to the workspace root, which is the repository root.

1. **Predict:** in a headless `dontAsk` run in this repo, can an agent call `browser_run_code_unsafe` without a prompt? Could that code read `.env`, despite `Read(./.env)` being denied?
2. **Propose** the rule set: which tools to allow, which to ask for, which to deny, and which server flags to add (`--allowed-origins`, `--blocked-origins`, `--caps`), keeping in mind that the README says the origin lists are "not a security boundary".
3. **Verify** the prediction with a harmless probe, such as code that returns `typeof process`. Never with `.env`.

The change touches `.claude/settings.json` and `.mcp.json`, so it lands only after your review.

## 4. Tradeoffs and pitfalls

- **MCP or CLI plus skill.** A server gives typed inputs, structured results, per-tool permissions and reuse by any MCP client. A script gives zero standing context cost and no extra process. For a coding agent with a shell, the script often wins; for narrow, read-only access by agents without a shell, the server wins.
- **Every connected server costs context, even deferred.** Tool names and server instructions load on every call. Headless and CI runs should pass exactly the servers they need with `--strict-mcp-config`.
- **The description is the API.** Claude picks tools by name and description, and tool search matches only the first 4,096 characters of a description. Vague names (`get_data`) and overlapping tools cause wrong calls.
- **Design the output for the answer.** Summaries, limits, pagination, and a note of what was omitted. Over 50,000 characters, Claude Code moves the result to a file anyway, and the agent then has to read it in pieces.
- **Errors are instructions.** Return `isError: true` with what to change ("run id not found; list runs with list_ci_runs"), not a stack trace. An empty result is not an error.
- **stdout belongs to the protocol** in a stdio server; one `console.log` corrupts the connection.
- **Supply chain.** `npx -y package` without a version runs whatever is latest at start. This repo pins `@playwright/mcp@0.0.83`; upgrades are reviewed like code.
- **Servers run with your privileges,** outside Read/Edit deny rules and the sandbox. Permission rules are per tool, not per argument.
- **Untrusted output plus powerful tools is the injection risk.** An unattended agent that reads untrusted content (pages, logs, issues) should not also hold tools that write or reach the network freely.

## 5. Interview angle

- **"When would you build an MCP server instead of writing a script or a better prompt?"** When the answer needs data or credentials the model should not handle directly, the work is deterministic (parsing a test report, joining failures with a bug catalogue), the raw material is large and the answer small, and several agents reuse it. Otherwise a script plus a skill is cheaper. Example: the raw failed-job log here miscounts known-bug expected failures as failures; a report-parsing tool cannot.
- **"How do you secure MCP tools for an agent in CI?"** Pass only the needed servers (`--strict-mcp-config`), allow tools individually instead of `mcp__server__*`, deny code-execution tools, pin server versions, keep tokens in environment variables, prefer read-only tools, and remember that servers run outside Read/Edit deny rules and the sandbox.
- **"Your agent's context is half full before it starts. What do you check?"** Upfront MCP tool definitions (tool search off, or a server marked `alwaysLoad`), the number of connected servers, large server instructions, and big tool results. Measure with paired headless runs, as in Exercise A.

## 6. Checkpoint

1. Name the three MCP primitives and who decides to use each. Which would you use for the known-bug catalogue, and why?
2. With tool search on, what does the model see of a server's 25 tools before it uses one? What changes with `ENABLE_TOOL_SEARCH=false`?
3. Why does `Read(./.env)` in `deny` not stop an MCP server from reading `.env`, and what would?
4. A tool returns 80,000 characters. What does Claude Code do with it, and how should the tool have been designed instead?
