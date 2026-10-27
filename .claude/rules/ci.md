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
- Agent workflows (`nightly-triage.yml`, `ai-review.yml`) run `npm run agent:triage` / `agent:review`: Claude Code headless at the pinned `CLAUDE_CODE_VERSION`, read-only tools, `dontAsk`, turn and budget caps, and `--json-schema` output that a workflow step turns into the summary or comment. Never give the agent a write token or let it post. Why: an agent that reads untrusted text (CI logs, pull requests) can be prompt-injected; if it can only return data, the worst outcome is a wrong report.
- `triage-eval.yml` runs `npm run eval:triage` when the triage agent's instructions or inputs change (paths listed in the workflow; add new ones there), and the quality job runs `npm run eval:triage:check` on every PR. Why: a prompt or catalogue change can silently make the agent worse, and a code change can silently make an eval state stop applying.
