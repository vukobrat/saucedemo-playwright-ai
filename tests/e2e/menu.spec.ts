import { test, expect } from '@fixtures';
import { KNOWN_BUGS } from '@data/known-bugs';
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

  test('About points to the Sauce Labs website', async ({ inventoryPage }) => {
    await inventoryPage.menu.open();

    await expect(inventoryPage.menu.aboutLink).toHaveAttribute('href', 'https://saucelabs.com/');
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
