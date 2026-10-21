import { test, expect } from '@fixtures';
import { CustomerBuilder } from '@data/builders/customer.builder';
import { KNOWN_BUGS } from '@data/known-bugs';
import { PRODUCTS } from '@data/products';
import { knownBug } from '@utils/known-bug';

// Gate: zero WCAG 2.0/2.1/2.2 A and AA violations on every page state. Measured baseline was
// zero, so there is no allowlist; any new violation fails the build.
test.describe('Accessibility: WCAG 2.2 AA', { tag: '@a11y' }, () => {
  test.describe('logged out', () => {
    test.use({ persona: null });

    test.beforeEach(async ({ loginPage }) => {
      await loginPage.goto();
      await loginPage.expectLoaded();
    });

    test('login page', async ({ a11y }) => {
      expect(await a11y.scan()).toEqual([]);
    });

    test('login page showing an error', async ({ loginPage, a11y }) => {
      await loginPage.login('', '');
      await expect(loginPage.error).toBeVisible();

      expect(await a11y.scan()).toEqual([]);
    });
  });

  test('inventory', async ({ inventoryPage, a11y }) => {
    await inventoryPage.goto();
    await inventoryPage.expectLoaded();

    expect(await a11y.scan()).toEqual([]);
  });

  test('inventory with the side menu open', async ({ inventoryPage, a11y }) => {
    await inventoryPage.goto();
    await inventoryPage.menu.open();
    await expect(inventoryPage.menu.logoutButton).toBeVisible();

    expect(await a11y.scan()).toEqual([]);
  });

  test('product details', async ({ productDetailsPage, a11y }) => {
    await productDetailsPage.goto(PRODUCTS.backpack);
    await productDetailsPage.expectLoaded();

    expect(await a11y.scan()).toEqual([]);
  });

  test.describe('purchase flow', () => {
    test.beforeEach(async ({ inventoryPage }) => {
      await inventoryPage.goto();
      await inventoryPage.addToCart(PRODUCTS.bikeLight);
    });

    test('cart', async ({ cartPage, a11y }) => {
      await cartPage.goto();
      await cartPage.expectLoaded();

      expect(await a11y.scan()).toEqual([]);
    });

    test('checkout information', async ({ checkoutInformationPage, a11y }) => {
      await checkoutInformationPage.goto();
      await checkoutInformationPage.expectLoaded();

      expect(await a11y.scan()).toEqual([]);
    });

    test('checkout overview', async ({
      checkoutInformationPage,
      checkoutOverviewPage,
      a11y,
      faker,
    }) => {
      await checkoutInformationPage.goto();
      await checkoutInformationPage.submit(new CustomerBuilder(faker).build());
      await checkoutOverviewPage.expectLoaded();

      expect(await a11y.scan()).toEqual([]);
    });

    test('checkout complete', async ({
      checkoutInformationPage,
      checkoutOverviewPage,
      checkoutCompletePage,
      a11y,
      faker,
    }) => {
      await checkoutInformationPage.goto();
      await checkoutInformationPage.submit(new CustomerBuilder(faker).build());
      await checkoutOverviewPage.finish();
      await checkoutCompletePage.expectLoaded();

      expect(await a11y.scan()).toEqual([]);
    });
  });
});

// Best-practice rules are not WCAG requirements, but the two that fail are tracked as known bugs
// instead of being silently ignored.
test.describe('Accessibility: best practices', { tag: '@a11y' }, () => {
  test('every page has a level-one heading', async ({
    inventoryPage,
    productDetailsPage,
    cartPage,
    a11y,
  }) => {
    knownBug(KNOWN_BUGS.a11yNoLevelOneHeading);
    const rules = ['page-has-heading-one'];

    await inventoryPage.goto();
    await inventoryPage.expectLoaded();
    expect(await a11y.scan({ rules })).toEqual([]);

    await productDetailsPage.goto(PRODUCTS.onesie);
    await productDetailsPage.expectLoaded();
    expect(await a11y.scan({ rules })).toEqual([]);

    await cartPage.goto();
    await cartPage.expectLoaded();
    expect(await a11y.scan({ rules })).toEqual([]);
  });

  test.describe('logged out', () => {
    test.use({ persona: null });

    test('login page content is inside landmarks', async ({ loginPage, a11y }) => {
      knownBug(KNOWN_BUGS.a11yLoginContentOutsideLandmarks);
      await loginPage.goto();
      await loginPage.expectLoaded();

      expect(await a11y.scan({ rules: ['region'] })).toEqual([]);
    });
  });
});
