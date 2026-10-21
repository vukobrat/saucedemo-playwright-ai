import { test, expect } from '@fixtures';
import { CustomerBuilder } from '@data/builders/customer.builder';
import { KNOWN_BUGS } from '@data/known-bugs';
import { ALL_PRODUCTS, PRODUCTS, imageSrcPattern } from '@data/products';
import { knownBug } from '@utils/known-bug';
import { formatPrice, orderTotals, summaryLines } from '@utils/pricing';

// Layout defects of this persona (misplaced cart icon) are covered by the visual regression
// project; these specs cover what is observable in the DOM.
test.describe('visual_user', { tag: '@persona' }, () => {
  test.use({ persona: 'visual' });

  test.beforeEach(async ({ inventoryPage }) => {
    await inventoryPage.goto();
    await inventoryPage.expectLoaded();
  });

  test('shows catalog prices on the inventory', async ({ inventoryPage }) => {
    knownBug(KNOWN_BUGS.visualRandomPrices);

    await expect(inventoryPage.productPrices).toHaveText(
      ALL_PRODUCTS.map((p) => formatPrice(p.priceCents)),
    );
  });

  test('shows the right image for every product', async ({ inventoryPage }) => {
    knownBug(KNOWN_BUGS.visualBrokenBackpackImage);

    for (const product of ALL_PRODUCTS) {
      await expect(inventoryPage.product(product).image).toHaveAttribute(
        'src',
        imageSrcPattern(product),
      );
    }
  });

  test('charges catalog prices at checkout', async ({
    inventoryPage,
    checkoutInformationPage,
    checkoutOverviewPage,
    faker,
  }) => {
    const products = [PRODUCTS.backpack, PRODUCTS.bikeLight];
    const expected = summaryLines(orderTotals(products));
    await inventoryPage.addToCart(...products);
    await checkoutInformationPage.goto();

    await checkoutInformationPage.submit(new CustomerBuilder(faker).build());

    await expect(checkoutOverviewPage.subtotal).toHaveText(expected.subtotal);
    await expect(checkoutOverviewPage.total).toHaveText(expected.total);
  });
});
