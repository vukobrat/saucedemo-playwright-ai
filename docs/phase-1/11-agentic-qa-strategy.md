# Module 11: Agentic QA strategy

The capstone. It turns ten modules of measured runs into a strategy for this repository: [`docs/agentic-qa-strategy.md`](../agentic-qa-strategy.md). Worked answers to the exercises and the checkpoint, a mock interview and the Phase 1 retrospective are in [11-agentic-qa-strategy-answers.md](11-agentic-qa-strategy-answers.md).

## 1. Concept

**A strategy decides where an agent's judgment may change an outcome.** At every point where a mistake would be expensive, it puts a cheaper deterministic check or a person. That is a question about each task, not about each tool. The same triage agent can be trusted to write a report and must not be trusted to edit the assertion the report is about.

**Value follows three properties of a task:**

- **Heavy on reading:** the work is mostly reading code, logs, reports or a live app, and turning them into a short conclusion. That covers exploring an app, triage and review.
- **Cheap to verify:** a person or a check can confirm the output quickly. A failing test, a diff, or an SD id with its catalogue line all qualify.
- **Visible when wrong:** a mistake shows up as red, as a review comment, as an obviously wrong report, never as a silent green.

Mapping selectors, drafting tests, triaging failures and reviewing page objects score high on all three. Changing an assertion, a known-bug marker, a visual baseline or a permission scores low on the third: a mistake there makes red turn green and nobody notices.

**Errors are not symmetric.** An agent error that turns green into red, or produces a noisy ticket, costs some time and is visible. An error that turns red into green (a weakened assertion, a borrowed marker, a product bug called a test bug) ships the bug and silences the suite. The second kind gets prevention in several layers; the first kind gets detection.

**Trust is earned per task, with measurement.** Every claim in the strategy points to a run: an eval score, a probe, a counterfactual. "The agent is good at triage" is a hypothesis until the eval says 34 in 35, and it stays true only while the eval keeps running when the agent changes.

**A person in the loop means decision rights, not approving everything.** A person who approves every step becomes a rubber stamp, and the loop is only as good as their attention at step 200. Put people where actions cannot be undone or where meaning is defined: merges, changes to what "done" means (assertions, markers, baselines, golden labels), changes to permissions, and new known bugs. Give them evidence so that each decision takes a minute. Let code do everything that needs no judgment.

## 2. Why it matters for QA

- **The QA role moves up a level.** When agents draft tests and triage failures, the scarce skill is designing the oracle (the verified app model, the catalogue), the guardrails (hooks, lint, permissions) and the measurement (evals). Phase 0 and Phase 1 built exactly those.
- **"What does green mean?" is the QA question, and agents put it under pressure.** Every risky failure mode in this repo was a way to make green mean less: weakened assertions, vacuous negative checks, silently skipped tests, triage that blamed the test. A strategy that names them, and names a control for each, is what lets a team use agents without losing trust in the suite.
- **Interviewers ask about this now.** "How do you use AI in testing?" has a strong answer only with specifics: what you let it do, what went wrong, what caught it, and what the numbers were.

## 3. Hands-on

Built in this module: [`docs/agentic-qa-strategy.md`](../agentic-qa-strategy.md), linked from the README.

### Exercise A: the value map (your attempt first)

List the QA tasks in your current or last team. For each, score how much of it is reading, how cheap its output is to verify, and how visible a mistake would be. Which three would you hand to an agent first, and which never without review?

### Exercise B: the risk register, from evidence

From Phase 0 and Phase 1, list every time an agent was confidently wrong or a check was silently useless. For each, write which layer caught it: the agent itself, a hook, lint, a re-run, an eval, a person reading a log. What does the distribution tell you?

### Exercise C: find the gaps in the controls

For each risk in the strategy's controls table, check which layers it really has. Find the risks that rest on one layer only, or on an instruction alone. Which would you close first, and how?

### Exercise D: decision rights

Write down, for this repository, what a person decides, what an agent proposes and what code does. Then mark one current decision that could move from a person to code safely, and one that must never move.

### Exercise E: write the strategy

Write `docs/agentic-qa-strategy.md` for a reader with five minutes: an interviewer, a new teammate, a manager. Every claim needs its evidence.

### Exercise F: argue both sides

A manager says: "Agents produce false greens. Ban them from the test suite." Another says: "Let the fix loop repair every red test overnight, unattended." Answer each in three sentences, with numbers from this repo.

## 4. Tradeoffs and pitfalls

- **Controls cost speed, and that is the point at some places only.** Every layer (hook, lint, review, eval) adds latency and maintenance. Spend it where an error is silent and expensive; leave reading, drafting and reporting fast.
- **Rubber-stamping is a failure mode of human review.** A person approving 30 agent PRs a day stops reading them. Keep the decisions few and evidence-backed, and make the risky diffs stand out (a changed assertion, a new marker, a permission).
- **The controls have gaps, written down.** Shell writes bypass the `Edit|Write` hook; for same-repo PRs the review workflow is itself PR-controlled; the fix loop and the skills have probes, not evals; the eval set is close to saturated. A strategy that lists no gaps has not been checked.
- **Models and tools change under you.** Pin versions (`CLAUDE_CODE_VERSION`, models in the scripts), keep evals as regression tests, and re-run them when anything changes. A model upgrade is a change like any other.
- **This app is easy mode.** SauceDemo has no backend data, deterministic behaviour and a famous, documented set of bugs that models already know. A real product adds shared test data, flaky environments, ambiguous requirements and no public catalogue. The same strategy applies, but with more weight on isolation, evidence and evals.
- **Not every task needs an agent.** Whatever code can decide (flaky on retry, expected known-bug failures, schema validity) should be code: cheaper, exact and testable. Agents are for judgment.

## 5. Interview angle

- **"Where do AI agents add value in QA, and where don't you trust them?"** They add value where the work is mostly reading, the output is cheap to verify and mistakes are visible: mapping an app, drafting tests to conventions, triaging failures, reviewing page objects. I measured triage at 34 in 35 on real labelled failures. I don't let them change what green means unreviewed: assertions, known-bug markers, baselines, permissions. Here, an agent's "fix" that changed an expected value to the app's wrong one passed every hook and lint rule. Only classification against an oracle, and review, stop that.
- **"How do you keep a human in the loop without becoming the bottleneck?"** I put people at the irreversible decisions only (merges, definition-of-done changes, permissions, new bugs), give them evidence so a decision takes a minute, and let code handle everything deterministic. Agents return data; pipelines and people act.
- **"Tell me about a time an agent was confidently wrong."** During app exploration, a shared browser page made four personas look completely broken; a fresh context per user showed the real, narrower defects. More recently, my triage agent scored 100% on 33 cases, and two deliberately confusable cases dropped it to 1 in 6. It had never checked the selector named in the error. One sentence in its instructions fixed that, and the eval confirmed it without regressions.

## 6. Checkpoint

1. Name the class of change an agent here may never make unreviewed, and say why.
2. Give one example from this repo where an instruction alone was not enough, and the control that replaced it.
3. Why does every agent report here name the line that decides it?
4. What would you measure before letting the fix loop run unattended in CI?
5. A teammate wants the CI triage switched to Haiku today, because it scored the same at a tenth of the cost. What do you answer?
