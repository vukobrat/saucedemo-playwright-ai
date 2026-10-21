import type { Download, Locator, Page } from '@playwright/test';
import { AppPage } from './app.page';

/** Order confirmation. */
export class CheckoutCompletePage extends AppPage {
  protected readonly pathname = '/checkout-complete.html';
  protected readonly readyMarker: Locator;

  readonly heading: Locator;
  readonly message: Locator;
  readonly backHomeButton: Locator;
  readonly generatePdfButton: Locator;

  constructor(page: Page) {
    super(page);
    const container = page.getByTestId('checkout-complete-container');
    this.heading = container.getByRole('heading');
    this.message = container.getByTestId('complete-text');
    this.backHomeButton = page.getByRole('button', { name: 'Back Home' });
    this.generatePdfButton = page.getByRole('button', { name: 'Generate PDF order' });
    this.readyMarker = container;
  }

  async backHome(): Promise<void> {
    await this.backHomeButton.click();
  }

  /** Clicks "Generate PDF order" and returns the resulting download. */
  async downloadOrderPdf(): Promise<Download> {
    const download = this.page.waitForEvent('download');
    await this.generatePdfButton.click();
    return download;
  }
}
