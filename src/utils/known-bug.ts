import { test } from '@playwright/test';
import { env } from '@config/env';
import type { KnownBug } from '@data/known-bugs';

/**
 * Marks the running test as blocked by a known application defect. The test must still assert
 * the correct behavior: it is expected to fail while the bug exists, and Playwright reports it
 * as a failure once the bug is fixed, so the marker gets removed.
 *
 * With EXPOSE_KNOWN_BUGS=true the expectation is skipped and the test fails for real, which
 * produces genuine failures (with traces) for triage tooling and evals.
 */
export function knownBug(bug: KnownBug): void {
  const description = `${bug.id}: ${bug.summary}`;
  test.info().annotations.push({ type: 'known-bug', description });
  if (!env.exposeKnownBugs) {
    test.info().fail(true, description);
  }
}
