import { test, expect } from '@fixtures';
import { KNOWN_BUGS } from '@data/known-bugs';
import { PAGE_TITLES } from '@data/messages';
import { PRODUCTS } from '@data/products';
import { knownBug } from '@utils/known-bug';
import { formatPrice } from '@utils/pricing';

test.describe('Cart', { tag: '@regression' }, () => {
  test(
    'lists added products with quantity and price',
    { tag: '@smoke' },
    async ({ inventoryPage, cartPage }) => {
      const products = [PRODUCTS.backpack, PRODUCTS.bikeLight];
      await inventoryPage.goto();
      await inventoryPage.addToCart(...products);

      await inventoryPage.header.openCart();

      await cartPage.expectLoaded();
      await expect(cartPage.title).toHaveText(PAGE_TITLES.cart);
      await expect(cartPage.itemNames).toHaveText(products.map((p) => p.name));
      for (const product of products) {
        await expect(cartPage.item(product).quantity).toHaveText('1');
        await expect(cartPage.item(product).price).toHaveText(formatPrice(product.priceCents));
      }
    },
  );

  test('removing an item updates the list and the badge', async ({ inventoryPage, cartPage }) => {
    await inventoryPage.goto();
    await inventoryPage.addToCart(PRODUCTS.onesie, PRODUCTS.redTShirt);
    await cartPage.goto();

    await cartPage.item(PRODUCTS.onesie).remove();

    await expect(cartPage.itemNames).toHaveText([PRODUCTS.redTShirt.name]);
    await expect(cartPage.header.cartBadge).toHaveText('1');
  });

  test('an empty cart shows no items and no badge', async ({ cartPage }) => {
    await cartPage.goto();

    await cartPage.expectLoaded();
    await expect(cartPage.items).toHaveCount(0);
    await expect(cartPage.header.cartBadge).toBeHidden();
  });

  test('continue shopping returns to the inventory', async ({ cartPage, inventoryPage }) => {
    await cartPage.goto();

    await cartPage.continueShopping();

    await inventoryPage.expectLoaded();
  });

  test('the cart button announces several items', async ({ inventoryPage }) => {
    await inventoryPage.goto();
    await expect(inventoryPage.header.cartButton).toHaveAccessibleName('Cart, empty');

    await inventoryPage.addToCart(PRODUCTS.backpack, PRODUCTS.bikeLight);

    await expect(inventoryPage.header.cartButton).toHaveAccessibleName('Cart, 2 items');
  });

  test('the cart button announces a single item', async ({ inventoryPage }) => {
    knownBug(KNOWN_BUGS.cartAccessibleNameSingular);
    await inventoryPage.goto();

    await inventoryPage.addToCart(PRODUCTS.backpack);

    await expect(inventoryPage.header.cartButton).toHaveAccessibleName('Cart, 1 item');
  });
});
