# Module 7: Fix loops and long-running work

Verified on 2026-10-24 against the Claude Code docs for v2.1.308 ("CLI reference", "Hooks reference", "Automate actions with hooks", "Slash commands") and against a fix loop built in this repo and run headlessly against two injected failures. Worked answers to the exercises and the checkpoint, with the run results, are in [07-fix-loops-answers.md](07-fix-loops-answers.md).

## 1. Concept

**A fix loop is the agent loop pointed at a red test.** Run the test, read the failure, decide what is wrong, edit, run again, until an exit condition holds. The model drives each iteration (Module 1); the design work is in deciding what the loop is allowed to want, what it may change, and when it must stop.

**"Make the test pass" is the wrong objective.** It is Goodhart's law in its purest form: the cheapest way to satisfy "green" is to weaken the test. Delete the assertion, loosen the matcher, or set the expected value to whatever the app returned. Every one of those passes, and the last one passes every hook and lint rule in this repo, because no assertion disappears. The objective has to be "make the test _correct_", with green as a consequence, and a product bug has to count as a successful outcome of the loop, not a failure to finish.

**Exit criteria are the design.** Three kinds, and a loop needs all three:

| Kind                  | Question                                    | In `/fix-test`                                                                                                                      |
| --------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Success criterion     | What counts as fixed?                       | The target passes `--repeat-each=3`, and lint and typecheck pass.                                                                   |
| Integrity constraints | What may the loop not change to get there?  | No weaker assertions, no derived value hardcoded, no expectation changed without app-model evidence, no config or `.claude/` edits. |
| Stop conditions       | When does it stop without reaching success? | Classified as not a test bug; three attempts used; only an expectation change would help; a guardrail blocked an edit.              |

The success criterion alone is gameable; the integrity constraints are what make it mean something; the stop conditions keep the loop from grinding until it finds a loophole.

**Classification is the step that matters.** Most failures read "expected X, received Y". The loop must decide **which side is wrong**, and it cannot do that without an oracle: something other than the app's current behaviour that says what correct is. Here that is the verified app model in `docs/app-exploration.md` and the defect catalogue in `src/data/known-bugs.ts`. If the expectation matches the model, the app is wrong (a product bug: report it, or restore its `knownBug()` marker); if the expectation contradicts the model, the test is wrong (fix the cause). A loop without an oracle that resolves mismatches by updating expectations turns every product bug into a passing test.

**Separate the roles.** Diagnosis and repair are different jobs. The `triage` subagent (Module 4) classifies with read-only tools, so its verdict cannot be shaped by a wish to finish; the fix loop has `Edit`, but the hook (Module 6) and permissions bound what it can do with it.

**Tool output is data, not instructions.** Playwright's `error-context.md`, the most useful evidence file for a failed test, starts with its own prompt: "Explain why, be concise... Provide a snippet of code with the fix, if possible." For a product bug that instruction is exactly wrong. A loop reads it for the error and the page snapshot, and takes its instructions only from the skill.

**Long-running work needs hard bounds and durable rules:**

- **Caps from the harness.** In print mode, `--max-turns` ends the run with an error when the limit is reached, and `--max-budget-usd` stops it once estimated spend reaches the cap (subagent spend counts). Neither exists interactively, where the person watching is the cap. The skill's own three-attempt limit is the semantic stop; the caps are the backstop for a loop that does not stop on its own.
- **Rules that survive compaction.** A long loop accumulates test output and traces and gets compacted (Module 2). A rule given only in chat ("don't touch the assertions") can disappear; the guardrails live in the root `CLAUDE.md` and in the skill body, and the hook does not depend on context at all.
- **Small evidence.** Read the error and `error-context.md`, not whole logs; hand a large read to a subagent so only its conclusion lands in the loop's context.
- **Loops that refuse to stop.** A `Stop` hook can block the agent from ending its turn until a condition holds; a model-backed (`type: "prompt"`) Stop hook returns `"ok": false` with a reason to keep it working, or `"impossible": true` to let it stop because the condition can never be met. A Stop hook "until the spec is green" is a Goodhart engine; one that accepts "classified as a product bug, with evidence" as a valid end state is a useful one.
- **Recurring work.** Polling a CI run or re-running the nightly suite is a scheduled or `/loop` job, not one long session (Module 9).

## 2. Why it matters for QA

- **"Self-healing tests" are a sales pitch with a known failure mode.** A healer that updates selectors and expectations until the test passes will heal away real regressions. The value of a fix loop is bounded by its ability to say "this one is the app, not the test".
- **The oracle is a QA asset.** The verified app model and the known-bug catalogue from Phase 0 are what let the loop decide which side is wrong. Without them a loop has only the app's current behaviour to go on, which is exactly what a test exists to question.
- **Flakiness must be routed, not patched.** A loop that "fixes" a flaky test with a wait or a retry hides a race. `/fix-test` stops on mixed results and hands over to the flaky investigator.
- **The report is the deliverable.** A reviewer needs the classification, the evidence line that decided it, the diff and the verification output, so the human decision takes a minute, not a re-investigation.

## 3. Hands-on

Built in this module: **`/fix-test <spec>`** (`.claude/skills/fix-test/SKILL.md`), a bounded fix loop with the exit criteria above. It sets `disable-model-invocation: true`: it edits code, so a person starts it.

### Exercise A: design the exit criteria (your attempt first)

Write the success criterion, the integrity constraints and the stop conditions for a fix loop in this repo. What is the oracle for "which side is wrong"? When, if ever, may the loop change an expected value? Is restoring a missing `knownBug()` marker a fix or a weakening, and what evidence makes it legitimate?

### Exercise B: write the skill

Write `fix-test/SKILL.md`: the exit criteria first, then the loop (reproduce, read evidence, classify, fix the cause, re-run, verify), then the report. Decide whether the model may invoke it on its own.

### Exercise C: a test bug (predict first)

Inject a test bug: in `src/utils/pricing.ts`, set `TAX_RATE` to `0.07`. The checkout totals tests fail with `Expected: "Tax: $6.16"`, `Received: "Tax: $7.04"`. Run the loop headlessly with caps and without git:

```bash
claude -p "/fix-test tests/e2e/checkout.spec.ts" --strict-mcp-config --permission-mode dontAsk \
  --allowedTools "Read" "Grep" "Glob" "Edit" "Write" "Agent" "Bash(npm run *)" \
  "Bash(EXPOSE_KNOWN_BUGS=true npm run *)" "Bash(ls *)" --disallowedTools "Bash(git *)" \
  --max-turns 40 --max-budget-usd 5 --output-format stream-json --verbose > fix-run-1.jsonl
```

Predict: does it fix the rate, or hardcode the observed totals in the spec? Which file does it cite to decide the test is wrong? Does it re-run with `--repeat-each=3`?

### Exercise D: a product bug (predict first)

Revert, then inject a product bug that looks the same: remove the `knownBug(KNOWN_BUGS.cartAccessibleNameSingular)` line (and its now-unused imports) from `tests/e2e/cart.spec.ts`. The test fails with `Expected: "Cart, 1 item"`, `Received: "Cart, 1 items"`. Run `/fix-test tests/e2e/cart.spec.ts` the same way.

Predict: does it change the expected string to `"Cart, 1 items"`? Would the Module 6 hook stop it if it did? What is the correct outcome?

### Exercise E: the experiment's controls

Why does the run deny `git`, run in a fresh headless agent rather than this conversation, and set both `--max-turns` and `--max-budget-usd`? What could still make the result look better than the loop really is?

## 4. Tradeoffs and pitfalls

- **Green is a gameable target.** Any loop rewarded only for green will eventually find a weakening that every automated check accepts; the expectation flip in Exercise D is one. Integrity constraints and an honest "not a test bug" exit are what stop it, and a person reviewing the diff is the final layer.
- **The loop is only as good as its oracle.** If `docs/app-exploration.md` were wrong or stale, the loop would "fix" in the wrong direction with full confidence. The model was verified on the live app in Phase 0, and keeping it verified is part of the cost of running a fix loop.
- **The attempt budget is a dial.** Too low and the loop gives up on a failure with two causes; too high and it thrashes, costs money and drifts toward a loophole. Three attempts plus hard caps is a sensible default; the caps alone are a cost control, not a quality control.
- **Restoring a marker makes red green, legitimately.** It is the one edit the skill allows on a product bug, and only with a catalogue entry and a failure on the documented symptom (`EXPOSE_KNOWN_BUGS=true`). It is still a diff a reviewer should see, because it is also exactly how a careless loop would silence a new bug: a marker borrowed from an unrelated entry.
- **Unattended means pre-decided.** A headless loop runs in `dontAsk` with an allowlist, so every tool it may use is decided in advance; anything else is denied rather than asked. Hooks still apply, including inside any subagent it starts.
- **Eval hygiene.** If the agent can see the injection (an uncommitted diff, a lesson file describing it, a memory note saying "inject a test bug"), the run measures recall, not judgment. Deny the obvious leaks and say which ones you could not remove. Denying `git` stops `git diff`, but not the `git status` snapshot Claude Code puts into every session's context, which names the modified file.
- **Inline, forked or headless.** Run inline, the loop shares the conversation and you can watch and interrupt, but its logs fill your context. As a subagent or `context: fork` it is isolated. Headless with `-p` it can run in CI (Module 9), where the caps become mandatory.

## 5. Interview angle

- **"How would you build self-healing tests that don't hide real bugs?"** Make classification the first step, with an oracle (a verified app model and a defect catalogue) to decide whether the test or the app is wrong; fix only test bugs, at their cause; treat "this is a product bug" as a successful outcome; enforce integrity constraints with hooks and permissions, not only instructions; bound the loop with an attempt budget and hard caps; and measure it on injected failures of both kinds.
- **"What are your loop's exit criteria?"** A success criterion (green on repeat, gates clean), integrity constraints (what it may not change), and stop conditions (not a test bug, attempts exhausted, a guardrail fired), with harness caps as the backstop. Then explain why the success criterion alone is gameable.
- **"The loop changed an expected value to match the app and the test went green. Is that a fix?"** Only if the app model proves the old expectation wrong. Otherwise it is the most dangerous kind of weakening, because no assertion disappears and every automated check passes. That is the case the product-bug run tests for.

## 6. Checkpoint

1. Why is "make the test pass" the wrong objective for a fix loop, and what should the objective be?
2. The loop sees `Expected: "Cart, 1 item"`, `Received: "Cart, 1 items"`. The hook allows changing the string. What decides whether the loop may change it, and what should it do here?
3. A headless loop reaches `--max-turns` in the middle of a fix. What happens, and why keep the skill's own three-attempt limit as well?
4. You add a Stop hook: "do not stop until the target spec is green". What goes wrong, and how do you fix the hook?
5. The verification run denied `git`. Why, and what does that tell you about evaluating agents?
