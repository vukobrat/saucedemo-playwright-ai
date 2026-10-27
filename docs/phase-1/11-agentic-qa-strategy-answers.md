# Module 11 answers: Agentic QA strategy

Answers to the exercises and checkpoint in [11-agentic-qa-strategy.md](11-agentic-qa-strategy.md), a mock interview, and the Phase 1 retrospective. Written by the mentor for later study, from the measured runs of Modules 1 to 10.

## Exercise A: the value map

For this repository (scores from high to low on reading-heavy / cheap to verify / visible when wrong):

| Task                                             | Reading | Verify | Visible | Verdict                                                     |
| ------------------------------------------------ | ------- | ------ | ------- | ----------------------------------------------------------- |
| Mapping the app (selectors, messages, defects)   | high    | high   | high    | Agent, with live verification and a reviewed app model      |
| Triage of failed runs                            | high    | high   | high    | Agent writes the report; the owner acts                     |
| Review of page objects against the rules         | high    | high   | high    | Agent (small model), comment only                           |
| Drafting tests and page objects                  | medium  | high   | medium  | Agent, through skills, always via PR                        |
| Fixing a test bug                                | medium  | medium | low     | Agent proposes, a person reviews the diff; never unattended |
| Changing an expected value or a known-bug marker | low     | low    | **low** | Only with app-model evidence, always reviewed               |
| Approving visual baselines                       | low     | medium | **low** | A person only                                               |
| Changing permissions or agent configuration      | low     | low    | **low** | A person only (auto mode enforces it)                       |

The first three to hand over: mapping, triage, review. Never without review: anything that changes what "green" means.

## Exercise B: the risk register, from evidence

Every time an agent was confidently wrong, or a check was silently useless, in Phase 0 and Phase 1, and what caught it:

| What happened                                                                            | Caught by                                     |
| ---------------------------------------------------------------------------------------- | --------------------------------------------- |
| A shared browser page made four personas look broken (Phase 0)                           | Re-verification with a fresh context per user |
| A selector trap first documented with the wrong cause (Phase 0)                          | A later live probe                            |
| A skip guard with the wrong condition skipped a visual test on every green run (Phase 0) | Reading the run log                           |
| A shared cookie jar made an API negative test pass or fail by order (Phase 0)            | A failing test and `--repeat-each`            |
| Commits made with `--no-verify`, a force-deleted branch (Phase 0)                        | Self-review, restored from the object store   |
| Another agent's trace analysis contained a refuted claim (M1)                            | Checking it against the traces                |
| Token cost estimated as chars/4, a third too low (M2)                                    | Measurement with paired headless runs         |
| `browser_run_code_unsafe` runs outside the sandbox and the deny rules (M3)               | A harmless probe, then a deny rule            |
| A subagent's `tools` list taken for its permissions (M4)                                 | A headless run that denied the calls          |
| `/check` pre-approved `Bash(npx *)` (M6)                                                 | The auto-mode classifier refused the skill    |
| A fix-loop run skipped a verification step on an assumption (M7)                         | The mentor re-ran the step                    |
| Agents used `git diff` and recognised "the exercise" (M7)                                | Reading the transcripts                       |
| A skill's `allowed-tools: Bash` widened a headless allowlist; `curl` ran (M8)            | Reading the transcript                        |
| A nested worktree's work in progress failed the main checkout's lint (M8)                | A deliberate probe                            |
| `--agent` silently dropped the structured output (M9)                                    | The script's strict check (code)              |
| Triage of a failed nightly read today's `main` (M9)                                      | A two-checkout experiment                     |
| The marker stripper left a seam the agent noticed (M10)                                  | Reading the evidence                          |
| The judge rejected four honest answers (M10)                                             | The mentor's own reading                      |
| A biased prompt passed the gate; the set was saturated (M10)                             | Variants that should fail                     |
| The agent called a stale selector a new product bug, 1 in 6 right (M10)                  | New confusable cases                          |
| A usage-limit run reported "71% accuracy" (M10)                                          | Reading the CI log                            |
| One miss looked like a regression caused by a fix (M10)                                  | Five repeats each, old against new            |

**The distribution:** none of these was caught by the agent's own confidence. They were caught by evidence (logs, re-runs, probes, experiments), by code (strict checks, hooks, lint, gates), by the harness (auto mode, permissions) and by a person reading. That is the case for every layer in the strategy.

## Exercise C: gaps in the controls

| Risk                                             | Layers today                              | Gap                                                      | Next                                                               |
| ------------------------------------------------ | ----------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------ |
| Weakening a test through a shell write           | Instruction, lint at commit, review       | The `Edit\|Write` hook never sees `sed -i`               | Low priority: lint and review catch the final state                |
| Semantic weakening (a vaguer matcher, try/catch) | Instruction, review                       | Every automated layer passes it                          | An eval for authoring agents with planted failures                 |
| Untrusted contributor PRs in the review job      | Same-repo and label gates                 | The workflow and scripts are PR-controlled               | Tooling from the base branch, the PR as data                       |
| The fix loop                                     | Instructions, exit criteria, hook, review | Probes only, no eval                                     | An eval with both directions of the trap before any unattended run |
| `write-test` quality                             | Skill, lint, review                       | No eval                                                  | An eval from known gaps with known right answers                   |
| Golden labels                                    | One reviewer                              | No second reviewer                                       | Labels change only through a reviewed PR (true today); keep it     |
| Cost across runs                                 | Per-run caps                              | Nothing tracks the plan's usage across local runs and CI | Sum `total_cost_usd` per day in the job summaries                  |

The first to close: an eval for the fix loop, because it is the one agent that can edit tests.

## Exercise D: decision rights

- **A person decides:** merging; changes to assertions, expected values, known-bug markers, visual baselines and golden labels; new `SD-xxx` entries; permissions and agent configuration; whether a review or eval run is worth its cost.
- **An agent proposes:** classifications with the deciding line; tests and page objects through skills; fixes for test bugs within the exit criteria; coverage gaps.
- **Code does:** gates (lint, typecheck, tests, the eval), deterministic classification (flaky on retry, expected and exposed known bugs, stale markers), schema validation, and posting reports.

**Could move from a person to code safely:** opening an issue for a new regression found by the nightly triage. The posting is deterministic and the content is a reviewed schema. **Must never move:** approving a change to what green means, whether a baseline, an expected value or a marker.

## Exercise E: the strategy

Written to [`docs/agentic-qa-strategy.md`](../agentic-qa-strategy.md): value with evidence, risks seen here, layered controls, decision rights, measurement, the choice of mechanism, and next steps. Every row points to a module that measured it.

## Exercise F: both sides

**"Ban agents from the suite, they produce false greens."** The false greens came from agents without controls, and people produce them too: a wrong skip guard, an over-eager expectation update. With an oracle, a hook and an eval, the triage agent here is at 34 in 35 on real labelled failures with zero product bugs called test bugs, for 2 to 8 cents per nightly triage. A ban gives that up without removing the risk; the controls address the failure mode itself.

**"Let the fix loop repair every red test overnight, unattended."** The danger is not fixing test bugs, it is "fixing" product bugs: an expectation flipped to the app's wrong value passes every hook and lint rule, and even the triage agent got the two confusable cases right only 1 time in 6 before its instructions were fixed. Unattended, that becomes a silent false green by morning. The loop can run overnight to _propose_ fixes as PRs, after it has its own eval with zero critical errors over repeats.

## Checkpoint

**1. The change an agent may never make unreviewed.**
A change to what green means: an assertion or expected value, a `knownBug()` marker, a visual baseline, a golden label, or the permissions and checks themselves. Errors there are silent: they turn red into green, which ships the bug and teaches the team to trust a suite that has stopped checking.

**2. An instruction that was not enough, and its replacement.**
"Never weaken a test" in CLAUDE.md became a `PreToolUse` hook that blocks removed assertions and added skips, plus the eval's zero gate on product bugs called test bugs. Also: "triage the code that ran" became a checkout of `workflow_run.head_sha`; "only npm scripts" became a scoped `allowed-tools`; "never read `.env`" is a deny rule.

**3. Why every report names the deciding line.**
So a person can check it in a minute instead of repeating the investigation, which is what keeps human review affordable and not a rubber stamp. It also exposes confident wrongness: a report whose deciding line does not support its category is visibly wrong.

**4. Before the fix loop runs unattended.**
An eval like the triage eval, with injected test bugs and real product bugs that look alike, in isolated checkouts. Measure how often it fixes test bugs at their cause, how often it correctly stops on everything else, and its critical errors (a product bug made green), which must be zero over repeats. Track turns and cost per case, and how it behaves when a guardrail refuses an edit. And its output stays a PR, never a merge.

**5. "Switch to Haiku today."**
Not yet. Both models scored 34 in 35 on a set that is close to saturated, so it cannot tell them apart. On the two confusable cases they were 1 in 6 and 3 in 6 before the fix, which is noise at that size. Add harder cases, run both three times, compare critical errors first and accuracy second. And check the stake: a nightly triage costs 2 to 8 cents on Sonnet, so the saving is small. The eval runs are where Haiku would save real money.

## Mock interview

- **"How do you stop an AI fix loop from weakening tests?"** Make classification the first step, against an oracle that is not the app's current behaviour (a verified app model, a defect catalogue). Fix only test bugs, at their cause. Block the crude cheats at edit time with a hook, lint the final state, gate an eval on zero "product bug made green" errors, and review every diff. The expectation flip passes every automated check, which is why the oracle and the review are not optional.
- **"How do you evaluate an AI agent?"** Real labelled cases (here, deliberately broken personas with a defect catalogue, markers stripped so the label is not in the code), the real agent in a checkout that hides every trace of the answer, deterministic grading, a separate gate for the costly error, repeats, and variants that should fail. Then hunt for cases where the obvious reading is wrong.
- **"How do you run agents safely in CI?"** As checks: pinned CLI version, read-only tools, `dontAsk` with an allowlist, caps, only the MCP servers needed, schema-validated output that deterministic code posts, no write token for the agent, same-repo and label gates, and the same command runnable locally.
- **"What do agents do about flaky tests?"** As little as possible by judgment. Retries and the report's `flaky` status decide flakiness in code; the agent routes a suspected flake to an investigation that runs the test repeatedly, and it never "fixes" one with a wait or a longer timeout.
- **"How do you keep an agent's context small in a large test repo?"** A short root CLAUDE.md with the guardrails; path-scoped rules per area; reference documents linked rather than imported; subagents for large reads; tool search instead of loading every MCP tool. Measured here: 4,557 to 2,545 tokens per call for the instructions, and deferring the MCP tools saved about 98,000 tokens.
- **"What would you do differently?"** Build the eval earlier. Several later surprises (a skill widening permissions, triage reading the wrong commit, a prompt fix with unknown side effects) would have been cheaper to catch with an eval already in CI.

## Phase 1 retrospective

**What worked**

- **Measuring instead of believing.** Every module ended in a run: token costs, permission probes, headless agents on injected failures, a gated eval. Several "obvious" assumptions failed: `--allowedTools` is not the toolset, `tools` is not permission, chars/4 is not a token count, `subtype: success` is not success.
- **Layers over cleverness.** No single control would have been enough. The hook misses the expectation flip, lint misses semantic weakening, the eval misses what it has no case for. Together they cover each other.
- **Agents that return data.** From Module 4's read-only reviewers to Module 9's schema-output CI jobs, separating judgment from action removed a whole class of risks.

**What went wrong, and what caught it**

- Leaks into every experiment with a known answer (git status, memory, docs, code seams), caught by reading the transcripts.
- Permissions wider than intended (a skill's `allowed-tools`), caught by a transcript and a probe.
- Evidence from the wrong place (the triage checkout, a nested worktree in lint's scope), caught by deliberate experiments.
- An eval too easy to rank anything, caught by running variants.
- An infrastructure failure that looked like a regression, caught by reading the CI log.

**The pattern**, the same as in Phase 0: the mistakes were caught by evidence, not by confidence, and the cheapest catches came from checks that already existed when the mistake happened.
