import { test, expect } from '@fixtures';
import { CustomerBuilder } from '@data/builders/customer.builder';
import { KNOWN_BUGS } from '@data/known-bugs';
import { LINKS } from '@data/messages';
import { ALL_PRODUCTS, PRODUCTS, imageSrcPattern } from '@data/products';
import { sortProducts } from '@data/sort-options';
import { knownBug } from '@utils/known-bug';

// Verified on the live app: Add to cart works for these three products only (SD-103).
const ADD_TO_CART_WORKS = [PRODUCTS.backpack, PRODUCTS.bikeLight, PRODUCTS.onesie];
const ADD_TO_CART_BROKEN = [PRODUCTS.boltTShirt, PRODUCTS.fleeceJacket, PRODUCTS.redTShirt];

test.describe('problem_user', { tag: '@persona' }, () => {
  test.use({ persona: 'problem' });

  test.beforeEach(async ({ inventoryPage }) => {
    await inventoryPage.goto();
    await inventoryPage.expectLoaded();
  });

  test('shows the right image for every product', async ({ inventoryPage }) => {
    knownBug(KNOWN_BUGS.problemBrokenImages);

    for (const product of ALL_PRODUCTS) {
      await expect(inventoryPage.product(product).image).toHaveAttribute(
        'src',
        imageSrcPattern(product),
      );
    }
  });

  test('sorts products by name Z to A', async ({ inventoryPage }) => {
    knownBug(KNOWN_BUGS.problemSortingIgnored);

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
      knownBug(KNOWN_BUGS.problemAddToCartIgnored);

      await inventoryPage.product(product).addToCart();

      await expect(inventoryPage.header.cartBadge).toHaveText('1');
    });
  }

  test('removes a product on the inventory page', async ({ inventoryPage }) => {
    knownBug(KNOWN_BUGS.problemRemoveIgnored);
    const backpack = inventoryPage.product(PRODUCTS.backpack);
    await backpack.addToCart();

    await backpack.remove();

    await expect(inventoryPage.header.cartBadge).toBeHidden();
  });

  test('opens the details of the selected product', async ({
    inventoryPage,
    productDetailsPage,
  }) => {
    knownBug(KNOWN_BUGS.problemWrongProductDetails);

    await inventoryPage.product(PRODUCTS.backpack).openDetails();

    await expect(productDetailsPage.name).toHaveText(PRODUCTS.backpack.name);
  });

  test('keeps first and last name separate at checkout', async ({
    inventoryPage,
    checkoutInformationPage,
    faker,
  }) => {
    knownBug(KNOWN_BUGS.problemLastNameOverwritesFirstName);
    const customer = new CustomerBuilder(faker).build();
    await inventoryPage.addToCart(PRODUCTS.backpack);
    await checkoutInformationPage.goto();

    await checkoutInformationPage.enterDetails(customer);

    await expect(checkoutInformationPage.firstNameInput).toHaveValue(customer.firstName);
    await expect(checkoutInformationPage.lastNameInput).toHaveValue(customer.lastName);
  });

  test('About points to the Sauce Labs website', async ({ inventoryPage }) => {
    knownBug(KNOWN_BUGS.problemAboutLinkBroken);

    await inventoryPage.menu.open();

    await expect(inventoryPage.menu.aboutLink).toHaveAttribute('href', LINKS.about);
  });
});
