import { test, expect } from '@fixtures';
import { CustomerBuilder } from '@data/builders/customer.builder';
import { KNOWN_BUGS } from '@data/known-bugs';
import { CHECKOUT_ERRORS } from '@data/messages';
import { ALL_PRODUCTS, PRODUCTS } from '@data/products';
import { sortProducts } from '@data/sort-options';
import { knownBug } from '@utils/known-bug';

// Verified on the live app: Add to cart works for these three products only (SD-202).
const ADD_TO_CART_WORKS = [PRODUCTS.backpack, PRODUCTS.bikeLight, PRODUCTS.onesie];
const ADD_TO_CART_BROKEN = [PRODUCTS.boltTShirt, PRODUCTS.fleeceJacket, PRODUCTS.redTShirt];

test.describe('error_user', { tag: '@persona' }, () => {
  test.use({ persona: 'error' });

  test.beforeEach(async ({ inventoryPage }) => {
    await inventoryPage.goto();
    await inventoryPage.expectLoaded();
  });

  test('sorts products by name Z to A', async ({ inventoryPage }) => {
    knownBug(KNOWN_BUGS.errorSortingAlert);

    await inventoryPage.sortBy('nameDesc');

    await expect(inventoryPage.productNames).toHaveText(
      sortProducts(ALL_PRODUCTS, 'nameDesc').map((p) => p.name),
    );
  });

  for (const product of ADD_TO_CART_WORKS) {
    test(`adds ${product.name} to the cart`, async ({ inventoryPage }) => {
      await inventoryPage.product(product).addToCart();

      await expect(inventoryPage.header.cartBadge).toHaveText('1');
    });
  }

  for (const product of ADD_TO_CART_BROKEN) {
    test(`adds ${product.name} to the cart`, async ({ inventoryPage }) => {
      knownBug(KNOWN_BUGS.errorAddToCartFails);

      await inventoryPage.product(product).addToCart();

      await expect(inventoryPage.header.cartBadge).toHaveText('1');
    });
  }

  test('removes a product on the inventory page', async ({ inventoryPage }) => {
    knownBug(KNOWN_BUGS.errorRemoveFails);
    const backpack = inventoryPage.product(PRODUCTS.backpack);
    await backpack.addToCart();

    await backpack.remove();

    await expect(inventoryPage.header.cartBadge).toBeHidden();
  });

  test.describe('checkout', () => {
    test.beforeEach(async ({ inventoryPage, checkoutInformationPage }) => {
      await inventoryPage.addToCart(PRODUCTS.backpack);
      await checkoutInformationPage.goto();
    });

    test('accepts typing in the last name field', async ({ checkoutInformationPage, faker }) => {
      knownBug(KNOWN_BUGS.errorLastNameNotEditable);
      const customer = new CustomerBuilder(faker).build();

      await checkoutInformationPage.enterDetails(customer);

      await expect(checkoutInformationPage.lastNameInput).toHaveValue(customer.lastName);
    });

    test('requires the last name', async ({ checkoutInformationPage, faker }) => {
      knownBug(KNOWN_BUGS.errorLastNameNotValidated);

      await checkoutInformationPage.submit(new CustomerBuilder(faker).withoutLastName().build());

      await expect(checkoutInformationPage.error).toHaveText(CHECKOUT_ERRORS.lastNameRequired);
    });

    test('completes the order with Finish', async ({
      checkoutOverviewPage,
      checkoutCompletePage,
    }) => {
      knownBug(KNOWN_BUGS.errorFinishDoesNothing);
      // Direct navigation isolates this defect from the last-name defects above.
      await checkoutOverviewPage.goto();
      await checkoutOverviewPage.expectLoaded();

      await checkoutOverviewPage.finish();

      await checkoutCompletePage.expectLoaded();
    });
  });
});
