import type { Locator, Page } from '@playwright/test';
import { ProductCardComponent } from '@components/product-card.component';
import type { Product } from '@data/products';
import { SORT_OPTIONS, type SortOption } from '@data/sort-options';
import { AppPage } from './app.page';

export class InventoryPage extends AppPage {
  protected readonly pathname = '/inventory.html';
  protected readonly readyMarker: Locator;

  readonly productCards: Locator;
  readonly productNames: Locator;
  readonly productPrices: Locator;
  readonly sortSelect: Locator;
  /** Label of the selected sort option, rendered next to the dropdown. */
  readonly activeSortOption: Locator;

  constructor(page: Page) {
    super(page);
    const list = page.getByTestId('inventory-list');
    this.productCards = list.getByTestId('inventory-item');
    this.productNames = list.getByTestId('inventory-item-name');
    this.productPrices = list.getByTestId('inventory-item-price');
    this.sortSelect = page.getByRole('combobox', { name: 'Sort products' });
    this.activeSortOption = page.getByTestId('active-option');
    this.readyMarker = list;
  }

  async goto(): Promise<void> {
    await this.page.goto(this.pathname);
  }

  /** The card for a product, matched by its exact name. */
  product(product: Product): ProductCardComponent {
    return new ProductCardComponent(
      this.productCards.filter({
        has: this.page.getByTestId('inventory-item-name').getByText(product.name, { exact: true }),
      }),
    );
  }

  async addToCart(...products: readonly Product[]): Promise<void> {
    for (const product of products) {
      await this.product(product).addToCart();
    }
  }

  async sortBy(option: SortOption): Promise<void> {
    await this.sortSelect.selectOption(SORT_OPTIONS[option].value);
  }
}
