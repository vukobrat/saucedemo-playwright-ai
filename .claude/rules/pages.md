---
paths:
  - 'src/pages/**'
  - 'src/components/**'
---

# Page objects, components and locators

## Page objects and components

- Pages expose `readonly` locators and intent methods (`addToCart(product)`), not assertions. The only exception is `expectLoaded()`. Why: assertions stay visible in the spec, and pages stay reusable for positive and negative tests.
- Methods take typed data (`Product`, `Customer`), not raw strings. Why: compile-time safety and one place to change data.
- No retries, `if` branches or try/catch in page objects to "handle" broken UI. Why: that hides real bugs; we want them visible.

## Locators

Priority: `getByRole` with an accessible name for interactive controls, then `getByTestId` (configured to `data-test`) for structure and data, then `getByText` or `getByLabel` for content. Never CSS classes, XPath or `nth()` without a comment explaining why. Why: classes and DOM position change with styling; roles and test ids are a contract.

Verified exceptions, do not "fix" these back:

- Open/close menu: `getByRole('button', { name: 'Open Menu' })` / `'Close Menu'`. The `open-menu` and `close-menu` test ids sit on `<img>` elements covered by the buttons, so clicking them times out.
- Side menu items are `<a role="button">`: use `getByRole('button', { name: 'Logout' })`, not `link`. Role locators only match while the menu is open, which is what we want; the test ids report closed items as visible.
- Product card "View details" links: both image and title are `role="button"` with the same name; use the `item-<id>-title-link` test id.
- Products: address them by name through the product card component, not by slug-built ids such as `add-to-cart-sauce-labs-backpack`.
- `LoginPage.login(username, password)` takes raw strings: negative tests submit empty or unknown values that no `User` holds. Valid users log in through the typed `loginAs(user)`.

Before adding a locator, verify it on the live app with the Playwright MCP server (`browser_snapshot`, `browser_evaluate`, `ariaSnapshot()`), and check the cause, not just the symptom. Why: never assume a selector; this app has several traps, and one of them was first documented with the wrong cause.
