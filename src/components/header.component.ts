import type { Locator, Page } from '@playwright/test';

/** Primary header shown on every logged-in page: app logo and cart. */
export class HeaderComponent {
  /** `role="button"`, accessible name "Cart, empty" or "Cart, N items". */
  readonly cartButton: Locator;
  /** Item count bubble; not rendered when the cart is empty. */
  readonly cartBadge: Locator;

  constructor(page: Page) {
    const root = page.getByTestId('primary-header');
    this.cartButton = root.getByRole('button', { name: /^Cart,/ });
    this.cartBadge = root.getByTestId('shopping-cart-badge');
  }

  async openCart(): Promise<void> {
    await this.cartButton.click();
  }
}
