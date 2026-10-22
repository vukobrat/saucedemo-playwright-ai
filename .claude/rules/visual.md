---
paths:
  - 'tests/visual/**'
---

# Visual regression

- `npm run test:visual` compares against Linux baselines in `tests/visual/__screenshots__/` and skips on other platforms.
- To change baselines, never run `--update-snapshots` locally: dispatch the "Visual baselines" workflow (it also runs on PRs touching `tests/visual/`), download its `visual-baselines` artifact, inspect every image, and commit them in the PR. Why: CI must not approve its own screenshots, and only Linux renders match CI.
