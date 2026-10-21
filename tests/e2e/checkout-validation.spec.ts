import { test, expect } from '@fixtures';
import { CustomerBuilder } from '@data/builders/customer.builder';
import { KNOWN_BUGS } from '@data/known-bugs';
import { CHECKOUT_ERRORS } from '@data/messages';
import { PRODUCTS } from '@data/products';
import { knownBug } from '@utils/known-bug';

const MISSING_FIELDS = [
  {
    field: 'first name',
    build: (b: CustomerBuilder) => b.withoutFirstName(),
    error: CHECKOUT_ERRORS.firstNameRequired,
  },
  {
    field: 'last name',
    build: (b: CustomerBuilder) => b.withoutLastName(),
    error: CHECKOUT_ERRORS.lastNameRequired,
  },
  {
    field: 'postal code',
    build: (b: CustomerBuilder) => b.withoutPostalCode(),
    error: CHECKOUT_ERRORS.postalCodeRequired,
  },
] as const;

test.describe('Checkout validation', { tag: '@regression' }, () => {
  test.beforeEach(async ({ inventoryPage, checkoutInformationPage }) => {
    await inventoryPage.goto();
    await inventoryPage.addToCart(PRODUCTS.backpack);
    await checkoutInformationPage.goto();
    await checkoutInformationPage.expectLoaded();
  });

  for (const { field, build, error } of MISSING_FIELDS) {
    test(`requires the ${field}`, async ({ checkoutInformationPage, faker }) => {
      await checkoutInformationPage.submit(build(new CustomerBuilder(faker)).build());

      await expect(checkoutInformationPage.error).toHaveText(error);
      await checkoutInformationPage.expectLoaded();
    });
  }

  test('reports the first missing field when the form is empty', async ({
    checkoutInformationPage,
  }) => {
    await checkoutInformationPage.submit({ firstName: '', lastName: '', postalCode: '' });

    await expect(checkoutInformationPage.error).toHaveText(CHECKOUT_ERRORS.firstNameRequired);
  });

  test('the error message can be dismissed', async ({ checkoutInformationPage, faker }) => {
    await checkoutInformationPage.submit(new CustomerBuilder(faker).withoutPostalCode().build());
    await expect(checkoutInformationPage.error).toBeVisible();

    await checkoutInformationPage.dismissError();

    await expect(checkoutInformationPage.error).toBeHidden();
  });

  test('rejects a last name made only of spaces', async ({ checkoutInformationPage, faker }) => {
    knownBug(KNOWN_BUGS.whitespaceOnlyCustomerName);

    await checkoutInformationPage.submit(
      new CustomerBuilder(faker).with({ lastName: '   ' }).build(),
    );

    await expect(checkoutInformationPage.error).toHaveText(CHECKOUT_ERRORS.lastNameRequired);
  });
});
