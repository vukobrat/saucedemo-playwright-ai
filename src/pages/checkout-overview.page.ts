import type { Locator, Page } from '@playwright/test';
import { CartItemComponent } from '@components/cart-item.component';
import type { Product } from '@data/products';
import { AppPage } from './app.page';

/** Checkout step two: order overview with totals. */
export class CheckoutOverviewPage extends AppPage {
  protected readonly pathname = '/checkout-step-two.html';
  protected readonly readyMarker: Locator;

  readonly items: Locator;
  readonly itemNames: Locator;
  readonly paymentInfo: Locator;
  readonly shippingInfo: Locator;
  /** "Item total: $X.XX" */
  readonly subtotal: Locator;
  /** "Tax: $X.XX" */
  readonly tax: Locator;
  /** "Total: $X.XX" */
  readonly total: Locator;
  readonly finishButton: Locator;
  readonly cancelButton: Locator;

  constructor(page: Page) {
    super(page);
    const list = page.getByTestId('cart-list');
    this.items = list.getByTestId('inventory-item');
    this.itemNames = list.getByTestId('inventory-item-name');
    this.paymentInfo = page.getByTestId('payment-info-value');
    this.shippingInfo = page.getByTestId('shipping-info-value');
    this.subtotal = page.getByTestId('subtotal-label');
    this.tax = page.getByTestId('tax-label');
    this.total = page.getByTestId('total-label');
    this.finishButton = page.getByRole('button', { name: 'Finish' });
    this.cancelButton = page.getByRole('button', { name: 'Cancel' });
    this.readyMarker = page.getByTestId('checkout-summary-container');
  }

  /** Opens the overview for the current cart directly, skipping the information step. */
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

  async finish(): Promise<void> {
    await this.finishButton.click();
  }

  async cancel(): Promise<void> {
    await this.cancelButton.click();
  }
}
