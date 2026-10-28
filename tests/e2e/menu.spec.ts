import { test, expect } from '@fixtures';
import { ALL_CATALOG_VARIANTS } from '@data/dynamic-catalog';
import { KNOWN_BUGS } from '@data/known-bugs';
import { LINKS, PAGE_TITLES } from '@data/messages';
import { PRODUCTS } from '@data/products';
import { knownBug } from '@utils/known-bug';

test.describe('Side menu', { tag: '@regression' }, () => {
  test.beforeEach(async ({ inventoryPage }) => {
    await inventoryPage.goto();
    await inventoryPage.expectLoaded();
  });

  test('opens and closes', async ({ inventoryPage }) => {
    const { menu } = inventoryPage;

    await menu.open();
    await expect(menu.logoutButton).toBeVisible();

    await menu.close();
    await expect(menu.logoutButton).toBeHidden();
  });

  test('All Items returns to the inventory from another page', async ({
    inventoryPage,
    cartPage,
  }) => {
    await cartPage.goto();

    await cartPage.menu.goToAllItems();

    await inventoryPage.expectLoaded();
  });

  test('Dynamic Catalog expands a submenu of catalog pages', async ({ inventoryPage }) => {
    const { menu } = inventoryPage;

    await menu.expandDynamicCatalog();

    await expect(menu.dynamicCatalogButton).toHaveAttribute('aria-expanded', 'true');
    for (const variant of ALL_CATALOG_VARIANTS) {
      await expect(menu.dynamicCatalogItem(variant)).toBeVisible();
    }
  });

  test('Dynamic Catalog opens each catalog page', async ({
    inventoryPage,
    lazyLoadCatalogPage,
    spinnerCatalogPage,
    sliderCatalogPage,
  }) => {
    await inventoryPage.menu.openDynamicCatalog('lazyLoad');
    await lazyLoadCatalogPage.expectLoaded();
    await expect(lazyLoadCatalogPage.title).toHaveText(PAGE_TITLES.lazyLoadCatalog);

    await lazyLoadCatalogPage.menu.openDynamicCatalog('spinner');
    await spinnerCatalogPage.expectLoaded();
    await expect(spinnerCatalogPage.title).toHaveText(PAGE_TITLES.spinnerCatalog);

    await spinnerCatalogPage.menu.openDynamicCatalog('slider');
    await sliderCatalogPage.expectLoaded();
    await expect(sliderCatalogPage.title).toHaveText(PAGE_TITLES.sliderCatalog);
  });

  test('About points to the Sauce Labs website', async ({ inventoryPage }) => {
    await inventoryPage.menu.open();

    await expect(inventoryPage.menu.aboutLink).toHaveAttribute('href', LINKS.about);
  });

  test('Reset App State empties the cart', async ({ page, inventoryPage }) => {
    await inventoryPage.addToCart(PRODUCTS.backpack, PRODUCTS.bikeLight);

    await inventoryPage.menu.resetAppState();
    await expect(inventoryPage.header.cartBadge).toBeHidden();

    await page.reload();
    await expect(inventoryPage.header.cartBadge).toBeHidden();
    await expect(inventoryPage.product(PRODUCTS.backpack).addToCartButton).toBeVisible();
  });

  test('Reset App State restores the product buttons immediately', async ({ inventoryPage }) => {
    knownBug(KNOWN_BUGS.resetAppStateStaleButtons);
    await inventoryPage.addToCart(PRODUCTS.backpack);

    await inventoryPage.menu.resetAppState();

    await expect(inventoryPage.product(PRODUCTS.backpack).addToCartButton).toBeVisible();
  });
});
