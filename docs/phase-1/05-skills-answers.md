# Module 5 answers: Skills

Answers to the exercises and checkpoint in [05-skills.md](05-skills.md). Written by the mentor for later study. Runs are from this repo on 2026-10-23, Claude Code v2.1.308, branch `learn/m05-skills`.

## Exercise A: design the two skills

The skill is the **procedure**; the **rules** are the conventions. Keep them apart.

- **Reference, do not inline, the conventions.** Both skills point at `.claude/rules/tests.md`,
  `.claude/rules/pages.md` and `docs/app-exploration.md` instead of restating them. Reasons: one
  source (a copy drifts the moment a rule changes), smaller skill bodies, and a nice synergy with
  Module 2 - those path-scoped rules also load on their own when the skill edits a matching file.
  What the skill _does_ own is the ordering and the decisions: pick the persona, keep locators in
  page objects, verify selectors live, run the gates. That is procedure, not convention.
- **`description` must route to this skill and no other.** `write-test` says "add a test, cover a
  feature or flow, write a spec in `tests/`"; `add-page-object` says "a new screen or shared UI
  needs a page object". Distinct triggers, key use case first (the listing truncates at 1,536
  characters).
- **`argument-hint`** gives the slash-command user a prompt: `<what to test>` and `<the screen or
component>`.
- **`allowed-tools`:** set to the tools each workflow uses (Read/Grep/Glob/Edit/Write/Bash for
  `write-test`; plus the Playwright MCP read tools for `add-page-object`), so the skill's own steps
  run without a prompt on the invoking turn. It is convenience, not a sandbox (see checkpoint 3).
- **Explicit output:** each body ends with "run these gates, report what you added and why". The
  report is what the caller sees, so it is part of the design.
- **Why duplicating the rules is wrong:** two copies of the locator rules will disagree after the
  first edit, and the model follows a stale copy as confidently as a correct one (the Module 2
  lesson about memory). Reference keeps one truth.

## Exercise B: the two skills

Written to `.claude/skills/write-test/SKILL.md` and `.claude/skills/add-page-object/SKILL.md`. Each
body is a short procedure (before / writing / before-you-are-done), references the rule files for
detail, and ends with the quality gates and an explicit report. Both are user- and model-invocable
and run inline.

## Exercise C: verify by invoking

**`write-test`**, invoked as `/write-test add an @regression test that the inventory page shows
exactly six products`:

- Drove the skill's workflow in order: read `.claude/rules/tests.md`, globbed the specs, read the
  neighbouring `inventory.spec.ts`, read `docs/app-exploration.md`, found the inventory page object
  and `src/data/products.ts`, then edited the spec and ran the gates.
- The test it produced:
  ```ts
  test('shows exactly one card per catalog product', async ({ inventoryPage }) => {
    await expect(inventoryPage.productCards).toHaveCount(ALL_PRODUCTS.length);
  });
  ```
  It **derived the count from `ALL_PRODUCTS.length`, not a hardcoded `6`** (the convention: one
  fact, one place), put it in the existing `@regression` group, used the existing `productCards`
  locator (no raw locator in the spec), and used a web-first `toHaveCount`. Lint, typecheck and
  format were clean and it passed **3/3** with `--repeat-each=3`.
- The generated test was discarded afterward: the module ships the skills, not a new spec. That it
  produced a passing, convention-clean test is the verification.

**`add-page-object`**, invoked as `/add-page-object the Dynamic Catalog lazy-load page`:

- Read `.claude/rules/pages.md`, `docs/app-exploration.md`, the inventory page object, `app.page.ts`
  and `base.page.ts`, the product-card and side-menu components, and the pages fixture - the "read
  the rules and copy the closest existing shape" steps.
- **The Playwright server must actually be connected** for the live-verification step. In a plain
  `-p` run it was still connecting (`pending`) and the browser tools were unreachable, so the agent
  could not verify selectors. Re-run with `--strict-mcp-config --mcp-config .mcp.json`, the server
  connected and the skill drove the full live path: navigated to SauceDemo, logged in as the
  standard user, opened the side menu and clicked into the Dynamic Catalog to read the real
  test-ids. (That run hit the turn cap mid-navigation; the point verified is that the skill drives
  the live-selector workflow, which it does.)

Prediction result: yes, both read the referenced rules before acting; `write-test` derived from
typed data rather than hardcoding; `add-page-object` navigates the live app when the Playwright
server is reachable, and a headless run needs that server pinned to connect in time.

## Exercise D: close the planted gap (not done here)

Deliberately left as the natural "use the skills" task: run `add-page-object` then `write-test` to
cover the Dynamic Catalog (the gap `test-gap-analyzer` ranked first). It is sizeable - the
item-level selectors of the three variants are not mapped in the app model - so it belongs in its
own change, not in the module that builds the skills. It is the obvious first demonstration that
the skills earn their keep.

## Checkpoint

**1. How much of a 400-line skill body is in context before it is invoked?**
None of the body. Before invocation, only the skill's `description` (with `when_to_use`) is loaded,
so Claude knows the skill exists; the combined description text is truncated at 1,536 characters in
the listing. The 400-line body, any referenced files, and any scripts load only when the skill is
invoked (scripts are executed, not read into context). That is progressive disclosure: a long,
detailed skill costs almost nothing until it is used.

**2. Why `write-test` must not duplicate `.claude/rules/tests.md`, and what to do instead.**
A duplicated rule set becomes a second source that drifts the moment either copy changes, and the
model follows a stale copy as confidently as the live one. Instead the skill references the rule
file by path and carries only the procedure (order of steps, decisions, the gates). Bonus: because
the rule is path-scoped (Module 2), it also loads on its own when the skill edits a matching file,
so the convention is present at the point of work without being copied.

**3. Does `allowed-tools: Bash` stop the agent using `Write` that turn? What does it do?**
No. `allowed-tools` is an allowlist of tools that are **pre-approved** (run without a prompt) for
the turn that invokes the skill; it does not restrict the toolset. `Write` is still callable and is
still governed by the normal permission settings - it just is not auto-approved by this skill.
Contrast the subagent `tools` field (Module 4), which _is_ the toolset: a tool left off it does not
exist for that subagent. A skill scopes convenience; a subagent scopes capability.

**4. Running `add-page-object` without polluting the main conversation.**
Give the skill `context: fork` (with an `agent` type), so Claude Code runs it as a subagent: its
file reads and live-app navigation happen in a separate context and only its final report returns.
What you give up is the shared history - the forked skill does not see the current conversation, so
its instructions must stand on their own - and the inline back-and-forth; you interact with it as a
background subagent, not inline. For a self-contained job like building one page object, that trade
is usually worth it.
