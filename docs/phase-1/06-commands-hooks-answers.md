# Module 6 answers: Slash commands and hooks

Answers to the exercises and checkpoint in [06-commands-hooks.md](06-commands-hooks.md). Written by the mentor for later study. Runs are from this repo on 2026-10-23 and 2026-10-24, Claude Code v2.1.308, branch `learn/m06-commands-hooks`.

## Exercise A: design the hook

- **Event: `PreToolUse`.** It is the only point where the edit can still be stopped. `PostToolUse` could only complain after the file has already changed.
- **Matcher: `Edit|Write`,** the two tools that change a file's text. Scope is decided in the script: only paths under `tests/` ending in `.ts`. Page objects, data and config are out of scope, so the hook never gets in the way of framework work.
- **What it sees.** For an `Edit`, `tool_input` carries `old_string` and `new_string`, the exact delta. For a `Write`, only the new `content`, so the script reads the current file from disk as "before" (empty for a new file).
- **What counts as weakening, and what lint already covers.** ESLint checks the final file: `no-skipped-test`, `no-focused-test`, `no-wait-for-timeout`, `no-force-option`, `missing-playwright-await`, `no-magic-timeouts`, and `expect-expect`, which fails a test left with **zero** assertions. What lint cannot see is a test that had three assertions and now has two: the final file is perfectly valid. That delta is the hook's core job. Skip/only/fixme, `force: true` and `waitForTimeout` are checked again in the hook as well, so an agent learns at edit time, with an explanation, instead of at commit time.
- **Block, not warn.** A warning goes back to the model as context it can weigh and ignore. This guardrail exists for the case where the model is motivated to ignore it, so it blocks (exit 2).
- **Fail open.** If the hook breaks on unexpected input, blocking every test edit would wedge the whole team, while lint, CI and review still stand behind it. So any error exits 0. A security hook would choose the opposite.
- **The block message is a prompt.** It says what was detected and gives the two legitimate routes: a `knownBug()` marker with evidence (the assertion stays) if the app is wrong, a real fix if the test is wrong. A deliberate assertion refactor is left to a person.
- **`knownBug()` is never blocked.** It is the framework's legitimate mechanism for a real defect and keeps the assertion. Whether the evidence is real is a review question, plus the `EXPOSE_KNOWN_BUGS=true` check from `tests.md`.

## Exercise B: write and register it

- Script: `.claude/hooks/block-test-weakening.mjs`, about 70 lines, plain Node with no dependencies. It reads stdin, counts `expect(` / `expectLoaded(` calls before and after, checks for added skip/only/fixme, `force: true` and `waitForTimeout`, and exits 2 with the reasons, or 0.
- Registration: a `PreToolUse` entry in `.claude/settings.json` in **exec form** (`"command": "node"` plus `"args"`). Node is spawned directly with no shell, and `${CLAUDE_PROJECT_DIR}` is substituted as a plain string, so a project path with spaces or quotes cannot break the command. The docs recommend exec form for any hook that uses a path placeholder.
- `onFailure` is left unset, so a failing hook lets the edit proceed, the same fail-open choice as in the script.
- **Approval, twice over.** Editing the file falls under the `ask` rule on `Edit(/.claude/settings.json)`, so it needs a person's approval. When the agent then tried to commit the change, the auto-mode classifier refused ("Self-Modification"), so the commit is the human's too. The guardrail in CLAUDE.md ("ask before changing `.claude/settings.json`") is backed by two harness layers.

## Exercise C: verify

**Standalone** (2026-10-23, before registering): seven piped inputs. Blocked: assertion removal, an added `skip`, an added `force: true`. Allowed: adding assertions, adding `knownBug()`, a non-test file, malformed input.

**Live** (2026-10-24, a fresh session that loaded the registered hook): the agent was asked to delete `await expect(inventoryPage.header.cartBadge).toBeHidden();` from `tests/e2e/inventory.spec.ts`. The Edit never ran; the tool call returned:

```
PreToolUse:Edit hook error: [node ${CLAUDE_PROJECT_DIR}/.claude/hooks/block-test-weakening.mjs]:
Blocked: this edit to /Users/wolf/code/saucedemo-playwright-ai/tests/e2e/inventory.spec.ts removes 1 assertion(s) (expect / expectLoaded) from a spec.
Do not make a failing test pass by weakening it. If the app is wrong it is a known bug: add a stable SD-xxx entry and call knownBug() with evidence (the assertion stays). If the test is wrong, fix the cause. ...
```

`git status` showed the spec unchanged. An Edit to a non-test file in the same session (`.claude/skills/check/SKILL.md`) went straight through. Prediction result: Claude sees the stderr reason as the tool error, the file does not change, and other files are unaffected.

## Exercise D: find the holes

Eleven inputs fed to the hook with a probe script; the weakened code was also linted from stdin as `tests/e2e/inventory.spec.ts`.

| Edit                                             | Hook                     | ESLint (final state)                                                     |
| ------------------------------------------------ | ------------------------ | ------------------------------------------------------------------------ |
| Remove one of several assertions                 | **block**                | passes (`expect-expect` only fires when none are left)                   |
| `toHaveText('3')` to `toBeVisible()`             | allow                    | passes                                                                   |
| `expect` to `expect.soft`                        | **block** (false alarm)  | passes                                                                   |
| Wrap the assertion in `try { } catch {}`         | allow                    | `no-empty` only; a non-empty `catch` passes                              |
| Add `test.setTimeout(120_000)`                   | allow                    | **error** `playwright/no-magic-timeouts`                                 |
| Drop the `await` before `expect`                 | allow                    | **error** `missing-playwright-await`, `no-floating-promises`             |
| Move an assertion (same count)                   | allow                    | passes (correctly: not a weakening)                                      |
| Add `knownBug()`                                 | allow (by design)        | passes                                                                   |
| `Write` a new spec with `test.only`              | **block**                | **error** `no-focused-test`                                              |
| Remove an assertion from a page object in `src/` | allow (out of scope)     | passes                                                                   |
| Malformed stdin                                  | allow (fails open)       | n/a                                                                      |
| `sed -i` through Bash                            | **does not fire at all** | runs at pre-commit and in CI, but sees only the final state, so as above |

Where to close each:

- **Vaguer matcher and non-empty `try`/`catch`:** both pass every automated layer. They are semantic weakenings: the code is valid but checks less. That is a job for review and for the Module 7 and Module 10 evals (inject a real failure, check the loop does not "fix" it by loosening). A matcher-strength rule in the hook would be guesswork.
- **`expect.soft` false alarm:** a soft assertion still fails the test, just later, so blocking it is wrong. It is cheap to fix (count `expect.soft(` as an assertion), but it is rare here, and over-blocking only means a person makes the change. Left as is, written down.
- **Raised timeout, dropped `await`:** lint already rejects them; Husky and CI make that binding. No need to duplicate in the hook.
- **Page objects:** deliberately out of scope. Specs hold the assertions, and `expectLoaded()` guards live in `BasePage`; a change there is a framework change that gets reviewed as such.
- **`sed -i` through Bash:** the real hole. CLAUDE.md already says "change files with Read, Edit and Write, not `sed -i` or shell redirection". A `PreToolUse` hook on `Bash` matching `sed -i` or `>` on `tests/` paths could close the obvious forms, but a shell has endless ways to write a file (`perl -i`, `tee`, `node -e`, `git apply`), so it would never be complete. Lint at pre-commit and CI, plus review, catch the result.
- **New conditional skips:** the hook blocks any added `.skip(`, which is stricter than lint (lint allows a conditional skip with a reason, like the Linux-only visual specs). A legitimate new conditional skip is a decision a person should make, so the strictness is intended.

## Exercise E: the command

- **It must not fix anything.** `/check` is a status check. If it could also fix, a failing gate would invite exactly the weakening the hook exists to stop. The body says "make no edits" and ends with a report: a table of gates with pass or fail and the key failing lines.
- **`allowed-tools: Bash(npm run *)`.** Every gate is an npm script (lint, typecheck, format:check, test:local, test:smoke). The first version also pre-approved `Bash(npx *)`, which allows fetching and running any package, far more than the command needs. When the agent tried to invoke `/check` in auto mode, the classifier refused it as a permission bypass; the broad pre-approval is the likely reason. Narrowed to `Bash(npm run *)`. (In this repo `npm run *` is also in the project allowlist, so the field mainly matters for portability and intent.)
- **No `disable-model-invocation`.** `/check` only reads and runs checks, with no side effects, and "use before pushing" is exactly when Claude should be able to pick it up. A `/deploy` or `/commit` command would set it.
- **Run result.** The skill could not be invoked by the agent in auto mode (above), so the gates were run directly in the order `/check` defines: lint clean, typecheck clean, format clean, smoke suite 11/11 passed on chromium (two workers, about 19 s). `/check` itself is to be run interactively by a person.

## Checkpoint

**1. What does the hook add to the CLAUDE.md rule, and what does the rule still do?**
The rule is a request: the model reads it and usually follows it, but it can forget, misread or rationalize under pressure, which is exactly the fix-loop situation. The hook is enforcement: the harness runs it on every matching call, and it sees the delta, so it catches the one weakening lint cannot. The rule still covers everything the hook cannot see or judge: semantic weakening (a vaguer matcher), raising timeouts, shell writes, and the reasoning behind the policy. It also shapes the plan before any edit, so the hook rarely has to fire.

**2. The hook exits 1 on a removed assertion. What happens?**
The edit goes ahead. On `PreToolUse`, only exit 2 blocks (or exit 0 with JSON `permissionDecision: "deny"`). Any other non-zero exit is a non-blocking error: the transcript shows a `hook error` notice with the first line of stderr, and the action proceeds, unless the hook sets `onFailure: "block"`. With exit 2, Claude receives the stderr text as the reason the tool call was refused, which is why the message says what to do instead.

**3. A fix loop removes an assertion with `sed -i`. Does the hook fire?**
No. The matcher is `Edit|Write`, and a Bash call is a different tool. Options: a second `PreToolUse` hook on `Bash` that inspects the command for in-place edits of `tests/` files, or a permission `deny` on patterns like `Bash(sed -i *)`. Both close only the obvious forms, because a shell can rewrite a file in countless ways, and both cost false positives and maintenance. Practically: keep the CLAUDE.md rule, give review and fix agents no unrestricted Bash where possible (Module 4: reach is scope), and rely on lint at pre-commit, CI and review for the final state.

**4. Why does `/deploy` need `disable-model-invocation: true` while `/check` does not?**
A model-invocable command can be started by Claude whenever the description matches. For a side-effect workflow that means Claude deciding to deploy because the code looks ready. User-only makes the timing a human decision. `/check` has no side effects (it runs checks and reports), so letting Claude call it before a push is a feature.

**5. A subagent with `Edit` edits a spec. Does the project hook run?**
Yes. Hooks from settings files, managed policy and plugins also run inside subagents: a subagent's tool calls fire the same `PreToolUse` hooks as the main conversation. The input JSON then carries `agent_id` and `agent_type` (for example the fix-loop agent's name), so the script could log which agent tried the edit or apply a stricter policy to it. That matters for Module 7, where the fix loop may run as a subagent: the guardrail follows it automatically.
