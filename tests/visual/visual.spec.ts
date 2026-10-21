import { existsSync } from 'node:fs';
import { test, expect } from '@fixtures';
import { CustomerBuilder } from '@data/builders/customer.builder';
import { KNOWN_BUGS } from '@data/known-bugs';
import { PRODUCTS } from '@data/products';
import { knownBug } from '@utils/known-bug';

// Baselines are rendered by bundled Chromium on Linux (CI container or Docker). Font rendering
// differs on other platforms, so comparing there would only produce noise.
test.skip(process.platform !== 'linux', 'Visual baselines are Linux-only; run in CI or Docker');

test.describe('Visual regression', { tag: '@visual' }, () => {
  test.describe('logged out', () => {
    test.use({ persona: null });

    test('login page', async ({ page, loginPage }) => {
      await loginPage.goto();
      await loginPage.expectLoaded();

      await expect(page).toHaveScreenshot('login.png', { fullPage: true });
    });
  });

  test('inventory', async ({ page, inventoryPage }) => {
    await inventoryPage.goto();
    await inventoryPage.expectLoaded();

    await expect(page).toHaveScreenshot('inventory.png', {
      fullPage: true,
      mask: [inventoryPage.footerCopy],
    });
  });

  test('product details', async ({ page, productDetailsPage }) => {
    await productDetailsPage.goto(PRODUCTS.backpack);
    await productDetailsPage.expectLoaded();

    await expect(page).toHaveScreenshot('product-details.png', {
      fullPage: true,
      mask: [productDetailsPage.footerCopy],
    });
  });

  test('cart with two items', async ({ page, inventoryPage, cartPage }) => {
    await inventoryPage.goto();
    await inventoryPage.addToCart(PRODUCTS.backpack, PRODUCTS.bikeLight);
    await cartPage.goto();
    await cartPage.expectLoaded();

    await expect(page).toHaveScreenshot('cart.png', {
      fullPage: true,
      mask: [cartPage.footerCopy],
    });
  });

  test('checkout overview', async ({
    page,
    inventoryPage,
    checkoutInformationPage,
    checkoutOverviewPage,
    faker,
  }) => {
    await inventoryPage.goto();
    await inventoryPage.addToCart(PRODUCTS.backpack, PRODUCTS.bikeLight);
    await checkoutInformationPage.goto();
    await checkoutInformationPage.submit(new CustomerBuilder(faker).build());
    await checkoutOverviewPage.expectLoaded();

    await expect(page).toHaveScreenshot('checkout-overview.png', {
      fullPage: true,
      mask: [checkoutOverviewPage.footerCopy],
    });
  });

  test.describe('as visual_user', () => {
    test.use({ persona: 'visual' });

    test('inventory matches the reference rendering', async ({ page, inventoryPage }) => {
      // Compares against the standard_user baseline. The broken persona must never write it:
      // not when updating snapshots, and not by creating it when it is missing (the default
      // updateSnapshots mode is 'missing').
      test.skip(
        ['all', 'changed'].includes(test.info().config.updateSnapshots),
        'Never update the shared baseline from the broken persona',
      );
      test.skip(
        !existsSync(test.info().snapshotPath('inventory.png')),
        'Reference baseline is missing; render it from standard_user first',
      );
      knownBug(KNOWN_BUGS.visualLayoutDiffers);
      await inventoryPage.goto();
      await inventoryPage.expectLoaded();

      await expect(page).toHaveScreenshot('inventory.png', {
        fullPage: true,
        mask: [inventoryPage.footerCopy],
      });
    });
  });
});
