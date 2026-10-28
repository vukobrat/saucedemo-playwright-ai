import { test, expect } from '@fixtures';
import { CustomerBuilder } from '@data/builders/customer.builder';
import { KNOWN_BUGS } from '@data/known-bugs';
import { PRODUCTS } from '@data/products';
import { knownBug } from '@utils/known-bug';

// Gate: zero WCAG 2.0/2.1/2.2 A and AA violations on every page state, so any new violation
// fails the build. There is no allowlist: a rule that fails under a known bug is skipped only on
// that page and checked by its own known-bug test (Dynamic Catalog, SD-503 and SD-504).
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

  // Two pages fail one rule each under a known bug. The gate skips only that rule on that page,
  // and a known-bug test checks the rule on its own.
  test.describe('Dynamic Catalog', () => {
    test('lazy load', async ({ lazyLoadCatalogPage, a11y }) => {
      await lazyLoadCatalogPage.goto();
      await lazyLoadCatalogPage.expectLoaded();

      // The loaded cards are the Spinner page's card component, where color-contrast still runs.
      expect(await a11y.scan({ disabledRules: ['color-contrast'] })).toEqual([]);
    });

    test('lazy load placeholders meet the contrast minimum', async ({
      lazyLoadCatalogPage,
      a11y,
    }) => {
      knownBug(KNOWN_BUGS.a11yLazyLoadPlaceholderContrast);
      await lazyLoadCatalogPage.goto();
      await lazyLoadCatalogPage.expectLoaded();

      expect(await a11y.scan({ rules: ['color-contrast'] })).toEqual([]);
    });

    // Only the loaded state: the loading state lasts at most 3 s and can only be held with a paused
    // clock, which also stops axe. Its one element, the "Loading" status, is checked in e2e.
    test('spinner', async ({ spinnerCatalogPage, a11y }) => {
      await spinnerCatalogPage.goto();
      await expect(spinnerCatalogPage.grid).toBeVisible();

      expect(await a11y.scan()).toEqual([]);
    });

    test('slider', async ({ sliderCatalogPage, a11y }) => {
      await sliderCatalogPage.goto();
      await sliderCatalogPage.expectLoaded();

      // target-size fails only on the dots; the menu, cart and footer targets are scanned on
      // every other page.
      expect(await a11y.scan({ disabledRules: ['target-size'] })).toEqual([]);
    });

    test('slider dots meet the target size minimum', async ({ sliderCatalogPage, a11y }) => {
      knownBug(KNOWN_BUGS.a11ySliderDotTargetSize);
      await sliderCatalogPage.goto();
      await sliderCatalogPage.expectLoaded();

      expect(await a11y.scan({ rules: ['target-size'] })).toEqual([]);
    });
  });
});

// Best-practice rules are not WCAG requirements, but the ones that fail are tracked as known bugs
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

  test('Dynamic Catalog pages have a main landmark', async ({
    lazyLoadCatalogPage,
    spinnerCatalogPage,
    sliderCatalogPage,
    a11y,
  }) => {
    knownBug(KNOWN_BUGS.a11yDynamicCatalogNoMainLandmark);
    // Without a main landmark, the page content also sits outside every landmark.
    const rules = ['landmark-one-main', 'region'];

    await lazyLoadCatalogPage.goto();
    await lazyLoadCatalogPage.expectLoaded();
    expect(await a11y.scan({ rules })).toEqual([]);

    await spinnerCatalogPage.goto();
    await spinnerCatalogPage.expectLoaded();
    expect(await a11y.scan({ rules })).toEqual([]);

    await sliderCatalogPage.goto();
    await sliderCatalogPage.expectLoaded();
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
