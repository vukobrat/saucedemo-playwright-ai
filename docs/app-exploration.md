# SauceDemo app model (verified)

Facts about https://www.saucedemo.com gathered with the Playwright MCP server on 2026-10-21. Everything here was observed on the live site, not assumed. When the app changes, re-verify and update this file in the same PR as the tests.

Agents: treat this as the source of truth for selectors, messages and known defects. If you observe something that contradicts it, report the difference instead of silently adapting tests.

## Users

All users share the password shown on the login page (provided to tests via the `SAUCE_PASSWORD` env variable).

| Username | Login | Behavior |
| --- | --- | --- |
| `standard_user` | ok (~80 ms) | Reference behavior. |
| `locked_out_user` | blocked | `Epic sadface: Sorry, this user has been locked out.` |
| `problem_user` | ok | Broken images, sorting, cart and checkout (see defects). |
| `performance_glitch_user` | ok (~5.1 s) | Correct behavior but artificially slow. |
| `error_user` | ok | JS errors on cart actions, sorting alert, broken checkout. |
| `visual_user` | ok | Visual defects and randomized inventory prices. |

## Session and client state

- Login sets a single cookie: `session-username=<username>`, path `/`, **TTL 600 seconds**.
- The cart is stored in `localStorage['cart-contents']` as a JSON array of product ids in insertion order, for example `[4,0]`.
- The cart is not user-scoped: it survives logout (cookie removed, `cart-contents` kept) and appears for the next user who logs in on the same browser.
- Logout removes the cookie. Visiting a protected route without it redirects to `/` with `Epic sadface: You can only access '/<route>' when you are logged in.`
- Implication for tests: a fresh browser context per test plus `storageState` saved right after login gives every test a logged-in session with an empty cart.

## Routes

| Route | Page |
| --- | --- |
| `/` | Login |
| `/inventory.html` | Products (inventory) |
| `/inventory-item.html?id=<id>` | Product details; unknown id renders "ITEM NOT FOUND" |
| `/cart.html` | Your Cart |
| `/checkout-step-one.html` | Checkout: Your Information |
| `/checkout-step-two.html` | Checkout: Overview |
| `/checkout-complete.html` | Checkout: Complete! |
| `/dynamic-catalog-lazy-load.html`, `-spinner.html`, `-slider.html` | Dynamic Catalog variants |

Deep links to any route except `/` return **HTTP 404** but the SPA still renders the page. Never assert `response.ok()` after `page.goto()`.

## Selectors (`data-test` values)

The app has near-complete `data-test` coverage. Configure `testIdAttribute: 'data-test'` and use `getByTestId`.

- **Login:** `username`, `password`, `login-button`, `error` (`<h3 role="alert">`), `error-button` (dismiss, accessible name "Dismiss error"). Inputs get class `error` while an error is shown.
- **Header:** `primary-header`, `open-menu`, `close-menu`, `shopping-cart-link` (`role="button"`, `aria-label` "Cart, empty" or "Cart, 2 items"), `shopping-cart-badge` (absent when the cart is empty), `title`.
- **Side menu:** `inventory-sidebar-link`, `dynamic-catalog-sidebar-link`, `about-sidebar-link` (href `https://saucelabs.com/`), `logout-sidebar-link`, `reset-sidebar-link`.
- **Inventory:** `product-sort-container` (`<select>`), `active-option`, `inventory-list`, `inventory-item` (x6), `inventory-item-name`, `inventory-item-desc`, `inventory-item-price`, `item-<id>-title-link`, `item-<id>-img-link`, `add-to-cart-<slug>` / `remove-<slug>`.
- **Product details:** `back-to-products`, `inventory-item`, `inventory-item-name`, `inventory-item-desc`, `inventory-item-price`, `add-to-cart` / `remove` (no slug on this page).
- **Cart:** `cart-list`, `inventory-item`, `item-quantity`, `inventory-item-name`, `inventory-item-price`, `remove-<slug>`, `continue-shopping`, `checkout`.
- **Checkout information:** `firstName`, `lastName`, `postalCode` (placeholders "First Name", "Last Name", "Zip/Postal Code"), `cancel`, `continue`, `error`.
- **Checkout overview:** `cart-list`, `payment-info-value` ("SauceCard #31337"), `shipping-info-value` ("Free Pony Express Delivery!"), `subtotal-label`, `tax-label`, `total-label`, `cancel`, `finish`.
- **Checkout complete:** `checkout-complete-container` holding `complete-header` (`<h2>` "Thank you for your order!", the only heading on the page) and `complete-text`, plus `pony-express` (image), `back-to-products`, `generate-pdf-order`.
- **Footer:** `footer`, `social-x`, `social-facebook`, `social-linkedin`, `footer-copy` (contains the current year; mask it in screenshots).

### Selector traps

1. `data-test="open-menu"` is on an `<img>` covered by the real button. Clicking it times out (pointer intercepted). Use `getByRole('button', { name: 'Open Menu' })`.
2. The side menu wrapper keeps `aria-hidden="true"` even when open, so `getByRole('link', { name: 'Logout' })` matches nothing. Use the `*-sidebar-link` test ids. Likely also an axe finding.

## Messages (exact strings)

| Situation | Message |
| --- | --- |
| Empty username | `Epic sadface: Username is required` |
| Empty password | `Epic sadface: Password is required` |
| Wrong password or unknown user | `Epic sadface: Username and password do not match any user in this service` |
| Locked out | `Epic sadface: Sorry, this user has been locked out.` |
| Protected route while logged out | `Epic sadface: You can only access '/inventory.html' when you are logged in.` |
| Checkout, empty first name | `Error: First Name is required` |
| Checkout, empty last name | `Error: Last Name is required` |
| Checkout, empty postal code | `Error: Postal Code is required` |

## Product catalog

| id | Name | Price | Slug |
| --- | --- | --- | --- |
| 4 | Sauce Labs Backpack | 29.99 | `sauce-labs-backpack` |
| 0 | Sauce Labs Bike Light | 9.99 | `sauce-labs-bike-light` |
| 1 | Sauce Labs Bolt T-Shirt | 15.99 | `sauce-labs-bolt-t-shirt` |
| 5 | Sauce Labs Fleece Jacket | 49.99 | `sauce-labs-fleece-jacket` |
| 2 | Sauce Labs Onesie | 7.99 | `sauce-labs-onesie` |
| 3 | Test.allTheThings() T-Shirt (Red) | 15.99 | `test.allthethings()-t-shirt-(red)` |

- Default order is name A to Z (as listed above).
- Sort options (`<select>` value = label): `az` = Name (A to Z), `za` = Name (Z to A), `lohi` = Price (low to high), `hilo` = Price (high to low). Ties (Bolt T-Shirt and Test.allTheThings() T-Shirt, both 15.99) keep A to Z order in both price directions.
- Checkout tax is 8% of the item total, rounded to cents: 39.98 -> 3.20 -> 43.18; 105.96 -> 8.48 -> 114.44.
- Completing an order clears the cart (badge and `cart-contents` removed).
- "Generate PDF order" downloads `swag-labs-order-<YYYY-MM-DD_HH-MM-SS>.pdf`.

## Known defects by persona

These are deliberate. Tests assert the correct behavior and mark these with `knownBug()`.

### problem_user
- Every inventory image is the same broken `sl-404` image.
- Sorting does nothing: list order and the active option stay "Name (A to Z)".
- Add to cart works for Backpack, Bike Light, Onesie; does nothing for Bolt T-Shirt, Fleece Jacket, Test.allTheThings() T-Shirt (Red).
- Remove does nothing (inventory page).
- Clicking the Backpack name opens `inventory-item.html?id=5` (Fleece Jacket).
- Checkout: typing into Last Name overwrites First Name, Last Name stays empty, so Continue fails with `Error: Last Name is required`.
- Side menu About links to `https://saucelabs.com/error/404`.

### error_user
- Choosing any sort option raises `alert("Sorting is broken! This error has been reported to Backtrace.")` and the order does not change.
- Same add-to-cart pattern as problem_user, with page errors `Error: Failed to add item to the cart.`; remove throws `Error: Failed to remove item from cart.`
- Checkout: Last Name cannot be typed (`TypeError: Cannot read properties of undefined (reading 'value')`) yet Continue proceeds to the overview without validation.
- Finish does nothing and stays on the overview (`TypeError: wa.cesetRart is not a function`).

### performance_glitch_user
- Login takes about 5.1 s; each sort takes about 5.3 s. Both exceed Playwright's default 5 s `expect` timeout. Functionally correct otherwise.

### visual_user
- Inventory prices are random on every render (for example Backpack $59.52, then different after sorting). Cart and checkout use the real catalog prices.
- First inventory image (Backpack) is the broken `sl-404` image.
- Cart icon is misplaced (x=1034 instead of 1220 at a 1280 px viewport); menu icon is 21 px instead of 20 px.

### standard_user
- Side menu "Reset App State" clears the cart badge and `cart-contents`, but product buttons keep showing "Remove" until the page reloads.

## Dynamic Catalog (currently untested)

Side menu "Dynamic Catalog" expands a submenu (`dynamic-catalog-submenu`) with three variants:

- **Lazy Load** (`dynamic-catalog-lazy-load-link`): container `dynamic-catalog-lazy-load-container` with a scroll sentinel `dynamic-catalog-lazy-load-sentinel`.
- **Spinner** (`dynamic-catalog-spinner-link`): `dynamic-catalog-spinner` (`role="status"`) is replaced by `dynamic-catalog-spinner-grid` once loaded.
- **Slider** (`dynamic-catalog-slider-link`): carousel `dynamic-catalog-slider-container` with items (`-slider-item`, `-item-name`, `-item-price`, `-item-img`) and six dots `dynamic-catalog-slider-dot-0..5`.

Item-level selectors of these pages were not mapped yet.

## Environment noise (not product bugs)

- Every page logs `401 (Unauthorized)` for `events.backtrace.io` telemetry, plus some `404` resource errors from deep-link navigations. Triage should ignore these.
- The console warns that password inputs lack `autocomplete` attributes.

## Not yet verified

- Accessibility violations per page (to be measured with axe).
- Visual differences of visual_user beyond the inventory page.
- Whether checkout is allowed with an empty cart.
- Behavior of problem_user and error_user on the product details page add/remove buttons.
