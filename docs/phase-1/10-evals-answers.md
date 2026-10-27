# Module 10 answers: Evals

Answers to the exercises and checkpoint in [10-evals.md](10-evals.md). Written by the mentor for later study. Runs are from this repo on 2026-10-27, Claude Code v2.1.308, branch `learn/m10-evals`, golden set built from `e3b5892`. Costs are client-side estimates on a subscription token.

## Exercise A: the golden set

- **One case** is exactly what the qa server hands the triage agent for one regression: `test`, `file`, `line`, `project` and the cleaned error `message`. The builder copies `cleanMessage` from `src/mcp/ci-report.ts`, so the format matches. The label is a `category`, plus a `knownBugId` for a catalogued defect, and a `decidingFact` that a person can check an explanation against.
- **Labels come from construction, not from hand-labelling.** Each run in `config.json` defines its label: every regression in the `tax-rate` state is a test bug, every one in the unreachable-host run is environment. For known product bugs, a baseline run with the markers in place maps each known-bug test to its `SD-xxx` id through the `known-bug` annotation. The run with the markers stripped then fails the same tests, and the map supplies the label.
- **Why `EXPOSE_KNOWN_BUGS=true` alone is not enough:** the spec still contains `knownBug(KNOWN_BUGS.x)`, so the answer is one `Read` away, and the qa classifier already reports such failures deterministically as `knownBugExposed`. The model is only needed for unmarked failures, so the eval checkout strips the markers (and their imports).
- **What the model is scored on:** regressions only, in four categories: known product bug (with its id), new product bug, test bug, environment. Flaky (passed on retry), expected known-bug failures, exposed known bugs and stale markers are decided in code by `classifyReport`. The answer schema still allows `flaky`, because the agent may say it, but no case is labelled flaky.

The set, 35 cases:

| Source                                                 | Category          | Cases                            |
| ------------------------------------------------------ | ----------------- | -------------------------------- |
| All markers stripped (one per SD id)                   | known product bug | 21                               |
| SD-104 and SD-203 removed from catalogue and app model | new product bug   | 2                                |
| `TAX_RATE` 0.07                                        | test bug          | 2                                |
| Badge test id `shopping-cart-count`                    | test bug          | 2 + 2 confusable (persona specs) |
| Cart title "Your Basket"                               | test bug          | 1                                |
| Backpack price 2899                                    | test bug          | 2                                |
| `BASE_URL` that does not resolve                       | environment       | 1                                |
| Empty saved sessions, `--no-deps`                      | environment       | 2                                |

## Exercise B: isolation

| Leak                                                                                          | Closed by                                                                   |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| The golden set and the eval tooling                                                           | Removed from the checkout (`evals/`, `scripts/eval/`)                       |
| Lessons that describe past injections (`TAX_RATE` 0.07, the badge test id)                    | `docs/phase-1/` and the learning log removed                                |
| The git status snapshot (names the edited file), commit messages, history                     | `git archive` export: no `.git` at all                                      |
| Auto memory (keyed by repository, shared by all its worktrees; it carries the mentor's notes) | `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, and the export is not a git repository |
| The working directory's name (it appears in the agent's context)                              | `mkdtemp` with a neutral `saucedemo-` prefix, never the state name          |
| The marker in the spec                                                                        | Stripped                                                                    |
| The seams of stripping                                                                        | Partly: see below                                                           |

Two more facts surfaced along the way. The export is an untrusted directory, so Claude Code ignored the project's 21 `permissions.allow` entries ("this workspace has not been trusted"): the eval runs with exactly the CLI's allowlist. And the agent's instructions come from the main checkout, so the eval tests the instructions that CI uses.

**What could not be closed, reported:** in the unmarked state, `find_known_bug` lists no referencing spec for any catalogued bug. Agents noticed it ("the markers appear to be missing across this spec"). They drew the right conclusion for a real repository too (a catalogued defect whose test lost its marker), but it remains a cue a real regression would not have. And SauceDemo is famous: the model knows its "deliberate" persona defects from pretraining (see Exercise E), so some known-product-bug calls can come from memory, not from evidence.

## Exercise C: build and review

`npm run eval:triage:build` took about ten minutes of Playwright and no model calls: baseline 25 known-bug tests, the unmarked run 25 failures (21 cases, one per SD id), and every injected state failed only where intended. The temp checkouts were all removed.

The review changed three things before any agent saw the set:

- **A duplicate:** two unreachable-host cases with identical messages that differed only in the persona name. One was kept (`maxCases: 1`). A duplicate inflates the score without testing anything new.
- **A reference fact that claimed too much:** the expired-session fact said the page "redirected to the login page", which the error of `expired-session-1` does not show. It was rewritten to what the evidence supports: "a logged-in page never showed its ready marker although the marker's test id is valid".
- **A hard case kept on purpose:** `expired-session-1` fails with only `inventory-list` not found. It is decidable only by checking that `inventory-list` is a valid test id (app model, line 50), so the page itself did not load.

## Exercise D: run it

`npm run eval:triage -- --repeat 3 --judge` on the first 33 cases:

| Metric                                 | Repeat 1     | Repeat 2     | Repeat 3     |
| -------------------------------------- | ------------ | ------------ | ------------ |
| Category accuracy                      | 33/33 (100%) | 33/33 (100%) | 33/33 (100%) |
| Known-bug id accuracy                  | 21/21        | 21/21        | 21/21        |
| Critical errors                        | 0            | 0            | 0            |
| Evidence judged adequate (Haiku judge) | 33/33        | 33/33        | 31/33        |
| Estimated cost                         | $1.35        | $1.03        | $0.98        |

About 4.9 turns per case. Every pair that differs only in the deciding fact was right: `unmarked-sd-203` (catalogued) versus `uncatalogued-1` (same failure, entry removed), and `unmarked-sd-401` (visual_user's wrong prices) versus `backpack-price-*` (wrong price in the test data). Prediction check: a perfect score was not the prediction, and it turned out to be the start of the investigation, not the end.

## Exercise E: evaluate the eval

**1. Reasoning or recall?** The evidence on the hard cases was reasoned from the checkout. For example, `uncatalogued-1`: "Backpack add-to-cart works (SD-202 lists only Bolt T-Shirt, Fleece Jacket and Red T-Shirt) ... find_known_bug and docs/app-exploration.md have no error_user remove defect". But on SD-201 an agent wrote "`error-user.spec.ts:20` is a blank line where `knownBug(...)` should be ... the markers appear to be stripped". The first stripper removed the marker but left the blank line after it. It now removes both. After the rebuild, no answer mentioned blank lines.

**2. The judge.** Over the runs, 167 answers were judged and 4 were rejected: `unmarked-sd-201`, `expired-session-1` (twice) and `stale-badge-1`. On the mentor's reading, all four answers were adequate. Each hedged honestly ("most likely an expired session; I could not see the trace", "I could not confirm the 'Sorting is broken!' alert from the truncated error"), and the judge failed them for not stating the reference fact as certain. Two causes: a reference fact that claimed more than the evidence (fixed), and a judge that rewards confidence over calibration. That is why the judge reports and never gates.

**3. Variants: does the gate have teeth?** Each variant was run on the 33 cases:

| Variant                                  | Category | Known-bug id | Critical | Gate     | Cost  |
| ---------------------------------------- | -------- | ------------ | -------- | -------- | ----- |
| Real instructions, Sonnet                | 100%     | 100%         | 0        | pass     | $1.35 |
| Mutant "test-first" instructions, Sonnet | 97%      | 100%         | 0        | pass     | $1.32 |
| Real instructions, Haiku                 | 100%     | 100%         | 0        | pass     | $0.12 |
| No tools (the message only), Sonnet      | 36%      | 0%           | 3        | **fail** | $0.95 |

- **The biased prompt did not change outcomes.** Told to "prefer test-bug unless the error proves the application is broken", Sonnet still followed the catalogue and the app model. Its one miss was an environment case called flaky. The eval measures outcomes, and on this set the instructions barely moved them.
- **Removing the oracle did.** Without file or catalogue access, the agent named no ids at all ("I am not naming an SD id because I can't confirm one", which is honest). Its three critical errors are the most instructive answers in the module. For SD-003 it wrote: "SauceDemo never disables Checkout on an empty cart ... so `toBeDisabled()` most likely contradicts the app model". It used its pretraining knowledge of the app as the oracle, and called a correct test wrong.
- **What made the answers right** was the catalogue, the app model and `find_known_bug`, not the instruction file and not the model's size. Haiku matched Sonnet at about an eleventh of the cost.

## Exercise F: a case that discriminates, then a fix

The two confusable cases (`stale-badge-personas-1` and `-2`: Backpack add-to-cart for error_user and problem_user, failing on the stale badge test id), three runs each:

| Variant                     | Before the fix | After the fix |
| --------------------------- | -------------- | ------------- |
| Real instructions, Sonnet   | 1/6            | 6/6           |
| Real instructions, Haiku    | 3/6            | 6/6           |
| Mutant "test-first", Sonnet | 2/6            | (not re-run)  |

Every wrong answer was "new product bug" with reasoning like: "Backpack is not in the catalogue. SD-202 covers only Bolt T-Shirt, Fleece Jacket and Red T-Shirt, and docs/app-exploration.md says error_user add-to-cart works for Backpack". All correct, and then the wrong conclusion: nobody checked the locator in the error (`shopping-cart-count`) against the app model's `shopping-cart-badge`. The persona's known defects framed the failure.

**The fix**, one sentence added to step 3 of `.claude/agents/triage.md`: check the locator the error names against the app model's selector list before deciding the app is wrong; a test id or role the model does not list is a stale selector, a test bug, even when the persona has known defects in the same feature.

**The regression check** on all 35 cases with the new instructions:

| Model  | Category    | Known-bug id | Critical | Judge | Cost  |
| ------ | ----------- | ------------ | -------- | ----- | ----- |
| Sonnet | 34/35 (97%) | 21/21        | 0        | 34/35 | $1.51 |
| Haiku  | 34/35 (97%) | 21/21        | 0        | -     | $0.13 |

Both missed `expired-session-1`, which Sonnet had answered correctly in all four earlier runs. Regression or noise? Five runs each: old instructions 4/5, new instructions 5/5. Noise on a borderline case, not damage from the fix.

That case is also less decidable than it looked. Haiku argued that the URL check passed before the visibility check failed, "so the session was not expired". That is logical, but wrong for this app, where the redirect to login lands just after the URL check. And an expired session fails every logged-in test in a run, a pattern a single-failure case does not show.

The fix also improves production: `scripts/agent-triage.mjs` loads the same instruction file.

## Exercise G: put it in CI

- **`.github/workflows/triage-eval.yml`** runs `npm run eval:triage` (one repeat, Sonnet, about $1.50, 5 to 10 minutes) on same-repo PRs that touch what the agent's answers depend on: `.claude/agents/triage.md`, the headless runner, the eval tooling and data, `src/mcp/**`, `src/data/known-bugs.ts`, `docs/app-exploration.md`. It also runs on manual dispatch with a `repeat` input. It fails when the gate fails, and writes the report to the job summary.
- **Staleness:** the states edit real files (`pricing.ts`, the header component, `messages.ts`, `products.ts`). A refactor there would make an edit stop matching, and the eval would then evaluate nothing. `npm run eval:triage:check` builds every state without model calls, in about a second, and runs in CI's quality job on every PR. It fails the PR that caused the breakage.
- **The first CI run was inconclusive, not failed.** Run 40550764321 answered 25 of 35 cases, all correctly; the other 10 returned "You've hit your session limit · resets 7:10pm (UTC)". The subscription token shares its plan's limits with every other use of that account, and the day's local eval runs had used them up (the Module 9 trade-off, now measured). The gate failed, which was the right outcome, but its message was wrong: "category accuracy 25/35 (71%)" read as a regression. The runner now separates unanswered runs from wrong answers and reports **INCONCLUSIVE** with the cause. It still exits non-zero, because an agent that was not fully measured cannot pass. These runs also end with `subtype: success`; only the missing `structured_output` gives them away.
- **Not in the PR gate:** the full eval itself. It costs money and a few minutes, and most PRs cannot change the agent's answers.

## Checkpoint

**1. Why is `EXPOSE_KNOWN_BUGS=true` not enough?**
The marker is still in the spec, so the answer is one file read away, and the qa classifier already handles a marked, really failing test in code (`knownBugExposed`). Evaluating the model on it measures reading, not triage. The cases need failures without markers: a checkout with the markers stripped.

**2. Four leaks and how each was closed.**
The golden file and the lessons describing injections, removed from the checkout. Git status and history, closed by a `git archive` export without `.git`. Auto memory shared across worktrees, closed by `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`. The directory name, closed by a neutral temp directory. Also the stripping seam (blank lines, fixed) and the marker itself (stripped). The ones left open are reported: `find_known_bug` lists no specs in the unmarked state, and the model's pretraining knowledge of SauceDemo.

**3. Why a separate zero gate for "product bug called test bug"?**
Because errors do not cost the same. A product bug called a test bug sends someone to "fix" a correct test, which is a false green: the bug ships, and the suite stays quiet about it. That is the failure mode this whole phase was built against. A test bug called a product bug costs a bogus ticket and stays visible. An overall accuracy threshold can hide a few critical errors, so they get their own gate, at zero.

**4. The judge rejected answers. Who was wrong?**
Read the answer against the case's input yourself: could the agent have known more? In all four rejections, no. The agent hedged honestly, and the judge, or the reference fact behind it, demanded certainty that the evidence does not support. A judge is a model with its own error rate, and here its errors penalized exactly the behaviour you want (calibrated uncertainty). Until it agrees with human reading, its number is a trend, not a gate.

**5. How do you know the gate would catch a worse agent?**
By running worse agents. A variant without tools scored 36% with three critical errors and failed the gate. A model downgrade and a biased prompt did not change outcomes on the original set, so the gate correctly did not fail them, and that showed the set was too easy to rank variants. Two confusable cases then separated them (1 in 6 right before the fix) and drove a fix that the full set confirmed without regression. Mutants should be chosen to change behaviour, and the set should keep growing cases where the obvious reading is wrong.
