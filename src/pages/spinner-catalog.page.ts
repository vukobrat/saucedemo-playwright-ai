import type { Locator, Page } from '@playwright/test';
import { AppPage } from './app.page';

/** Dynamic Catalog - Spinner: a loading status, then the catalog in a grid. */
export class SpinnerCatalogPage extends AppPage {
  protected readonly pathname = '/dynamic-catalog-spinner.html';
  protected readonly readyMarker: Locator;

  /** `role="status"` named "Loading"; the grid replaces it after a random delay. */
  readonly loadingStatus: Locator;
  readonly grid: Locator;
  readonly productNames: Locator;
  readonly productPrices: Locator;

  constructor(page: Page) {
    super(page);
    this.loadingStatus = page.getByRole('status', { name: 'Loading' });
    this.grid = page.getByTestId('dynamic-catalog-spinner-grid');
    this.productNames = this.grid.getByTestId(/^spinner-item-\d+-name$/);
    this.productPrices = this.grid.getByTestId(/^spinner-item-\d+-price$/);
    // Holds the loading status first and the grid after it, so it marks the page in both states.
    this.readyMarker = page.getByTestId('dynamic-catalog-spinner-container');
  }

  async goto(): Promise<void> {
    await this.page.goto(this.pathname);
  }
}
