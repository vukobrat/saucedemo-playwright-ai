# SauceDemo app model (verified)

Facts about https://www.saucedemo.com gathered with the Playwright MCP server on 2026-10-21. Everything here was observed on the live site, not assumed. When the app changes, re-verify and update this file in the same PR as the tests.

Agents: treat this as the source of truth for selectors, messages and known defects. If you observe something that contradicts it, report the difference instead of silently adapting tests.

## Users

All users share the password shown on the login page (provided to tests via the `SAUCE_PASSWORD` env variable).

| Username                  | Login       | Behavior                                                   |
| ------------------------- | ----------- | ---------------------------------------------------------- |
| `standard_user`           | ok (~80 ms) | Reference behavior.                                        |
| `locked_out_user`         | blocked     | `Epic sadface: Sorry, this user has been locked out.`      |
| `problem_user`            | ok          | Broken images, sorting, cart and checkout (see defects).   |
| `performance_glitch_user` | ok (~5.1 s) | Correct behavior but artificially slow.                    |
| `error_user`              | ok          | JS errors on cart actions, sorting alert, broken checkout. |
| `visual_user`             | ok          | Visual defects and randomized inventory prices.            |

## Session and client state

- Login sets a single cookie: `session-username=<username>`, path `/`, **TTL 600 seconds**.
- The cart is stored in `localStorage['cart-contents']` as a JSON array of product ids in insertion order, for example `[4,0]`.
- The cart is not user-scoped: it survives logout (cookie removed, `cart-contents` kept) and appears for the next user who logs in on the same browser.
- Logout removes the cookie. Visiting a protected route without it redirects to `/` with `Epic sadface: You can only access '/<route>' when you are logged in.`
- Implication for tests: a fresh browser context per test plus `storageState` saved right after login gives every test a logged-in session with an empty cart.

## Routes

| Route                                                              | Page                                                 |
| ------------------------------------------------------------------ | ---------------------------------------------------- |
| `/`                                                                | Login                                                |
| `/inventory.html`                                                  | Products (inventory)                                 |
| `/inventory-item.html?id=<id>`                                     | Product details; unknown id renders "ITEM NOT FOUND" |
| `/cart.html`                                                       | Your Cart                                            |
| `/checkout-step-one.html`                                          | Checkout: Your Information                           |
| `/checkout-step-two.html`                                          | Checkout: Overview                                   |
| `/checkout-complete.html`                                          | Checkout: Complete!                                  |
| `/dynamic-catalog-lazy-load.html`, `-spinner.html`, `-slider.html` | Dynamic Catalog variants                             |

Deep links to any route except `/` return **HTTP 404** but the SPA still renders the page. Never assert `response.ok()` after `page.goto()`.

## Selectors (`data-test` values)

The app has near-complete `data-test` coverage. Configure `testIdAttribute: 'data-test'` and use `getByTestId`.

- **Login:** `username`, `password`, `login-button`, `error` (`<h3 role="alert">`), `error-button` (dismiss, accessible name "Dismiss error"). Inputs get class `error` while an error is shown.
- **Header:** `primary-header` holds `open-menu`, `close-menu` and `shopping-cart-link` (`role="button"`, accessible name "Cart, empty", "Cart, 1 items", "Cart, 2 items", ...) with `shopping-cart-badge` (absent when the cart is empty). The page `title` sits in the secondary header, outside `header-container`; the product details page has no title.
- **Side menu:** a `navigation` whose items are `<a role="button">`: `inventory-sidebar-link` ("All Items"), `dynamic-catalog-sidebar-link` ("Dynamic Catalog", a disclosure button, see [Dynamic Catalog](#dynamic-catalog)), `logout-sidebar-link` ("Logout"), `reset-sidebar-link` ("Reset App State"). Only `about-sidebar-link` is a real link (href `https://saucelabs.com/`). Close button: role button "Close Menu".
- **Inventory:** `product-sort-container` (`<select>`, `aria-label="Sort products"`, role combobox), `active-option`, `inventory-list`, `inventory-item` (x6), `inventory-item-name`, `inventory-item-desc`, `inventory-item-price`, `item-<id>-title-link`, `item-<id>-img-link`, `add-to-cart-<slug>` / `remove-<slug>`. Both item links are `<a role="button" aria-label="View details for <name>">`.
- **Product details:** `back-to-products` (button "Back to products"), `inventory-item`, `inventory-item-name`, `inventory-item-desc`, `inventory-item-price`, `add-to-cart` / `remove` (no slug on this page).
- **Cart:** `cart-list`, `inventory-item`, `item-quantity`, `inventory-item-name`, `inventory-item-price`, `remove-<slug>`, `continue-shopping`, `checkout`.
- **Checkout information:** `firstName`, `lastName`, `postalCode` (placeholders "First Name", "Last Name", "Zip/Postal Code"), `cancel`, `continue`, `error`.
- **Checkout overview:** `cart-list`, `payment-info-value` ("SauceCard #31337"), `shipping-info-value` ("Free Pony Express Delivery!"), `subtotal-label`, `tax-label`, `total-label`, `cancel`, `finish`.
- **Checkout complete:** `checkout-complete-container` holding `complete-header` (`<h2>` "Thank you for your order!", the only heading on the page) and `complete-text`, plus `pony-express` (image), `back-to-products`, `generate-pdf-order`.
- **Footer:** `footer` (`<footer>`, role contentinfo), `social-x`, `social-facebook`, `social-linkedin`, `footer-copy` (contains the current year; mask it in screenshots). The social test ids sit on the `<a>` elements themselves (accessible names "X", "Facebook", "LinkedIn"; `href` `https://x.com/saucelabs`, `https://www.facebook.com/saucelabs`, `https://www.linkedin.com/company/sauce-labs/`), all with `target="_blank" rel="noreferrer"`. The copyright reads `© <year> Sauce Labs. All Rights Reserved. Terms of Service | Privacy Policy`; the year is `new Date().getFullYear()` in the browser, and "Terms of Service" and "Privacy Policy" are plain text, not links (verified 2026-10-24).

### Selector traps

1. `data-test="open-menu"` and `data-test="close-menu"` are on `<img>` elements covered by the real buttons. Clicking them times out (pointer intercepted). Use `getByRole('button', { name: 'Open Menu' })` / `'Close Menu'`.
2. Side menu items are `<a role="button">`, so `getByRole('link', { name: 'Logout' })` matches nothing; use `getByRole('button', { name: 'Logout' })`. The menu wrapper is `aria-hidden="true"` while closed and flips to `"false"` about 130 ms after opening, so role locators only match an open menu: clicks wait for it, and `toBeHidden()` means closed.
3. Closed menu items sit off-screen (x = -276) but count as visible, so `getByTestId('logout-sidebar-link')` reports visible even when the menu is closed. Never use test ids to check whether the menu is open.
4. Each product card has two `role="button"` elements named "View details for <name>" (image and title). Use the `item-<id>-title-link` test id for the title link.

Correction (2026-10-21): an earlier version of this file blamed trap 2 on `aria-hidden` staying `"true"`. That reading was taken mid-animation; the real cause is `role="button"`. The observation (no link found) was right, the diagnosis was wrong.

## Messages (exact strings)

| Situation                        | Message                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------- |
| Empty username                   | `Epic sadface: Username is required`                                          |
| Empty password                   | `Epic sadface: Password is required`                                          |
| Wrong password or unknown user   | `Epic sadface: Username and password do not match any user in this service`   |
| Locked out                       | `Epic sadface: Sorry, this user has been locked out.`                         |
| Protected route while logged out | `Epic sadface: You can only access '/inventory.html' when you are logged in.` |
| Checkout, empty first name       | `Error: First Name is required`                                               |
| Checkout, empty last name        | `Error: Last Name is required`                                                |
| Checkout, empty postal code      | `Error: Postal Code is required`                                              |

## Product catalog

| id  | Name                              | Price | Slug                                |
| --- | --------------------------------- | ----- | ----------------------------------- |
| 4   | Sauce Labs Backpack               | 29.99 | `sauce-labs-backpack`               |
| 0   | Sauce Labs Bike Light             | 9.99  | `sauce-labs-bike-light`             |
| 1   | Sauce Labs Bolt T-Shirt           | 15.99 | `sauce-labs-bolt-t-shirt`           |
| 5   | Sauce Labs Fleece Jacket          | 49.99 | `sauce-labs-fleece-jacket`          |
| 2   | Sauce Labs Onesie                 | 7.99  | `sauce-labs-onesie`                 |
| 3   | Test.allTheThings() T-Shirt (Red) | 15.99 | `test.allthethings()-t-shirt-(red)` |

- Default order is name A to Z (as listed above).
- Sort options (`<select>` value = label): `az` = Name (A to Z), `za` = Name (Z to A), `lohi` = Price (low to high), `hilo` = Price (high to low). Ties (Bolt T-Shirt and Test.allTheThings() T-Shirt, both 15.99) keep A to Z order in both price directions.
- Checkout tax is 8% of the item total, rounded to cents: 39.98 -> 3.20 -> 43.18; 105.96 -> 8.48 -> 114.44.
- Completing an order clears the cart (badge and `cart-contents` removed); "Back Home" returns to the inventory.
- Checkout "Cancel" on the information step returns to the cart; on the overview it returns to the inventory. Both keep the cart.
- With every field empty, the checkout form reports the first missing field (first name). The error has a dismiss button ("Dismiss error").
- "Generate PDF order" downloads `swag-labs-order-<YYYY-MM-DD_HH-MM-SS>.pdf` (a real PDF, `%PDF-` header).

## Known defects by persona

These are deliberate. Tests in `tests/personas/` assert the correct behavior and mark each defect with `knownBug()`; ids refer to `src/data/known-bugs.ts`.

### problem_user

- SD-101: Every inventory image is the same broken `sl-404` image.
- SD-102: Sorting does nothing: list order and the active option stay "Name (A to Z)".
- SD-103: Add to cart works for Backpack, Bike Light, Onesie; does nothing for Bolt T-Shirt, Fleece Jacket, Test.allTheThings() T-Shirt (Red).
- SD-104: Remove does nothing (inventory page).
- SD-105: Clicking the Backpack name opens `inventory-item.html?id=5` (Fleece Jacket).
- SD-106: Checkout: typing into Last Name overwrites First Name, Last Name stays empty, so Continue fails with `Error: Last Name is required`.
- SD-107: Side menu About links to `https://saucelabs.com/error/404`.

### error_user

- SD-201: Choosing any sort option raises `alert("Sorting is broken! This error has been reported to Backtrace.")` and the order does not change.
- SD-202: Same add-to-cart pattern as problem_user, with page errors `Error: Failed to add item to the cart.`
- SD-203: Remove throws `Error: Failed to remove item from cart.` and keeps the item.
- SD-204: Checkout: Last Name cannot be typed (`TypeError: Cannot read properties of undefined (reading 'value')`).
- SD-205: Continue proceeds to the overview without a last name.
- SD-206: Finish does nothing and stays on the overview (`TypeError: wa.cesetRart is not a function`).

### performance_glitch_user

- SD-301: Login takes about 5.1 to 5.9 s. SD-302: each sort takes about 5.1 to 5.3 s. Both exceed Playwright's default 5 s `expect` timeout. Functionally correct otherwise; budget tests use 2 s (login) and 1 s (sort).

### visual_user

- SD-401: Inventory prices are random on every render (for example Backpack $59.52, then different after sorting). Cart and checkout use the real catalog prices.
- SD-402: First inventory image (Backpack) is the broken `sl-404` image.
- Cart icon is misplaced (x=1034 instead of 1220 at a 1280 px viewport); menu icon is 21 px instead of 20 px. Not asserted in the DOM; covered by visual regression.

### standard_user

Ids refer to `src/data/known-bugs.ts`.

- SD-001: Side menu "Reset App State" clears the cart badge and `cart-contents`, but product buttons keep showing "Remove" until the page reloads.
- SD-002: The cart button's accessible name is "Cart, 1 items" for a single item (grammar defect visible to screen reader users).
- SD-003: Checkout works with an empty cart: the overview shows "Total: $0.00" and Finish completes the order.
- SD-004: A last name of only spaces passes checkout validation.
- SD-005: The Dynamic Catalog Lazy Load list has "Test.allTheThings() T-Shirt (Red) (L)" twice in every cycle (two catalog entries, ids 13 and 14, share the name), so one cycle holds 22 entries instead of 21.

## Dynamic Catalog

Verified on 2026-10-28 with the Playwright MCP server and the app's own source (timings and batch size). Three read-only views of the catalog: no cart buttons, no links to product details.

- **Menu:** "Dynamic Catalog" is a disclosure button (`aria-expanded`, `aria-controls="dynamic_catalog_submenu"`). The submenu `dynamic-catalog-submenu` exists in the DOM only while expanded and holds three `<a role="button">` items: "Lazy Load", "Spinner", "Slider" (`dynamic-catalog-lazy-load-link`, `-spinner-link`, `-slider-link`). It starts collapsed on every page, also after navigating from it.
- **Card:** all three pages render the same card: `<prefix>-img` (`alt` = name), `<prefix>-name`, `<prefix>-price` (`$9.99`). The prefix is `spinner-item-<product id>` on the Spinner page, `lazy-load-item-<position>` on the Lazy Load page and `dynamic-catalog-slider-item` on the Slider page.
- **Spinner** (`/dynamic-catalog-spinner.html`, title "Dynamic Catalog - Spinner"): inside `dynamic-catalog-spinner-container`, a spinner `dynamic-catalog-spinner` (`role="status"`, `aria-label="Loading"`) shows for a random 0.5 to 3 s (`500 + Math.random() * 2500` ms; measured 0.7 to 2.9 s), then `dynamic-catalog-spinner-grid` replaces it with the six catalog products in id order, at their catalog prices.
- **Slider** (`/dynamic-catalog-slider.html`, title "Dynamic Catalog - Slider"): `dynamic-catalog-slider-container` shows one product (`dynamic-catalog-slider-item`), starting with the first by id, and a dot list `dynamic-catalog-slider-dots` with six `<button>`s `dynamic-catalog-slider-dot-<0..5>`, named "Show <product name>", the current one `aria-current="true"`. A `setInterval` of 2000 ms advances to the next product and wraps after the last. A dot click shows its product but does not restart the interval, and nothing pauses it: not hover, not focus, not `prefers-reduced-motion` (SD-505).
- **Lazy Load** (`/dynamic-catalog-lazy-load.html`, title "Dynamic Catalog - Lazy Load"): `dynamic-catalog-lazy-load-container` holds cards `lazy-load-item-<position>`. A card shows a placeholder `lazy-load-item-<n>-placeholder` ("Loading…") until it scrolls into view, then renders within about 50 ms. The sentinel `dynamic-catalog-lazy-load-sentinel` after the list appends 6 cards each time it enters the viewport (an `IntersectionObserver`), so on load the list grows until it fills the viewport (12 cards at 1280x720, of which 4 are placeholders). The list never ends: it cycles through 22 entries (still 300 cards after 40 scrolls). An entry is a product, and the Bolt T-Shirt, Fleece Jacket and Red T-Shirt come in sizes XS to XXL ("Sauce Labs Fleece Jacket (XS)"), each at its product's catalog price.
- **Testing timers:** `page.clock` (`src/utils/clock.ts`) pauses the Spinner and Slider timers, so a test sees each state for as long as it needs and moves on with `page.clock.runFor()`. axe cannot scan a page whose clock is paused: it needs running timers.

## Accessibility (axe 4.14, measured 2026-10-21)

- WCAG 2.0, 2.1 and 2.2 A/AA: zero violations on login (also with an error), inventory (also with the menu open), product details, cart, checkout information, overview and complete, and on the Dynamic Catalog Spinner page (loaded).
- Dynamic Catalog WCAG failures (measured 2026-10-28): SD-503 `color-contrast` (1.4.3) on the Lazy Load "Loading…" placeholders, `#767676` on `#f4f4f4` = 4.12:1, below 4.5:1. SD-504 `target-size` (2.5.8) on the six Slider dots, 10x10 px with 16 px between them, below 24 px. Apart from these, both pages pass.
- Not detectable by axe, SD-505 (WCAG 2.2.2, level A): the Slider rotates every 2 s and nothing stops it. The test follows the ARIA carousel pattern, where rotation stops while keyboard focus is inside the carousel.
- axe best-practice rules: SD-501 `page-has-heading-one` fails on every page (no `<h1>`); SD-502 `region` fails on the login page; SD-506 the three Dynamic Catalog pages have no `main` landmark (`landmark-one-main`), so their content is also outside every landmark (`region`). The other logged-in pages pass both rules.
- Not detectable by axe: the "Cart, 1 items" accessible name (SD-002) is grammatically wrong but present, so automated scans pass it. Functional assertions on accessible names cover such cases.

## API under test: DummyJSON (verified 2026-10-21)

SauceDemo has no public API, so the API layer tests https://dummyjson.com with its public demo account.

- Auth: `POST /auth/login` returns 200 with tokens and the user, and also sets `accessToken`/`refreshToken` HttpOnly cookies (so request contexts must not be shared between tests). Wrong password: 400 `Invalid credentials`; empty fields: 400 `Username and password required`. `GET /auth/me` without a token: 401 `Access Token is required`; with a malformed token: 500 `invalid token` (DJ-001). `POST /auth/refresh` returns new tokens.
- Products: pagination by `limit`/`skip` in id order; `select` returns only `id` plus the selected fields; search matches title and description; unknown id (also non-numeric): 404 `Product with id '<id>' not found`; `/products/category-list` and `/products/category/<name>`.
- Carts: `POST /carts/add` returns 201 with computed totals but stores nothing (`GET` of the new id is 404 `Cart with id '<id>' not found`); missing `userId`: 400 `User id is required`. Line field for the discounted amount differs by endpoint: `discountedPrice` (add) vs `discountedTotal` (get) (DJ-002).

## Environment noise (not product bugs)

- Every page logs `401 (Unauthorized)` for `events.backtrace.io` telemetry, plus some `404` resource errors from deep-link navigations. Triage should ignore these.
- The console warns that password inputs lack `autocomplete` attributes.

## Not yet verified

- Visual differences of visual_user beyond the inventory page.
- Behavior of problem_user and error_user on the product details page add/remove buttons.
