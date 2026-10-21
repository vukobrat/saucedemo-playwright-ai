import type { Locator, Page } from '@playwright/test';
import { CartItemComponent } from '@components/cart-item.component';
import type { Product } from '@data/products';
import { AppPage } from './app.page';

export class CartPage extends AppPage {
  protected readonly pathname = '/cart.html';
  protected readonly readyMarker: Locator;

  readonly items: Locator;
  readonly itemNames: Locator;
  readonly continueShoppingButton: Locator;
  readonly checkoutButton: Locator;

  constructor(page: Page) {
    super(page);
    const list = page.getByTestId('cart-list');
    this.items = list.getByTestId('inventory-item');
    this.itemNames = list.getByTestId('inventory-item-name');
    this.continueShoppingButton = page.getByRole('button', { name: 'Continue Shopping' });
    this.checkoutButton = page.getByRole('button', { name: 'Checkout' });
    this.readyMarker = list;
  }

  async goto(): Promise<void> {
    await this.page.goto(this.pathname);
  }

  item(product: Product): CartItemComponent {
    return new CartItemComponent(
      this.items.filter({
        has: this.page.getByTestId('inventory-item-name').getByText(product.name, { exact: true }),
      }),
    );
  }

  async continueShopping(): Promise<void> {
    await this.continueShoppingButton.click();
  }

  async checkout(): Promise<void> {
    await this.checkoutButton.click();
  }
}
