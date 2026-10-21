import type { Locator } from '@playwright/test';

/** One line in the cart list, used by the cart and the checkout overview. */
export class CartItemComponent {
  readonly quantity: Locator;
  readonly name: Locator;
  readonly description: Locator;
  readonly price: Locator;
  /** Present in the cart only; the checkout overview is read-only. */
  readonly removeButton: Locator;

  constructor(readonly root: Locator) {
    this.quantity = root.getByTestId('item-quantity');
    this.name = root.getByTestId('inventory-item-name');
    this.description = root.getByTestId('inventory-item-desc');
    this.price = root.getByTestId('inventory-item-price');
    this.removeButton = root.getByRole('button', { name: 'Remove' });
  }

  async remove(): Promise<void> {
    await this.removeButton.click();
  }
}
