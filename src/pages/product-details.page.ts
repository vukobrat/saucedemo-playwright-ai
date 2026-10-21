import type { Locator, Page } from '@playwright/test';
import type { Product } from '@data/products';
import { AppPage } from './app.page';

export class ProductDetailsPage extends AppPage {
  protected readonly pathname = '/inventory-item.html';
  protected readonly readyMarker: Locator;

  readonly name: Locator;
  readonly description: Locator;
  readonly price: Locator;
  readonly image: Locator;
  readonly addToCartButton: Locator;
  readonly removeButton: Locator;
  readonly backButton: Locator;

  constructor(page: Page) {
    super(page);
    const details = page.getByTestId('inventory-item');
    this.name = details.getByTestId('inventory-item-name');
    this.description = details.getByTestId('inventory-item-desc');
    this.price = details.getByTestId('inventory-item-price');
    this.image = details.getByRole('img');
    this.addToCartButton = details.getByRole('button', { name: 'Add to cart' });
    this.removeButton = details.getByRole('button', { name: 'Remove' });
    this.backButton = page.getByRole('button', { name: 'Back to products' });
    this.readyMarker = this.backButton;
  }

  /** Opens a product by id. Accepts any id, so unknown ids can be tested too. */
  async goto(product: Pick<Product, 'id'>): Promise<void> {
    await this.page.goto(`${this.pathname}?id=${product.id}`);
  }

  async addToCart(): Promise<void> {
    await this.addToCartButton.click();
  }

  async remove(): Promise<void> {
    await this.removeButton.click();
  }

  async backToProducts(): Promise<void> {
    await this.backButton.click();
  }
}
