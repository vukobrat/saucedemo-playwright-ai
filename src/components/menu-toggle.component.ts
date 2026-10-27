import { expect, type Locator, type Page } from '@playwright/test';

/** Burger button that opens the side menu. */
export class MenuToggleComponent {
  readonly burger: Locator;
  readonly openButton: Locator;

  constructor(page: Page) {
    this.burger = page.locator('.bm-burger-button');
    this.openButton = page.getByTestId('open-menu');
  }

  async open(): Promise<void> {
    await this.openButton.click();
    await expect(this.burger).toBeVisible();
  }
}
