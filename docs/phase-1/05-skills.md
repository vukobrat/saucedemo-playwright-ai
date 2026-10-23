# Module 5: Skills

Verified on 2026-10-23 against the Claude Code docs for v2.1.308 ("Agent Skills") and against two skills built and run in this repo. Worked answers to the exercises and the checkpoint, with the run results, are in [05-skills-answers.md](05-skills-answers.md).

## 1. Concept

A **skill** is a reusable procedure Claude loads when it is relevant: a `SKILL.md` file whose YAML frontmatter says when to use it and whose body is the instructions to follow. It lives in `.claude/skills/<name>/SKILL.md` (project) or `~/.claude/skills/<name>/` (personal); custom slash commands are now the same thing, so `.claude/skills/deploy/SKILL.md` and the older `.claude/commands/deploy.md` both make `/deploy`.

**Progressive disclosure is the point.** Unlike CLAUDE.md, a skill's **body loads only when the skill is invoked**. Only the `description` (with `when_to_use`) is always in context, so Claude knows the skill exists; the combined description text is truncated at 1,536 characters in the listing to keep that cost small. Long reference material and scripts stay on disk until needed: files are referenced from `SKILL.md` and read on demand, scripts are executed rather than read into context. So a skill can be large and detailed at almost no standing cost.

**Frontmatter fields that matter here:**

| Field           | Role                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------- |
| `description`   | When to use the skill; drives automatic invocation. Put the key use case first.           |
| `name`          | The `/` command name; defaults to the directory name.                                     |
| `argument-hint` | Shown after `/name` to prompt for arguments.                                              |
| `allowed-tools` | Tools pre-approved for the turn that invokes the skill. It does not restrict the toolset. |

Others exist (`model`, `context: fork`, `disable-model-invocation`, `user-invocable`, `hooks`, `paths`). By default a skill is both user-invocable (`/name`) and model-invocable (Claude loads it when the description matches), and it **runs inline in the main conversation**, not in an isolated context.

**Skill, subagent, slash command: what is the difference?**

- A **skill** is a procedure injected into the current agent's context. The same agent, now with instructions. Inline, shares the conversation.
- A **subagent** (Module 4) is a separate agent with its own context, tools and model; only its report returns. Isolation.
- A **slash command** is just the user-invocation of a skill. Merged into skills.

Roughly: a skill teaches an agent _how_ to do something; a subagent is _another_ agent you hand a job to. A skill can even run as a subagent with `context: fork`, which is where the two meet.

## 2. Why it matters for QA

- **Conventions are long and situational.** "How we write a test here" is pages of rules that matter only while writing a test. A skill carries all of it and costs nothing until `/write-test` is invoked, where a CLAUDE.md section would cost every call (Module 2).
- **A skill is the executable form of the onboarding doc.** The README's "Adding a test" steps are prose a human follows. `write-test` is the same steps an agent follows, every time, in order: verify the selector, keep it in the page object, derive from typed data, tag, assert web-first, mark a real defect with `knownBug()`, run the gates.
- **It composes with the earlier modules.** The skill references `.claude/rules/tests.md` and `pages.md` (Module 2) instead of duplicating them, so there is one source; it verifies selectors with the Playwright MCP server (Module 3); and a subagent can run it (Module 4).
- **It encodes the guardrail at the point of work.** `write-test` says, in the procedure itself, to assert the correct behaviour and mark a real defect as a known bug rather than soften the test. The rule is present exactly when the mistake would be made.

## 3. Hands-on

Two skills in `.claude/skills/`:

- **`write-test`** - add a spec following the framework's conventions.
- **`add-page-object`** - add a page object or component, selectors verified on the live app.

Both reference the existing rules rather than restate them, keep their bodies to the procedure, and end with the quality gates and an explicit report. Invoke with `/write-test <what>` or `/add-page-object <screen>`, or let Claude pick one when a request matches its description.

### Exercise A: design the two skills (your attempt first)

What goes in each `SKILL.md`, and what does not? Decide: which conventions to inline versus reference from `.claude/rules/`; the `description` that routes to it and no other; the `argument-hint`; whether to set `allowed-tools`; and the explicit output each should end with. Why is duplicating the rules into the skill the wrong call?

### Exercise B: write them

Write `write-test/SKILL.md` and `add-page-object/SKILL.md`. Keep each body a procedure, not a rulebook; point at `tests.md`, `pages.md` and `docs/app-exploration.md` for the details.

### Exercise C: verify by invoking (predict first)

Invoke each skill headlessly and check it drives its workflow:

```bash
claude -p "/write-test add an @regression test that the inventory shows exactly six products" \
  --permission-mode dontAsk --allowedTools "Read" "Grep" "Glob" "Edit" "Write" "Bash(npm run *)" \
  --disallowedTools "mcp__*" --output-format stream-json --verbose
claude -p "/add-page-object the Dynamic Catalog lazy-load page" \
  --strict-mcp-config --mcp-config .mcp.json --permission-mode dontAsk \
  --allowedTools "Read" "Grep" "Glob" "mcp__playwright__browser_navigate" "mcp__playwright__browser_snapshot" \
  --output-format stream-json --verbose
```

Predict: does the agent read the referenced rules before writing? Does `write-test` derive the
count from typed data or hardcode `6`? Does `add-page-object` navigate the live app to confirm
selectors? What does the Playwright server need in a headless run to be reachable?

### Exercise D: close the planted gap (optional, larger)

Use `add-page-object` then `write-test` to cover the Dynamic Catalog, the gap the Module 4
`test-gap-analyzer` ranked first. This is a real feature with item-level selectors not yet mapped,
so the live-verification step earns its place.

## 4. Tradeoffs and pitfalls

- **Descriptions cost, bodies do not.** The always-loaded description is the budget to guard; the body is free until invoked. Write a sharp description and move the detail into the body and referenced files.
- **Reference, do not duplicate.** A skill that restates the locator rules will drift from `.claude/rules/pages.md`. Point at the one source; the rules even load as path-scoped rules when the skill edits a matching file.
- **A skill runs inline by default.** Its instructions and any files it reads land in the main context and stay there. For a big, self-contained job, run it as a subagent (`context: fork`) so the work stays isolated.
- **`allowed-tools` pre-approves, it does not sandbox.** It auto-approves the listed tools for the invoking turn only; every other tool is still callable and still governed by your permission settings. It is convenience, not a boundary (contrast the subagent `tools` allowlist in Module 4, which is the toolset).
- **Automatic invocation is a guess.** Claude loads a skill when the description matches; a vague or overlapping description misroutes. `/name` is the deterministic path.
- **A procedure is not a guarantee of judgment.** The skill lists the steps; the model still has to verify a selector honestly and not hardcode a value. The gates at the end (lint, typecheck, `--repeat-each`) are what catch a skipped step.

## 5. Interview angle

- **"When do you reach for a skill versus a subagent versus a CLAUDE.md rule?"** CLAUDE.md for always-true conventions that must be in context every turn. A skill for a procedure needed only sometimes, loaded on demand so it is free until used. A subagent when the job should run in its own context with its own tools and model and hand back only a report. They compose: a subagent can run a skill.
- **"How do skills keep an agent's context small?"** Progressive disclosure: only short descriptions load at startup; the full instructions and any reference files load when the skill is invoked, and scripts are executed, not read. Long procedures cost almost nothing until needed.
- **"How would you make 'write a test the way our team does' repeatable for an agent?"** A `write-test` skill that encodes the team's steps and references the rule files, ending in the quality gates. It is the onboarding doc in executable form, invoked by name or automatically, and verified by running it (here it produced a passing, convention-clean test).

## 6. Checkpoint

1. A skill body is 400 lines. How much of it is in context before the skill is invoked, and what is always loaded?
2. `write-test` must not duplicate the rules in `.claude/rules/tests.md`. Why, and what should it do instead?
3. A skill lists `allowed-tools: Bash`. Does that stop the agent using `Write` during that turn? What does `allowed-tools` actually do?
4. You want "add a page object" to run without polluting the main conversation with its file reads and live-app navigation. What changes, and what do you give up?
