import { test, expect } from '@fixtures';
import {
  LAZY_LOAD_BATCH_SIZE,
  LAZY_LOAD_ENTRIES,
  PRODUCTS_BY_ID,
  SLIDER_INTERVAL_MS,
  SPINNER_MAX_DELAY_MS,
} from '@data/dynamic-catalog';
import { KNOWN_BUGS } from '@data/known-bugs';
import { CATALOG_CARD_PLACEHOLDER } from '@data/messages';
import { PRODUCTS, imageSrcPattern } from '@data/products';
import { pauseTimers } from '@utils/clock';
import { knownBug } from '@utils/known-bug';
import { formatPrice } from '@utils/pricing';

const CATALOG_NAMES = PRODUCTS_BY_ID.map((product) => product.name);
const CATALOG_PRICES = PRODUCTS_BY_ID.map((product) => formatPrice(product.priceCents));
const LAZY_LOAD_PRICES = new Map(
  LAZY_LOAD_ENTRIES.map((entry) => [entry.name, formatPrice(entry.product.priceCents)]),
);

test.describe('Dynamic Catalog', { tag: '@regression' }, () => {
  test.describe('Spinner', () => {
    // The loading delay is random; with the clock paused, both states hold until the test moves on.
    test.beforeEach(async ({ page, spinnerCatalogPage }) => {
      await pauseTimers(page);
      await spinnerCatalogPage.goto();
      await spinnerCatalogPage.expectLoaded();
    });

    test('shows a loading status until the catalog is ready', async ({
      page,
      spinnerCatalogPage,
    }) => {
      await expect(spinnerCatalogPage.loadingStatus).toBeVisible();
      await expect(spinnerCatalogPage.grid).toBeHidden();

      await page.clock.runFor(SPINNER_MAX_DELAY_MS);

      await expect(spinnerCatalogPage.grid).toBeVisible();
      await expect(spinnerCatalogPage.loadingStatus).toBeHidden();
    });

    test('lists every product at its catalog price', async ({ page, spinnerCatalogPage }) => {
      await page.clock.runFor(SPINNER_MAX_DELAY_MS);

      await expect(spinnerCatalogPage.productNames).toHaveText(CATALOG_NAMES);
      await expect(spinnerCatalogPage.productPrices).toHaveText(CATALOG_PRICES);
    });
  });

  // The slider runs in product id order: Bike Light (0), Bolt T-Shirt (1), ... Fleece Jacket (5).
  test.describe('Slider', () => {
    // With the clock paused, the slider moves only when the test runs the clock.
    test.beforeEach(async ({ page, sliderCatalogPage }) => {
      await pauseTimers(page);
      await sliderCatalogPage.goto();
      await sliderCatalogPage.expectLoaded();
    });

    test('starts at the first product, with a dot for every product', async ({
      sliderCatalogPage,
    }) => {
      await expect(sliderCatalogPage.currentProduct.name).toHaveText(PRODUCTS.bikeLight.name);
      await expect(sliderCatalogPage.dot(PRODUCTS.bikeLight)).toHaveAttribute(
        'aria-current',
        'true',
      );
      await expect(sliderCatalogPage.dots).toHaveCount(PRODUCTS_BY_ID.length);
      for (const product of PRODUCTS_BY_ID) {
        await expect(sliderCatalogPage.dot(product)).toBeVisible();
      }
    });

    test('a dot shows its product', async ({ sliderCatalogPage }) => {
      const { currentProduct } = sliderCatalogPage;

      await sliderCatalogPage.show(PRODUCTS.backpack);

      await expect(currentProduct.name).toHaveText(PRODUCTS.backpack.name);
      await expect(currentProduct.price).toHaveText(formatPrice(PRODUCTS.backpack.priceCents));
      await expect(currentProduct.image).toHaveAttribute('src', imageSrcPattern(PRODUCTS.backpack));
      await expect(sliderCatalogPage.dot(PRODUCTS.backpack)).toHaveAttribute(
        'aria-current',
        'true',
      );
    });

    test('advances every two seconds and wraps around after the last product', async ({
      page,
      sliderCatalogPage,
    }) => {
      const { currentProduct } = sliderCatalogPage;

      await page.clock.runFor(SLIDER_INTERVAL_MS - 1);
      await expect(currentProduct.name).toHaveText(PRODUCTS.bikeLight.name);
      await page.clock.runFor(1);
      await expect(currentProduct.name).toHaveText(PRODUCTS.boltTShirt.name);

      await sliderCatalogPage.show(PRODUCTS.fleeceJacket);
      await page.clock.runFor(SLIDER_INTERVAL_MS);
      await expect(currentProduct.name).toHaveText(PRODUCTS.bikeLight.name);
    });

    // WCAG 2.2.2: moving content needs a way to stop it. The ARIA carousel pattern stops the
    // rotation while keyboard focus is inside the carousel.
    test('stops rotating while a dot has keyboard focus', async ({ page, sliderCatalogPage }) => {
      knownBug(KNOWN_BUGS.a11ySliderCannotBePaused);

      await sliderCatalogPage.focusDot(PRODUCTS.bikeLight);
      await page.clock.runFor(SLIDER_INTERVAL_MS);

      await expect(sliderCatalogPage.currentProduct.name).toHaveText(PRODUCTS.bikeLight.name);
    });
  });

  test.describe('Lazy Load', () => {
    test.beforeEach(async ({ lazyLoadCatalogPage }) => {
      await lazyLoadCatalogPage.goto();
      await lazyLoadCatalogPage.expectLoaded();
      // The list first grows until it fills the viewport; it has settled once its end is out of view.
      await expect(lazyLoadCatalogPage.endOfList).not.toBeInViewport();
    });

    test('renders a product when its card scrolls into view', async ({ lazyLoadCatalogPage }) => {
      // The list loads one batch past the viewport, so its last card starts below the fold.
      const card = await lazyLoadCatalogPage.lastLoadedCard();
      await expect(card.placeholder).toHaveText(CATALOG_CARD_PLACEHOLDER);
      await expect(card.name).toBeHidden();

      await card.scrollIntoView();

      await expect(card.placeholder).toBeHidden();
      await expect(card.name).toBeVisible();
      await expect(card.price).toBeVisible();
    });

    test('loads more products when the end of the list scrolls into view', async ({
      lazyLoadCatalogPage,
    }) => {
      const loaded = await lazyLoadCatalogPage.cards.count();

      await lazyLoadCatalogPage.scrollToEnd();

      await expect(lazyLoadCatalogPage.cards).toHaveCount(loaded + LAZY_LOAD_BATCH_SIZE);
    });

    test.describe('one catalog cycle', () => {
      // Cards render only inside the viewport; a tall one renders a whole cycle without scrolling.
      test.use({ viewport: { width: 1280, height: 3000 } });

      test('shows every entry at its product price', async ({ lazyLoadCatalogPage }) => {
        const { names, prices } = await lazyLoadCatalogPage.firstEntries(LAZY_LOAD_ENTRIES.length);

        expect(prices).toEqual(names.map((name) => LAZY_LOAD_PRICES.get(name)));
      });

      // One cycle should hold each entry once, so the first cards of the list are the whole catalog.
      test('lists every product size exactly once', async ({ lazyLoadCatalogPage }) => {
        knownBug(KNOWN_BUGS.lazyLoadDuplicateEntry);

        const { names } = await lazyLoadCatalogPage.firstEntries(LAZY_LOAD_ENTRIES.length);

        expect(names.toSorted()).toEqual(LAZY_LOAD_ENTRIES.map((entry) => entry.name).toSorted());
      });
    });
  });
});
