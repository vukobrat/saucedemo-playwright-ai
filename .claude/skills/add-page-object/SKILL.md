---
name: add-page-object
description: >-
  Add a new page object or component to this SauceDemo framework: pick the right base class, verify
  selectors on the live app, expose readonly locators and intent methods, and follow the locator
  rules. Use when a new screen or shared UI needs a page object, or an existing one needs locators.
argument-hint: <the screen or component, e.g. "dynamic catalog lazy-load page">
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(npm run *), mcp__playwright__browser_navigate, mcp__playwright__browser_snapshot, mcp__playwright__browser_click
---

# Add a page object

Create a page object or component that matches the ones already in `src/pages/` and
`src/components/`. Produce real, type-checking code, not a sketch.

## Before writing

1. **Read `.claude/rules/pages.md`** (page object and locator rules) and `docs/app-exploration.md`
   for the screen's routes and documented selectors. Read the closest existing page object
   (`src/pages/`) or component (`src/components/`) and copy its shape.
2. **Verify every selector on the live app** with the Playwright MCP server (`browser_navigate`,
   `browser_snapshot`) before you write it. Never assume a selector; this app has documented traps.
   Check the cause, not just the symptom.

## Structure

1. **Choose the base class.** A routed screen extends `AppPage` (adds header, side menu, title,
   footer) or `BasePage` (a routed screen without the app chrome). A piece of shared UI scoped to a
   root locator is a component (`src/components/`), constructed from a `root: Locator`.
2. **A page object sets `pathname` and `readyMarker`** (an element only this page renders; its
   visibility proves the page loaded). `expectLoaded()` is inherited and is the only assertion a
   page object owns.
3. **Expose `readonly` locators and intent methods** (`addToCart(product)`), not assertions, so the
   assertions stay visible in specs. Methods take typed data (`Product`, `Customer`), not raw
   strings. Construct locators in the constructor.
4. **Follow the locator priority:** `getByRole` with an accessible name for controls, then
   `getByTestId` (`data-test`) for structure and data, then `getByText`/`getByLabel`. No CSS class,
   XPath or `nth()` without a comment explaining why. Respect the verified exceptions in
   `pages.md` (menu buttons by role, side-menu items as `role="button"`, the `item-<id>-title-link`
   test id); do not reintroduce the traps they document.
5. **No retries, `if` branches or try/catch** to "handle" broken UI: that hides real bugs.
6. **Wire it up with the tsconfig aliases** (`@pages/*`, `@components/*`, `@data/*`). A new page
   object is injected through a fixture in `src/fixtures/` if specs will use it; follow the existing
   fixture pattern.

## Before you are done

```bash
npm run lint && npm run typecheck
```

Both must pass. Report the new file, the base class you chose and why, and how you verified each
selector on the live app. If the screen has unmapped item-level selectors (the Dynamic Catalog
does), say which you mapped and which remain.
