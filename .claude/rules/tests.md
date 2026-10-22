---
paths:
  - 'tests/**'
  - 'src/fixtures/**'
  - 'src/data/known-bugs.ts'
  - 'src/utils/known-bug.ts'
---

# Writing tests

- Web-first assertions only (`await expect(locator).toHaveText(...)`). No `waitForTimeout`, no `force: true`, no manual `isVisible()` polling. Why: auto-retrying assertions are the main defence against flakiness.
- Every test carries a suite tag: `@smoke` (critical path, PR gate), `@regression`, `@persona`, `@a11y`, `@visual` or `@api`. Why: CI selects suites by tag.
- Logged-in tests reuse `storageState` through the `persona` fixture option (default `standard`; `test.use({ persona: 'problem' })`). Only login specs log in through the UI, with `test.use({ persona: null })`. Why: speed, and the session cookie has a 10-minute TTL that the setup project refreshes on every run.
- Derive expected values from typed data (catalog prices, `pricing.ts`); never hardcode totals. Why: one fact, one place.
- Tests are independent: no order dependencies, no shared mutable state. Why: `fullyParallel` and sharding run them in any order on any worker.
- Deep links (`/inventory.html`, `/cart.html`) return HTTP 404 while the SPA renders correctly. Do not assert on the navigation response status.

## Known application bugs

Personas `problem_user`, `error_user`, `performance_glitch_user` and `visual_user` have deliberate defects (catalogued in `docs/app-exploration.md`). Test the correct behavior and call `knownBug(KNOWN_BUGS.<entry>)` (`src/utils/known-bug.ts`) as the first line of the test. It marks the test as expected to fail and adds a `known-bug` annotation. Every defect gets one entry with a stable `SD-xxx` id in `src/data/known-bugs.ts`; never pass an ad hoc object. After adding a marker, run the test with `EXPOSE_KNOWN_BUGS=true` and confirm it fails on the documented symptom, not on something else. Why: the suite stays green while the bug exists and turns red when it is fixed, forcing the marker to be removed. `EXPOSE_KNOWN_BUGS=true` disables the marker to produce real failures with traces (eval data for triage agents).
