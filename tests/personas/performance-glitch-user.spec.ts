import { test, expect } from '@fixtures';
import { KNOWN_BUGS } from '@data/known-bugs';
import { ALL_PRODUCTS } from '@data/products';
import { sortProducts } from '@data/sort-options';
import { USERS } from '@data/users';
import { knownBug } from '@utils/known-bug';

/** Performance budgets this persona should meet. It misses both by design. */
const LOGIN_BUDGET_MS = 2_000;
const SORT_BUDGET_MS = 1_000;
/** Functional checks wait this long, so slowness is reported by the budget tests only. */
const SLOW_PERSONA_TIMEOUT_MS = 15_000;

test.describe('performance_glitch_user', { tag: '@persona' }, () => {
  test.slow(true, 'Login and sorting are delayed by about 5 seconds by design');

  test.describe('login', () => {
    test.use({ persona: null });

    test.beforeEach(async ({ loginPage }) => {
      await loginPage.goto();
    });

    test('reaches the products page despite the delay', async ({ loginPage, inventoryPage }) => {
      await loginPage.loginAs(USERS.performanceGlitch);

      await inventoryPage.expectLoaded({ timeout: SLOW_PERSONA_TIMEOUT_MS });
    });

    test(`logs in within ${LOGIN_BUDGET_MS} ms`, async ({ loginPage, inventoryPage }) => {
      knownBug(KNOWN_BUGS.performanceSlowLogin);
      const started = performance.now();

      await loginPage.loginAs(USERS.performanceGlitch);
      await inventoryPage.expectLoaded({ timeout: SLOW_PERSONA_TIMEOUT_MS });

      expect(performance.now() - started).toBeLessThan(LOGIN_BUDGET_MS);
    });
  });

  test.describe('inventory', () => {
    test.use({ persona: 'performanceGlitch' });

    test.beforeEach(async ({ inventoryPage }) => {
      await inventoryPage.goto();
      await inventoryPage.expectLoaded({ timeout: SLOW_PERSONA_TIMEOUT_MS });
    });

    test('sorts correctly despite the delay', async ({ inventoryPage }) => {
      await inventoryPage.sortBy('priceAsc');

      await expect(inventoryPage.productNames).toHaveText(
        sortProducts(ALL_PRODUCTS, 'priceAsc').map((p) => p.name),
        { timeout: SLOW_PERSONA_TIMEOUT_MS },
      );
    });

    test(`sorts within ${SORT_BUDGET_MS} ms`, async ({ inventoryPage }) => {
      knownBug(KNOWN_BUGS.performanceSlowSorting);
      const started = performance.now();

      await inventoryPage.sortBy('priceDesc');
      await expect(inventoryPage.productNames).toHaveText(
        sortProducts(ALL_PRODUCTS, 'priceDesc').map((p) => p.name),
        { timeout: SLOW_PERSONA_TIMEOUT_MS },
      );

      expect(performance.now() - started).toBeLessThan(SORT_BUDGET_MS);
    });
  });
});
