import type { Page } from '@playwright/test';

/**
 * Pauses the page's clock before it loads: `setTimeout`, `setInterval` and `Date` stand still
 * until the test moves time on with `page.clock.runFor(ms)`. This makes timer-driven UI, such as
 * a random loading delay or an auto-advancing slider, deterministic. Call it before navigating.
 * Not for axe scans: axe needs running timers, and a scan on a paused page never finishes.
 */
export async function pauseTimers(page: Page): Promise<void> {
  await page.clock.install();
  // pauseAt only moves forward: the fake clock starts at the current time and keeps running
  // until it is paused.
  await page.clock.pauseAt(Date.now() + 1_000);
}
