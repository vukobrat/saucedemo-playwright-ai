# Module 3 answers: Tools and MCP

Answers to the exercises and checkpoint in [03-tools-mcp.md](03-tools-mcp.md). Written by the mentor for later study. Measurements are from this repo on 2026-10-23 with a clean environment (`env -i`), Claude Code v2.1.308, on the `learn/m03-tools-mcp` branch. Each configuration was run twice and gave an identical token count both times.

## Exercise A: what MCP costs

**What to expect, then what was measured.** The guess worth making first: tool search (the default) should make adding servers cheap, because only names and instructions load; turning it off should be expensive, because every tool definition loads upfront. The size of "expensive" is the surprise.

This environment has **17 MCP servers configured** (6 connected, 7 need authentication, 4 not configured or failed), exposing **127 MCP tools** when all are listed:

| Server                    | Tools |
| ------------------------- | ----- |
| `atlassian`               | 32    |
| `claude_ai_Gmail`         | 30    |
| `playwright`              | 25    |
| `claude_ai_Atlassian_MCP` | 21    |
| `claude_ai_Google_Drive`  | 11    |
| `claude_ai_Claude_Docs`   | 8     |

First-call context for "reply OK":

| Configuration                                            | Tools | MCP tools | First call  |
| -------------------------------------------------------- | ----- | --------- | ----------- |
| No MCP at all (`--strict-mcp-config`, no `--mcp-config`) | 24    | 0         | 24,373      |
| Playwright only, deferred (tool search on)               | 49    | 25        | 24,757      |
| All MCP tools denied (`--disallowedTools "mcp__*"`)      | 27    | 0         | 26,366      |
| Default: all 17 servers, tool search on                  | 154   | 127       | 29,773      |
| Playwright only, upfront (`ENABLE_TOOL_SEARCH=false`)    | 48    | 25        | 46,496      |
| Default servers, upfront (`ENABLE_TOOL_SEARCH=false`)    | 153   | 127       | **128,144** |

What the numbers say:

1. **127 tools from 17 servers.** More than five times the 24 built-in tools in a no-MCP session.
2. **Tool search on costs 5,400 tokens** for all 17 servers (29,773 vs 24,373): the deferred tool-name list, the server instructions, and the four MCP helper tools (`ToolSearch`, `ListMcpResourcesTool`, `ReadMcpResourceTool`, `ReadMcpResourceDirTool`).
3. **Tool search off costs 103,771 tokens** (128,144 vs 24,373). Deferring the definitions saves about 98,000 tokens on every call, roughly 70% of the window on a 128k model. This is the headline of the module: with 17 servers, upfront loading is not viable.
4. **The Playwright server alone adds 384 tokens deferred (24,757 vs 24,373) and 22,123 upfront (46,496).** A single server's 25 definitions are 22k tokens; deferring them is almost free until used.

Side points:

- **Denying MCP tools does not disconnect the servers** (Module 1). `--disallowedTools "mcp__*"` still left 26,366 tokens and kept the MCP resource helper tools: the servers connected, their instructions loaded, only the tools were removed from Claude's toolset. To pay nothing, start no servers (`--strict-mcp-config`).
- **A focused run should pass only what it needs.** `--strict-mcp-config --mcp-config .mcp.json` gives the Playwright server and nothing else, at 24,757 tokens instead of the default 29,773, and with no unauthenticated connectors trying to reach the network.

## Exercise B: design the `qa` MCP server

### Is this even a job for MCP?

Weigh it against the deciding criteria from the lesson:

| Criterion                          | For MCP here                                                                                 |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| Data the model cannot see directly | Partly: the bug catalogue is in the repo, but CI results live in GitHub behind `gh`/a token. |
| Deterministic work                 | Strongly: parsing a Playwright report and joining failures to `SD-xxx` ids is exact logic.   |
| Large input, small answer          | Strongly: a 5.5 MB report or a 72k-character log collapses to a few verdicts.                |
| Narrower permission than a shell   | Strongly: a read-only `get_ci_run` beats `Bash(gh *)`, which also allows `gh api -X DELETE`. |
| Reused by several consumers        | Yes: chat, the Module 4 triage subagent, the Module 9 nightly triage.                        |

Verdict: **build it as a server.** The known-bug half alone would not justify a server (a script plus a skill would do), but the CI half needs GitHub access, deterministic report parsing, and reuse by unattended agents, and keeping both halves in one `qa` server gives the triage agent a single place to answer "is this failure known, and what did CI actually do". The decisive factor is the narrower permission: an unattended CI agent should read results, not hold a general `gh` shell.

### Tools

Three tools, all read-only (`readOnlyHint: true`, so Claude Code runs them in parallel), all returning `structuredContent` with an `outputSchema` plus a short text summary, each with an explicit truncation note.

**1. `find_known_bug`** - the catalogue as a tool.

- _Description (first sentence searchable):_ "Look up known SauceDemo/DummyJSON defects by id, persona, or free text, to decide whether a test failure is an expected known bug."
- _Input:_ `{ query?: string, id?: string, persona?: enum, limit?: number = 20 }`. No argument returns the whole catalogue (26 entries, small).
- _Output:_ `{ bugs: [{ id, summary, persona?, markerKey, specs: string[] }], total, returned }`. `specs` is the list of spec files whose `knownBug()` call references the entry, built by scanning `tests/**` for `KNOWN_BUGS.<key>`.
- _Errors:_ unknown `id` returns an empty `bugs` array with `total: 0`, not an error. A malformed `persona` is an `isError` with the allowed values.
- _Size:_ bounded by `limit`; the full catalogue is well under 2,000 tokens.

**2. `list_ci_runs`** - find the run to inspect.

- _Description:_ "List recent GitHub Actions CI runs for this repo with status and conclusion, to pick a run to analyze."
- _Input:_ `{ branch?: string = "main", event?: enum(push, pull_request, schedule, workflow_dispatch), status?: enum, limit?: number = 10 }`.
- _Output:_ `{ runs: [{ id, event, branch, conclusion, createdAt, url }] }`.
- _Source:_ `gh run list --json ...` using the `gh` login or `GITHUB_TOKEN` from the environment; the token is never read into the result.

**3. `analyze_ci_run`** - the one that earns the server.

- _Description:_ "Summarize one CI run's test outcomes as real failures, flaky tests, and known bugs that unexpectedly passed, each joined to its SD-/DJ- id, so a known failure is not mistaken for a regression."
- _Input:_ `{ runId?: number, limit?: number = 50 }`. Default is the latest nightly (`schedule`) run on `main`.
- _Output:_ `structuredContent`:
  ```
  { runId, url, counts: { unexpected, flaky, knownBugExpected, knownBugUnexpectedlyPassed },
    unexpected: [{ test, file, line, message }],
    flaky: [{ test, file }],
    knownBugFixedProbably: [{ id, test, file }],
    truncated: boolean }
  ```
- _Source:_ a JSON report, not the log. This needs a build step (see Exercise C data source): the merge job emits `report.json` with `merge-reports --reporter html,json`, uploaded as an artifact. The tool downloads that artifact for `runId`, reads each test's `status`/`expectedStatus` and its `known-bug` annotation, and classifies:
  - `status === expectedStatus === "passed"`: ignored.
  - unexpected failure, no `known-bug` annotation: **unexpected** (a real regression).
  - expected failure with a `known-bug` annotation: **knownBugExpected** (the suite is green on purpose; not reported in the failure list).
  - a `known-bug`-annotated test that passed: **knownBugUnexpectedlyPassed** -> the bug may be fixed and the marker should be removed.
  - marked flaky by Playwright: **flaky**.
- _Why this beats the log:_ the raw `gh run view --log-failed` for the one failed run here is 72,170 characters and marks the two `knownBug()` expected failures with the same `✘` as the five real ones. This tool returns the four counts and the real-failure list in a few hundred tokens, and cannot miscount, because it reads `expectedStatus`, which the log does not carry.

### Primitive choice

- **Catalogue:** both a tool and a resource. `find_known_bug` for the model to query mid-triage; a resource `qa://known-bugs` so a person can attach the whole catalogue with `@qa:qa://known-bugs`. Same data, two access paths (model-decided vs user-attached).
- **Prompt:** one, `/mcp__qa__triage <runId>`, that expands to "call `analyze_ci_run` for this run, then for each unexpected failure call `find_known_bug` on its message, and report real regressions vs known bugs." A prompt is user-invoked, which fits a triage request; the Module 4 subagent will encode the same flow.

### Location and runtime

- **Code:** `src/mcp/` (a new top-level under `src/`, added to the CLAUDE.md architecture map and the `@mcp/*` alias). The server file imports the existing `KNOWN_BUGS` from `@data/known-bugs` directly, so the catalogue has one source.
- **Runtime:** stdio, started by Claude Code. Node 24 runs the TypeScript entry point with native type stripping, so no build step is needed to launch it; `npm run mcp:qa` wraps `node src/mcp/qa-server.ts`. SDK v2 (`@modelcontextprotocol/server`), which matches the protocol revision Claude Code speaks and the repo's zod 4.
- **Registration:** a `qa` entry in `.mcp.json` (project scope, committed), alongside `playwright`.
- **Secrets:** GitHub access via the ambient `gh` CLI or `${GITHUB_TOKEN}` expanded in `.mcp.json`; never a literal token, and the token is never echoed into a tool result.

## Exercise C: build and verify (built)

Built in `src/mcp/`: `qa-server.ts` (entry and registrations), `known-bugs-index.ts` (catalogue views and the spec scan) and `ci-report.ts` (the pure classifier and the `gh` wrappers). Registered as `qa` in `.mcp.json`; `npm run mcp:qa` launches it.

**SDK v2 API actually used.** v2 is not v1. A server is `new McpServer({ name, version })`; tools are `server.registerTool(name, { description, inputSchema, outputSchema, annotations }, handler)`; `registerResource(name, uri, meta, handler)` and `registerPrompt(name, config, handler)`; and stdio is `serveStdio(() => server)` from `@modelcontextprotocol/server/stdio`, which replaces v1's `new StdioServerTransport()` plus `server.connect()`. Schemas are plain zod (`import { z } from 'zod'`, the repo's zod 4), and the handler returns `{ content, structuredContent }`, validated against `outputSchema` before it leaves the server.

**The blocking finding: module format.** The repo is `"type": "commonjs"`, but every `src/*.ts` uses ESM `import`/`export` and is transpiled by Playwright or tsc, never run by Node directly. An MCP server is launched by `node`, so running `node src/mcp/qa-server.ts` fails: Node classifies the `.ts` under the commonjs package as CommonJS and chokes on `export`, and it cannot resolve the tsconfig path aliases either. The fix is a loader. I added `tsx` (pinned, a devDependency, so `npx tsx` uses the local copy with no download), and `.mcp.json` launches `npx tsx src/mcp/qa-server.ts`. tsx strips types, handles the ESM/CommonJS mismatch, and resolves `@data/known-bugs`, so the catalogue stays the single typed source. Internal imports between the `src/mcp` files are relative and extensionless, which `bundler` resolution and tsx both accept.

**Two design changes found while building.** `analyze_ci_run` gained a `reportPath` input (a local JSON report) next to `runId`, so the classifier is testable without GitHub and usable on a local run. And a fifth bucket, `knownBugExposed`, covers `EXPOSE_KNOWN_BUGS=true` runs, where a known-bug test is surfaced as a real failure (`expectedStatus: "passed"`); without it, such a failure would look like a regression. The classifier keys off both `status` (outcome) and `expectedStatus`, not outcome alone.

**CI report input.** The merge job now runs `merge-reports --reporter html,json` with `PLAYWRIGHT_JSON_OUTPUT_FILE=report.json` and uploads `report.json` as the `playwright-report-json` artifact (14-day retention). `analyze_ci_run` downloads it by run id with `gh run download`. This works from the next CI run onward; the one historical failed run (39670242164) predates the artifact, so its `runId` path has nothing to download.

**Verification done:**

- MCP Inspector CLI (`npx @modelcontextprotocol/inspector@2.12.0 --cli --method tools/list -- node_modules/.bin/tsx src/mcp/qa-server.ts`): lists the three tools with `readOnlyHint`, and each tool, the `qa://known-bugs` resource (26 entries) and the `triage` prompt return correctly. The `--tool-arg` option is variadic, so the server command needs a `--` separator before it.
- Classifier against a real report captured with the JSON reporter: 1 known-bug expected failure (SD-002), 0 regressions, as expected. Against a synthetic report exercising all five buckets: 1 regression (ANSI stripped from the message), 1 flaky, 1 probably-fixed, 1 exposed, 1 plain pass ignored.
- Headless Claude Code over `--strict-mcp-config --mcp-config .mcp.json --allowedTools "mcp__qa__*"`: both servers connect, tool search defers `qa` and loads `find_known_bug` through `ToolSearch`, and the run returns the six `error_user` bugs. stdout stayed clean (the protocol worked), confirming the stdio discipline.
- `npm run typecheck`, `lint`, `format:check` and `check:versions` all pass.

## Exercise D: review the Playwright MCP permissions

This is a security finding on this repo's own configuration; it is kept to the conclusion and the fix, not the method.

**Prediction.** `.claude/settings.json` allows `mcp__playwright__*`, so in a headless `dontAsk` run every Playwright tool is pre-approved, including `browser_run_code_unsafe`. Its own description calls it "RCE-equivalent": it runs arbitrary JavaScript in the Playwright **server's Node process**, not inside the browser page. So it should be able to touch whatever that process can, and the `Read(./.env)` deny rule should not stop it, because (from the permissions docs) Read/Edit deny rules cover Claude's own file tools and the shell file commands Claude Code recognizes, not a separate process that opens files itself. The sandbox does not cover it either, since the sandbox applies to Bash, PowerShell and Monitor, not MCP servers.

**Result (confirmed with harmless probes).** In a `dontAsk` run with only the project allow rule, the tool was called with no prompt. Harmless probes (reporting the Node version, and the `name` field of `package.json`) confirmed the code runs in the server's host Node process with the repository as its working directory and with filesystem access as the user. So an agent working in this repo under the current rule can read and write files the user can, regardless of the `.env` deny rule and the sandbox. The probes were deliberately trivial and read nothing sensitive; the point was to establish reach, not to demonstrate an exploit.

**Why the `.env` deny rule is not enough:** it is a rule on Claude's own tools, and a tool that executes code is a general-purpose capability behind a single permission. The allow rule cannot see arguments (Claude Code ignores `mcp__` rules with parentheses), so `mcp__playwright__*` cannot be narrowed to "only safe snippets". The control that works is denying the specific tool.

**Applied rule set (committed to `.claude/settings.json`):**

- **Deny:** `mcp__playwright__browser_run_code_unsafe`. Verified that a deny rule removes the tool from the toolset entirely: in a run with it denied, the tool was absent (24 Playwright tools instead of 25) and could not be called. This is the one that matters.
- **Replaced the blanket `mcp__playwright__*` allow** with the specific read/interaction tools exploration uses: `browser_snapshot`, `browser_navigate`, `browser_navigate_back`, `browser_click`, `browser_type`, `browser_fill_form`, `browser_select_option`, `browser_hover`, `browser_press_key`, `browser_wait_for`, `browser_take_screenshot`, `browser_console_messages`, `browser_network_requests`, `browser_find`, `browser_tabs`, `browser_resize`. These cover selector verification without a general code-execution or file capability.
- **Ask (not deny)** for `browser_evaluate` and `browser_file_upload`: both are useful for exploration but can read page internals or send a local file, so a person confirms each use, and an unattended `dontAsk` run cannot use them silently. (`browser_evaluate` is in the `pages.md` verification workflow; it now prompts once per use.)
- **Server flags:** kept `--isolated`. I did **not** add `--blocked-origins`: the README is explicit that the origin lists are "not a security boundary" and do not affect redirects, and there is no specific origin to block for saucedemo exploration, so it would be false reassurance. The real boundary is the per-tool deny above.

The blanket allow was convenient for Phase 0 exploration. For an unattended agent, the combination of a code-execution tool and auto-approval is exactly the "untrusted output plus powerful tools" risk from the lesson, so it was narrowed before Module 4 adds subagents that run on their own.

## Checkpoint

**1. The three MCP primitives and who decides; which fits the known-bug catalogue.**
Tools (the model decides to call them), resources (the user or app attaches them, `@server:...`), prompts (the user invokes them, `/mcp__server__prompt`). The catalogue fits **both** a tool and a resource: a `find_known_bug` tool so the model can query it during triage, and a `qa://known-bugs` resource so a person can attach the whole list on demand. One data source, two access paths.

**2. What the model sees of 25 tools before using one, with tool search on, and what changes when it is off.**
With tool search on (default), only the 25 tool **names** and the server's instructions load at session start; the full definition (description and input schema) loads through `ToolSearch` when Claude needs it. Measured: the Playwright server adds 384 tokens deferred. With `ENABLE_TOOL_SEARCH=false`, all 25 definitions load upfront, measured at 22,123 tokens, and `ToolSearch` is not used.

**3. Why `Read(./.env)` in `deny` does not stop an MCP server, and what would.**
A Read deny rule governs Claude's own file tools and the shell file-reading commands Claude Code recognizes (`cat`, `head`, redirections, and so on). An MCP server is a separate process that opens files through its own code, which that rule never sees; the sandbox does not cover MCP servers either. What stops it: do not give the agent a tool that can read arbitrary files. Concretely, deny `mcp__playwright__browser_run_code_unsafe` and do not allow `browser_evaluate` unattended; for OS-level enforcement across all processes, a sandbox or a locked-down container.

**4. A tool returns 80,000 characters: what Claude Code does, and the better design.**
A successful text result over 50,000 characters is saved to a file in the session's `tool-results` directory and replaced in the conversation by the file path, so the agent then has to read it back in pieces, costing a round trip and context. (The 25,000-token `MAX_MCP_OUTPUT_TOKENS` cap triggers the same persist-to-file behavior; the 50,000-character limit is separate and not changed by that variable.) Better design: return a small, structured summary with explicit `limit`/`truncated` fields and pagination, so the answer is a few hundred tokens and the agent never pulls the whole payload. For a tool whose large output is genuinely needed in one piece (a schema, a full tree), raise its own limit with `_meta["anthropic/maxResultSizeChars"]` up to 500,000 rather than relying on the default.
