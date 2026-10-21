import { test, expect } from '@fixtures';
import { PAGE_TITLES } from '@data/messages';
import { ALL_PRODUCTS, PRODUCTS } from '@data/products';
import { formatPrice } from '@utils/pricing';

test.describe('Inventory', { tag: '@regression' }, () => {
  test.beforeEach(async ({ inventoryPage }) => {
    await inventoryPage.goto();
    await inventoryPage.expectLoaded();
  });

  test(
    'lists every product with its catalog price',
    { tag: '@smoke' },
    async ({ inventoryPage }) => {
      await expect(inventoryPage.title).toHaveText(PAGE_TITLES.inventory);
      await expect(inventoryPage.productNames).toHaveText(ALL_PRODUCTS.map((p) => p.name));
      await expect(inventoryPage.productPrices).toHaveText(
        ALL_PRODUCTS.map((p) => formatPrice(p.priceCents)),
      );
    },
  );

  test('every product shows its own image', async ({ inventoryPage }) => {
    for (const product of ALL_PRODUCTS) {
      await expect(inventoryPage.product(product).image).toHaveAccessibleName(product.name);
    }
  });

  test(
    'adding a product switches its button to Remove and counts it in the cart',
    { tag: '@smoke' },
    async ({ inventoryPage }) => {
      const backpack = inventoryPage.product(PRODUCTS.backpack);

      await backpack.addToCart();

      await expect(backpack.removeButton).toBeVisible();
      await expect(backpack.addToCartButton).toBeHidden();
      await expect(inventoryPage.header.cartBadge).toHaveText('1');
    },
  );

  test('the cart badge counts several products', async ({ inventoryPage }) => {
    await inventoryPage.addToCart(PRODUCTS.backpack, PRODUCTS.onesie, PRODUCTS.fleeceJacket);

    await expect(inventoryPage.header.cartBadge).toHaveText('3');
  });

  test('removing a product restores its button and clears the badge', async ({ inventoryPage }) => {
    const bikeLight = inventoryPage.product(PRODUCTS.bikeLight);
    await bikeLight.addToCart();

    await bikeLight.remove();

    await expect(bikeLight.addToCartButton).toBeVisible();
    await expect(inventoryPage.header.cartBadge).toBeHidden();
  });

  test('the cart survives a page reload', async ({ page, inventoryPage }) => {
    await inventoryPage.addToCart(PRODUCTS.boltTShirt, PRODUCTS.redTShirt);

    await page.reload();

    await expect(inventoryPage.header.cartBadge).toHaveText('2');
    await expect(inventoryPage.product(PRODUCTS.boltTShirt).removeButton).toBeVisible();
    await expect(inventoryPage.product(PRODUCTS.redTShirt).removeButton).toBeVisible();
  });
});
