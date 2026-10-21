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
- *How do you stop an AI agent from inventing selectors?* Give it a real browser through MCP, require verification on the live app before a locator is written, and record the verified selector map in a file the agent reads. In this repo two "obvious" locators (the menu `data-test` on an image, role queries inside an `aria-hidden` menu) would have failed.
- *What went wrong when you used an agent for exploration?* The shared-page false positives above. A strong answer names the failure, the detection (results too broad to be plausible, re-verification), and the systemic fix (isolation, verify-before-report rule in CLAUDE.md).

### 2026-10-21 - Step 1: bootstrap

**Built** - `package.json` with exact pins, Node 24 via `.nvmrc`, strict `tsconfig.json`, `.gitignore`, MIT license.

**Concepts**
- Reproducibility starts before the first test: pinned runtime, pinned dependencies, lockfile.
- Playwright transpiles TypeScript but never type-checks it, so `tsc --noEmit` is a separate gate.

**Interview notes**
- *Why does a Playwright project need a separate typecheck step?* Playwright runs tests even with type errors; only `tsc` catches them. In CI it runs in the quality job before any browser starts, which is cheaper than failing a test run.

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
- *CLAUDE.md, permissions or hooks: which do you use for what?* CLAUDE.md for guidance and conventions (probabilistic). Permissions for capability boundaries per tool call (deterministic allow/ask/deny). Hooks for deterministic automation or validation with custom logic, for example running lint after every edit or blocking edits that delete assertions. Example from this repo: "ask before editing workflows" exists both as a CLAUDE.md rule and as an `ask` permission rule.
- *How do you keep an agent's context small in a large test repo?* Short root CLAUDE.md, path-scoped rules for specific folders, reference large docs by path instead of importing them, and delegate exploration to subagents (Phase 1).
