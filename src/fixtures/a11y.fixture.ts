import AxeBuilder from '@axe-core/playwright';
import { test as base } from '@playwright/test';

/** WCAG 2.0, 2.1 and 2.2 at levels A and AA: the legal baseline in most jurisdictions. */
export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

export interface A11yScanOptions {
  /** axe rule tags to run; defaults to WCAG_TAGS. */
  readonly tags?: readonly string[];
  /** Run only these rule ids instead of whole tags. */
  readonly rules?: readonly string[];
  /**
   * Skip these rule ids. Only for a rule that a known bug already fails on this page, and that a
   * separate `knownBug()` test checks on its own.
   */
  readonly disabledRules?: readonly string[];
}

export interface A11yFixtures {
  a11y: {
    /**
     * Scans the current page with axe and returns one readable line per violated rule
     * (`rule-id: help (n elements)`). The full axe result is attached to the test report.
     */
    scan(options?: A11yScanOptions): Promise<string[]>;
  };
}

export const test = base.extend<A11yFixtures>({
  a11y: async ({ page }, use, testInfo) => {
    let scanCount = 0;
    await use({
      async scan({ tags = WCAG_TAGS, rules, disabledRules = [] } = {}) {
        const builder = new AxeBuilder({ page }).disableRules([...disabledRules]);
        const configured = rules ? builder.withRules([...rules]) : builder.withTags([...tags]);
        const { violations } = await configured.analyze();
        scanCount += 1;
        await testInfo.attach(`axe-violations-${scanCount}`, {
          body: JSON.stringify({ url: page.url(), violations }, null, 2),
          contentType: 'application/json',
        });
        return violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length} elements)`);
      },
    });
  },
});
