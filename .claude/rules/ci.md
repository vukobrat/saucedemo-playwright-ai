---
paths:
  - '.github/**'
  - 'Dockerfile'
  - '.dockerignore'
  - 'package.json'
  - 'scripts/**'
---

# CI, Docker and dependencies

- CI (`.github/workflows/ci.yml`) runs exactly the npm scripts in `package.json`. Never put checks in a workflow that have no npm script equivalent; the only workflow logic is planning which suite and shard count to run. Why: anything CI checks must be reproducible locally with one command.
- Pipeline: quality job (lint, format, typecheck, versions, plan) then sharded tests in the Playwright container, a "Playwright tests" gate, merged HTML report (artifact), and Pages publishing from `main`. PRs and `main`: `@smoke` on chromium, 2 shards. Nightly 02:00 UTC and manual dispatch: everything, 4 shards. "Lint, format and typecheck" and "Playwright tests" are required checks on `main`; do not rename those jobs.
- `npm run check:versions`: `@playwright/test` in package.json and node_modules must equal the Dockerfile image tag. Upgrade both together, never one. Why: CI picks its container image from the Dockerfile, and a mismatch leaves no usable browsers.
- `.github/workflows/docker.yml` builds the image and runs the smoke suite on all browsers, so the Docker path is proven in CI even where Docker cannot run locally.
- Actions are pinned to full commit SHAs with a `# vX.Y.Z` comment. Why: tags can be moved to malicious code; SHAs cannot.
