import type { Locator } from '@playwright/test';

/** One product tile on the inventory page. */
export class ProductCardComponent {
  readonly name: Locator;
  readonly description: Locator;
  readonly price: Locator;
  readonly image: Locator;
  readonly addToCartButton: Locator;
  readonly removeButton: Locator;
  /**
   * Image and title are both `<a role="button">` named "View details for <name>", so the
   * accessible name is ambiguous; the title link's test id is not.
   */
  readonly detailsLink: Locator;

  constructor(readonly root: Locator) {
    this.name = root.getByTestId('inventory-item-name');
    this.description = root.getByTestId('inventory-item-desc');
    this.price = root.getByTestId('inventory-item-price');
    this.image = root.getByRole('img');
    this.addToCartButton = root.getByRole('button', { name: 'Add to cart' });
    this.removeButton = root.getByRole('button', { name: 'Remove' });
    this.detailsLink = root.getByTestId(/^item-\d+-title-link$/);
  }

  async addToCart(): Promise<void> {
    await this.addToCartButton.click();
  }

  async remove(): Promise<void> {
    await this.removeButton.click();
  }

  async openDetails(): Promise<void> {
    await this.detailsLink.click();
  }
}
