import { test as base } from '@playwright/test';
import { CartPage } from '@pages/cart.page';
import { CheckoutCompletePage } from '@pages/checkout-complete.page';
import { CheckoutInformationPage } from '@pages/checkout-information.page';
import { CheckoutOverviewPage } from '@pages/checkout-overview.page';
import { InventoryPage } from '@pages/inventory.page';
import { LazyLoadCatalogPage } from '@pages/lazy-load-catalog.page';
import { LoginPage } from '@pages/login.page';
import { ProductDetailsPage } from '@pages/product-details.page';
import { SliderCatalogPage } from '@pages/slider-catalog.page';
import { SpinnerCatalogPage } from '@pages/spinner-catalog.page';

export interface PageFixtures {
  loginPage: LoginPage;
  inventoryPage: InventoryPage;
  productDetailsPage: ProductDetailsPage;
  cartPage: CartPage;
  checkoutInformationPage: CheckoutInformationPage;
  checkoutOverviewPage: CheckoutOverviewPage;
  checkoutCompletePage: CheckoutCompletePage;
  lazyLoadCatalogPage: LazyLoadCatalogPage;
  spinnerCatalogPage: SpinnerCatalogPage;
  sliderCatalogPage: SliderCatalogPage;
}

/** Page objects, created lazily per test for the test's own `page`. */
export const test = base.extend<PageFixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  inventoryPage: async ({ page }, use) => {
    await use(new InventoryPage(page));
  },
  productDetailsPage: async ({ page }, use) => {
    await use(new ProductDetailsPage(page));
  },
  cartPage: async ({ page }, use) => {
    await use(new CartPage(page));
  },
  checkoutInformationPage: async ({ page }, use) => {
    await use(new CheckoutInformationPage(page));
  },
  checkoutOverviewPage: async ({ page }, use) => {
    await use(new CheckoutOverviewPage(page));
  },
  checkoutCompletePage: async ({ page }, use) => {
    await use(new CheckoutCompletePage(page));
  },
  lazyLoadCatalogPage: async ({ page }, use) => {
    await use(new LazyLoadCatalogPage(page));
  },
  spinnerCatalogPage: async ({ page }, use) => {
    await use(new SpinnerCatalogPage(page));
  },
  sliderCatalogPage: async ({ page }, use) => {
    await use(new SliderCatalogPage(page));
  },
});
