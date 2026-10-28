import type { Locator, Page } from '@playwright/test';
import { CatalogCardComponent } from '@components/catalog-card.component';
import type { Product } from '@data/products';
import { AppPage } from './app.page';

/**
 * Dynamic Catalog - Slider: one product at a time, advancing on a timer, with one dot button per
 * product. The current dot has `aria-current="true"`.
 */
export class SliderCatalogPage extends AppPage {
  protected readonly pathname = '/dynamic-catalog-slider.html';
  protected readonly readyMarker: Locator;

  readonly currentProduct: CatalogCardComponent;
  readonly dots: Locator;
  private readonly dotList: Locator;

  constructor(page: Page) {
    super(page);
    const container = page.getByTestId('dynamic-catalog-slider-container');
    this.currentProduct = new CatalogCardComponent(
      container.getByTestId('dynamic-catalog-slider-item'),
    );
    this.dotList = container.getByTestId('dynamic-catalog-slider-dots');
    this.dots = this.dotList.getByRole('button');
    this.readyMarker = container;
  }

  async goto(): Promise<void> {
    await this.page.goto(this.pathname);
  }

  /** The dot button for a product, named "Show <product name>". */
  dot(product: Product): Locator {
    return this.dotList.getByRole('button', { name: `Show ${product.name}`, exact: true });
  }

  async show(product: Product): Promise<void> {
    await this.dot(product).click();
  }

  /** Moves keyboard focus to a dot without clicking it. */
  async focusDot(product: Product): Promise<void> {
    await this.dot(product).focus();
  }
}
