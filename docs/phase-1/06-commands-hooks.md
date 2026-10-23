# Module 6: Slash commands and hooks

Verified on 2026-10-24 against the Claude Code docs for v2.1.308 ("Slash commands", "Hooks reference", "Automate actions with hooks") and against a command and a hook built and run in this repo. Worked answers to the exercises and the checkpoint, with the run results, are in [06-commands-hooks-answers.md](06-commands-hooks-answers.md).

## 1. Concept

**A slash command is a skill you invoke by name.** Custom commands are merged into skills: `.claude/commands/check.md` and `.claude/skills/check/SKILL.md` both create `/check` and behave the same; the skill form adds a folder for supporting files and more frontmatter. Three features matter for commands:

- **Arguments.** `$ARGUMENTS` is everything after the name, `$ARGUMENTS[N]` (or `$N`) one argument by 0-based index. With no placeholder in the body, Claude Code appends `ARGUMENTS: <value>`.
- **Dynamic context.** `` !`gh pr diff --name-only` `` runs before the prompt is sent and is replaced by its output, so the model receives data, not an instruction to fetch it.
- **`disable-model-invocation: true`** makes a command user-only. The docs recommend it for side effects: "You don't want Claude deciding to deploy because your code looks ready." A read-only status check like `/check` can stay model-invocable.

**A hook is code the harness runs, not text the model reads.** CLAUDE.md says "never weaken a test"; that is a request the model can forget, misread or argue its way around under pressure. A hook is a command Claude Code itself runs at a fixed point in the loop, on every matching event, whatever the model intends. It is deterministic enforcement.

```json
"hooks": {
  "PreToolUse": [
    {
      "matcher": "Edit|Write",
      "hooks": [
        {
          "type": "command",
          "command": "node",
          "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/block-test-weakening.mjs"]
        }
      ]
    }
  ]
}
```

| Piece            | Role                                                                                                                                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Event            | When it runs. `PreToolUse` (before a tool call, can block it), `PostToolUse` (after, can feed back), `UserPromptSubmit`, `Stop`, `SessionStart`, `SubagentStart`/`SubagentStop` and others.         |
| `matcher`        | Which tool, by name. `Edit\|Write` alternates; regular expressions work. It filters by name only.                                                                                                   |
| `if`             | A permission-rule pattern on name and arguments, such as `Edit(tests/**)`; the hook process only spawns on a match. Tool events only.                                                               |
| `type`           | `command` here; there are also `http`, `mcp_tool`, and model-backed `prompt` and `agent` hooks for judgment calls.                                                                                  |
| `command`/`args` | With `args`: **exec form**, the executable is spawned directly, no shell, and `${CLAUDE_PROJECT_DIR}` is substituted as a plain string. Without: shell form. The docs prefer exec for placeholders. |
| `onFailure`      | `continue` or `block`: does the action go ahead when the hook itself fails? Unset, it goes ahead on most events.                                                                                    |

**The protocol is stdin, exit code, stderr.** The hook gets the event as JSON on stdin (`tool_name`, `tool_input`, `cwd`, `permission_mode`, and `agent_id`/`agent_type` when it fires inside a subagent). Then:

- **Exit 0:** no objection. Silence does not approve; the normal permission flow still applies.
- **Exit 2:** block. Stderr becomes the reason Claude sees, so the message is a prompt: it should say what to do instead.
- **Any other non-zero exit:** a non-blocking error. The action proceeds. Exit 1 is not a block.
- **Exit 0 with JSON** (`hookSpecificOutput.permissionDecision`: `allow`, `deny`, `ask`, `defer`) for structured control. Choose one style: exit 2 blocks even if the JSON says `allow`.

Hooks live in user, project or local settings, managed policy, plugins, and skill or subagent frontmatter. Settings hooks **also fire for tool calls inside subagents**. They only see what they match: an `Edit|Write` hook does not fire when a file is changed through `Bash`.

**Permissions, hooks, lint and review answer different questions.** A permission rule asks "may this tool, with arguments matching this pattern, run?". A hook asks "is this particular call acceptable?" and can read the full input, including the text being written. Lint asks "is the resulting file acceptable?". Review asks "is the change right?". The test-weakening hook exists because it sees the **delta**: an Edit carries `old_string` and `new_string`, so the hook can tell that an assertion was removed, which ESLint, looking only at the final file, cannot.

## 2. Why it matters for QA

- **Fix loops cheat in predictable ways.** The cheapest way for an agent to turn a red test green is to delete the failing assertion, skip the test or add a wait. Module 7 builds a fix loop; this hook is the tripwire it must not be able to cross.
- **Defense in depth, each layer catching what the others cannot.** CLAUDE.md states the intent; the hook blocks the removal at edit time; ESLint rejects final-state patterns (skip/only, hard waits, `force`, a missing `await`, magic timeouts); Husky and CI repeat lint; a person reviews the PR. The probes in the answers show that no single layer covers every case.
- **The definition of done becomes one command.** `/check` runs lint, typecheck, format and the affected tests in a fixed order and only reports. A checker that is allowed to fix tends to "fix" by weakening, so checking and fixing stay separate.
- **A block that explains itself steers the agent.** The hook's stderr tells Claude the legitimate routes: a `knownBug()` marker with evidence if the app is wrong, a real fix if the test is wrong. A bare "denied" would leave it to guess, and guessing is how it finds the next loophole.

## 3. Hands-on

Built in this module:

- **`/check [spec]`** - `.claude/skills/check/SKILL.md`: runs the definition-of-done gates and reports, without editing.
- **`block-test-weakening`** - `.claude/hooks/block-test-weakening.mjs`, registered as a `PreToolUse` hook on `Edit|Write` in `.claude/settings.json`: blocks an edit to a file in `tests/` that removes `expect` or `expectLoaded` calls, or adds `skip`, `only`, `fixme`, `force: true` or `waitForTimeout`. Adding `knownBug()` is allowed, because the assertion stays. It fails open.

### Exercise A: design the hook (your attempt first)

Which event, which matcher and which files? What counts as weakening, and which of those patterns does ESLint already reject from the final state? For an `Edit`, what does the hook see, and for a `Write`? Block or only warn? Fail open or fail closed if the hook itself breaks? What should the block message say?

### Exercise B: write and register it

Write the script (JSON on stdin, compare before and after, exit 2 with a reason) and register it. Expect to approve the settings change: `.claude/settings.json` has an `ask` rule on its own edits, and auto mode will not let the agent land changes to its own configuration.

### Exercise C: verify (predict first)

Pipe a few PreToolUse inputs into the script, then, in a live session, ask Claude to delete the cart badge assertion from `tests/e2e/inventory.spec.ts`. Predict: what does Claude see, and does the file change? Does an edit outside `tests/` pass through?

### Exercise D: find the holes

List edits that weaken a test, run each one through the hook and through ESLint, and decide where each should be closed (hook, lint rule, permission, review, or an eval). Include at least: a vaguer matcher (`toHaveText('3')` to `toBeVisible()`), wrapping an assertion in `try`/`catch`, a raised timeout, a dropped `await`, `expect` to `expect.soft`, and `sed -i` through Bash.

### Exercise E: the command

Invoke `/check tests/e2e/inventory.spec.ts`. Should it fix a failing gate? Which tools should `allowed-tools` pre-approve, and why is `Bash(npx *)` too much? Does it need `disable-model-invocation`?

## 4. Tradeoffs and pitfalls

- **A hook sees only what it matches.** `Edit|Write` does not see `sed -i`, a shell redirect, `rm` or `git checkout -- file`. That is a second reason for the CLAUDE.md rule "use Edit and Write, not shell writes". Closing the shell path completely is not realistic, because a shell can write a file in endless ways; deny the obvious forms if needed and let lint, CI and review catch the rest.
- **Syntactic, not semantic.** Counting `expect(` catches a deleted assertion, but not one swapped for a vaguer matcher or swallowed by a `try`/`catch`, and it false-positives on `expect.soft`. A hook is a cheap tripwire for the common cheat; judging meaning is review's job and, in Module 10, an eval's.
- **Fail open or fail closed.** A guardrail that crashes and blocks wedges every test edit; one that fails open guards nothing while broken. This hook fails open in code (any error exits 0) and leaves `onFailure` unset, because its job is quality, not security. A secret scanner should fail closed (`onFailure: "block"`). The docs advise setting `onFailure` explicitly wherever the behavior matters.
- **Exit codes are the interface.** Exit 1 does not block; it is reported as a non-blocking error and the edit goes ahead. A hook that "blocks" with exit 1 is a silent no-op. Test the exit code, not just the message.
- **It costs on every call.** `node` starts in about 70 ms on every Edit and Write, test file or not. An `if: "Edit(tests/**)"` filter (one handler per tool) would skip the spawn for other files, at the price of a second place that defines scope.
- **A project hook is code that runs on every contributor's machine.** It runs automatically for anyone who opens the repo in Claude Code, so it is reviewed like any other code in the PR, kept small, and kept in the repo where it can be read.
- **Auto mode is a layer too.** In this module the auto-mode classifier refused to invoke `/check` while it pre-approved `Bash(npx *)` (the likely trigger), refused to spawn a nested `claude`, and refused to let the agent commit its own settings and skill changes. Changes to an agent's own harness are the human's to land.

## 5. Interview angle

- **"How do you stop an AI agent from making a failing test pass by weakening it?"** In layers: the rule in CLAUDE.md; a `PreToolUse` hook that blocks edits removing assertions or adding skip/only, because only an edit-time check sees the delta; lint for final-state patterns; read-only reviewer agents (Module 4); human review; and evals with injected failures to measure whether the loop still cheats. Name the hook's limits: syntactic only, and blind to shell writes.
- **"Hook, permission rule or CLAUDE.md?"** CLAUDE.md is a request to the model. A permission rule is a pattern gate on tool name and arguments. A hook is code that inspects the whole call and can block with a reason the model reads. Use a permission rule when a pattern is enough and a hook when you must look at content or at what changed.
- **"Your guardrail hook crashes. What happens?"** It depends on the exit code and `onFailure`. Anything other than exit 2 lets the action proceed unless `onFailure` is `block`. Choose deliberately: fail open for quality checks so a bug cannot wedge the team, fail closed for security checks.
- **"What makes a good custom command?"** One job, deterministic steps, a defined report, least-privilege `allowed-tools`, and `disable-model-invocation` when it has side effects.

## 6. Checkpoint

1. CLAUDE.md already says "never weaken a test". What does the hook add that the rule cannot, and what does the rule still do that the hook cannot?
2. Your hook exits 1 when it finds a removed assertion. What happens to the edit? Which exit code blocks, and what does Claude see?
3. A fix-loop agent removes an assertion with `sed -i` through Bash. Does the hook fire? How would you close the gap, and what does that cost?
4. Why should a `/deploy` command set `disable-model-invocation: true`, and why does `/check` not need it?
5. A subagent that has `Edit` (say, the Module 7 fix-loop agent) edits a spec. Does the project's `PreToolUse` hook run? How could the script tell the call came from a subagent?
