import { test, expect } from '@fixtures';
import { ALL_PRODUCTS } from '@data/products';
import { SORT_OPTIONS, sortProducts, type SortOption } from '@data/sort-options';

const SORT_CASES = Object.keys(SORT_OPTIONS) as SortOption[];

test.describe('Sorting', { tag: '@regression' }, () => {
  test.beforeEach(async ({ inventoryPage }) => {
    await inventoryPage.goto();
    await inventoryPage.expectLoaded();
  });

  test('products are sorted by name A to Z by default', async ({ inventoryPage }) => {
    await expect(inventoryPage.activeSortOption).toHaveText(SORT_OPTIONS.nameAsc.label);
    await expect(inventoryPage.productNames).toHaveText(
      sortProducts(ALL_PRODUCTS, 'nameAsc').map((p) => p.name),
    );
  });

  for (const option of SORT_CASES) {
    test(`sorts by ${SORT_OPTIONS[option].label}`, async ({ inventoryPage }) => {
      await inventoryPage.sortBy(option);

      await expect(inventoryPage.activeSortOption).toHaveText(SORT_OPTIONS[option].label);
      await expect(inventoryPage.productNames).toHaveText(
        sortProducts(ALL_PRODUCTS, option).map((p) => p.name),
      );
    });
  }
});
