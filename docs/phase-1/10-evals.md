# Module 10: Evals

Verified on 2026-10-27 against the Claude Code docs for v2.1.308 ("Run Claude Code programmatically", "How Claude remembers your project", "CLI reference") and against an eval of the triage agent built and run in this repo. Worked answers to the exercises and the checkpoint, with the run results, are in [10-evals-answers.md](10-evals-answers.md).

## 1. Concept

**An eval is a test suite for an agent.** It has fixed inputs with known right answers (the golden set), runs the agent on each, and a grader scores the outputs against the answers. Two things differ from a unit test. The subject is non-deterministic, so one run is a sample: repeat it and report rates. And the grader can be code or another model.

**A golden set is a dataset, built like test data.** The cases are real or realistic, representative, deduplicated, and labelled by a process a person has reviewed. It is versioned with the code and rebuilt by a script, not by hand. The most useful cases are pairs that differ only in the deciding fact. Here, the same error-user "Remove does nothing" failure is labelled a _known_ product bug in one checkout and a _new_ one in another where the catalogue entry is gone. Only an agent that actually checks the catalogue gets both right.

**Decide in code what code can decide.** The qa server's classifier (Module 3) already separates, deterministically, tests that passed on retry (flaky), known-bug tests failing as expected, exposed known bugs and stale markers. Only the leftover regressions need judgment, so that is what the model is evaluated on. An eval that asked the model to spot "flaky" from one failure would measure guessing.

**Two kinds of grader:**

| Grader               | Good for                                                                       | Limits                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Deterministic (code) | Categories, ids, exact values, schema validity: anything with one right answer | Cannot judge free text                                                                                                            |
| LLM-as-judge         | Free text: does the explanation state the deciding fact?                       | It is a model too: it has its own error rate, needs a rubric and calibration against people, and should not gate until calibrated |

**Metrics that matter.** Report accuracy, and also per-class confusion, because a 95% score can hide a whole class getting 50%. Weight errors by their cost: here, "product bug called test bug" gets its own zero-tolerance gate, because it is the error that invites someone to "fix" a correct test into a false green. Measure consistency across repeats (pass^k: right in all k runs), and track cost per case.

**Isolation is the hard engineering.** The agent must not see the answer key, and agents are good at finding it. In this repo the leaks were:

- the git status snapshot (names the modified file)
- commit messages and history
- auto memory, which is keyed by repository and shared across worktrees, so the mentor's notes about injections reached the Module 7 agent
- the lessons in `docs/phase-1/` that describe past injections
- the golden file itself
- the checkout's directory name
- seams in the doctored code

The eval checkout is therefore a `git archive` export with no git metadata, in a neutrally named temp directory, with the leak files removed and `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`.

**Evaluate the eval.** A perfect score is a claim to verify, not a result to celebrate:

- read the agent's evidence on the hardest cases, to tell reasoning from recall
- calibrate the judge against your own reading
- mutation-test the gate: run a deliberately worse agent and confirm the gate fails it

An eval that passes everything, including a bad agent, measures nothing. Choose mutants that should change outcomes. Here a prompt biased toward "test bug" still scored 97%, because the catalogue and the app model outweighed it; an agent without its tools scored 36% and failed the gate. Then look for cases that discriminate: a test bug that mimics a known product bug separated the variants where 33 clean cases could not, and exposed a real weakness in the agent.

**Regression evals run when the agent's inputs change**: its instructions, its tools (the qa server), its knowledge (the catalogue, the app model), its model, or the eval itself. A cheap check that every eval state still applies to the code runs on every PR, so a refactor cannot silently break the eval.

## 2. Why it matters for QA

- **It is the QA discipline applied to agents:** an oracle, reproducible fixtures, a gate in CI, and attention to what the test can and cannot see. QA engineers are well placed to own agent evals.
- **The triage agent shapes decisions.** "Test bug" sends someone to change a test, while "product bug" sends a ticket to developers. A wrong call in the costly direction produces exactly the false greens this phase has fought since Module 6, so the agent is measured before it is trusted and every time it changes.
- **Phase 0 paid for the dataset.** The deliberately broken personas plus a catalogue with stable `SD-xxx` ids are a labelled dataset of real failures. With the markers stripped, 25 known-bug tests become 21 distinct, correctly labelled product-bug cases, at no labelling cost.

## 3. Hands-on

Built in this module:

- `evals/triage/config.json`: code states (edits applied to a fresh export, each required to match exactly once), the runs that produced the failures, and the gate.
- `evals/triage/golden.json`: 35 reviewed cases.
- `evals/triage/mutants/test-first.md`: a deliberately biased agent the gate must fail.
- `scripts/eval/checkout.mjs`: the isolated checkout. `build-triage-golden.mjs`: builds the golden set from real Playwright runs, with no model calls. `run-triage-eval.mjs`: runs, grades and gates.
- `npm run eval:triage`, `eval:triage:build`, `eval:triage:check`; `.github/workflows/triage-eval.yml`; and the state check in CI's quality job.

### Exercise A: the golden set (your attempt first)

What is one case: what does the agent get, and what is the label? Where do labels come from without hand-labelling? Why is a run with `EXPOSE_KNOWN_BUGS=true` not enough on its own? Which categories should the model be scored on, and which does code already decide?

### Exercise B: isolation

List every way the agent under evaluation could learn the answer in this repo, then design a checkout that closes each one. Which cannot be closed, and how do you report them?

### Exercise C: build and review

Run `npm run eval:triage:build`, then review every label. Look for duplicates, cases that are hard but fair, and reference facts that the evidence cannot support.

### Exercise D: run it (predict first)

Run `npm run eval:triage -- --repeat 3 --judge`. Predict the accuracy, the hardest cases, the cost and the variance between repeats.

### Exercise E: evaluate the eval

Read the agent's evidence on the hardest cases, decide for each judge rejection whether the judge or the agent was wrong, and run `npm run eval:triage -- --instructions evals/triage/mutants/test-first.md`. What must happen for the eval to be worth having?

### Exercise F: find a case that discriminates, then improve the agent

With the badge selector stale, error_user's and problem_user's Backpack add-to-cart tests fail with "badge not found": the symptom of SD-202 and SD-103, whose entries name three other products. Add them as cases (state `stale-badge`, run `stale-badge-personas`) and run three variants three times each. Predict who gets them right. Then change the triage agent's instructions to fix what it misses, and prove two things: the hard cases now pass, and the full set does not regress.

### Exercise G: put it in CI

When should the full eval run, what does it cost, and how do you stop a code change from silently breaking an eval state?

## 4. Tradeoffs and pitfalls

- **A saturated eval guards but no longer measures.** At 100%, the eval still catches regressions, but it cannot rank models or prompts. Here Sonnet and a model 11 times cheaper both scored 100%, which is no basis for choosing between them. Two confusable cases changed that: the agents correctly saw that the failing product was not covered by SD-202 or SD-103, then called it a new product bug without checking the locator in the error. Keep adding cases of that kind, where the obvious reading is wrong: runs with several failures at once, failures that need a trace, contradictory evidence.
- **An eval-driven fix needs two proofs.** One added sentence in `.claude/agents/triage.md` (check the locator against the app model's selector list before deciding the app is wrong) took the confusable cases from 1 in 6 to 6 in 6. It counts as a fix only because the full set was re-run afterwards without a regression.
- **States model reality, they are not reality.** Each injected state has exactly one cause and a clean message. Real nightly failures are messier: several causes at once, flaky infrastructure, truncated logs. Add real failed CI runs to the golden set as they happen, labelled after the fact.
- **Labels by construction still need a person.** The review caught a duplicate (two identical unreachable-host failures that differed only in the persona name) and a reference fact that claimed more than the evidence showed. A generator proposes labels; a reviewer owns them.
- **Agents find seams.** The first marker stripper left a blank first line in each test, and the agent noticed: "the markers appear to be missing or stripped". It got the right category anyway, but the checkout no longer looked like a real repository. The stripper now removes the blank line too. One seam is inherent and documented: in the unmarked state, `find_known_bug` lists no spec for any catalogued bug.
- **The judge punishes honesty.** Both of its rejections in the first run were answers that hedged correctly ("most likely an expired session; I could not see the trace"), against a reference fact that demanded certainty. That is why the judge reports and never gates, and why a reference fact must be derivable from what the agent can see.
- **One run of a hard case is noise.** In the regression check after the fix, both models missed `expired-session-1` once. Five runs each with the old and the new instructions gave 4 in 5 and 5 in 5: variance, not a regression. Without repeats, that miss would have looked like damage done by the fix. A run costs about $1.40 for 35 cases on Sonnet and $0.15 on Haiku. Use three repeats when changing the agent, one for routine runs, and five on a disputed case.
- **Per-failure cases lose run-level patterns.** An expired session fails every logged-in test in a run, and one agent even reasoned that a single failure argued against it. The cases present failures one at a time, so that signal is missing. Some environment cases are therefore only borderline decidable, which is a reason to add whole-run cases next.
- **Public golden sets age.** A golden set in a public repo can end up in future training data; for real use, keep a held-out set private.
- **Gate on what you trust.** The gate uses only deterministic grades: category accuracy, known-bug id accuracy and critical errors, in every repeat. The judge's number is trended, not enforced.

## 5. Interview angle

- **"How would you evaluate an LLM agent that triages test failures?"** Build a golden set of real, labelled failures (here from deliberately broken personas, with the markers stripped so the label is not in the code). Run the real agent in an isolated checkout that hides every trace of the answer. Grade the category deterministically, weight the costly error separately, repeat to measure consistency, and gate it in CI whenever the agent or its inputs change.
- **"Deterministic grading or LLM-as-judge?"** Deterministic wherever there is one right answer, because it is cheap, exact and safe to gate on. A judge only for free text, calibrated against human reading, reported rather than gated. And before either, move whatever code can decide out of the model's job.
- **"Your eval says 100%. What do you do?"** Distrust it. Read the evidence on the hard cases for leaks (here the agent had spotted the stripping seam), check what the judge rejected, and run deliberately worse variants to prove the gate can fail. Then hunt for cases where the obvious reading is wrong. Here two such cases dropped the agent to 1 in 6, which led to a one-sentence fix that the eval then confirmed.

## 6. Checkpoint

1. Why is a run with `EXPOSE_KNOWN_BUGS=true` not enough to evaluate the triage agent on known product bugs?
2. Name four ways an agent under evaluation could learn the answer in this repo, and how each was closed.
3. Why does "product bug called test bug" have its own gate, set to zero?
4. The judge rejected two answers. How do you decide whether the judge or the agent was wrong, and why is the judge not part of the gate?
5. How do you know the gate would catch a worse agent?
