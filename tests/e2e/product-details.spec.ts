import { test, expect } from '@fixtures';
import { PRODUCT_NOT_FOUND } from '@data/messages';
import { ALL_PRODUCTS, PRODUCTS } from '@data/products';
import { formatPrice } from '@utils/pricing';

test.describe('Product details', { tag: '@regression' }, () => {
  for (const product of ALL_PRODUCTS) {
    test(`opens the details of ${product.name} from the inventory`, async ({
      inventoryPage,
      productDetailsPage,
    }) => {
      await inventoryPage.goto();

      await inventoryPage.product(product).openDetails();

      await productDetailsPage.expectLoaded();
      await expect(productDetailsPage.name).toHaveText(product.name);
      await expect(productDetailsPage.price).toHaveText(formatPrice(product.priceCents));
      await expect(productDetailsPage.image).toHaveAccessibleName(product.name);
    });
  }

  test('adding and removing on the details page updates the cart', async ({
    productDetailsPage,
  }) => {
    await productDetailsPage.goto(PRODUCTS.fleeceJacket);

    await productDetailsPage.addToCart();
    await expect(productDetailsPage.removeButton).toBeVisible();
    await expect(productDetailsPage.header.cartBadge).toHaveText('1');

    await productDetailsPage.remove();
    await expect(productDetailsPage.addToCartButton).toBeVisible();
    await expect(productDetailsPage.header.cartBadge).toBeHidden();
  });

  test('back to products returns to the inventory', async ({
    productDetailsPage,
    inventoryPage,
  }) => {
    await productDetailsPage.goto(PRODUCTS.onesie);

    await productDetailsPage.backToProducts();

    await inventoryPage.expectLoaded();
  });

  test('an unknown product id shows a not-found page', async ({ productDetailsPage }) => {
    await productDetailsPage.goto({ id: 99 });

    await expect(productDetailsPage.name).toHaveText(PRODUCT_NOT_FOUND);
  });
});
