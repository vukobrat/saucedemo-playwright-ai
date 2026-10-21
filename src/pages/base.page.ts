import { expect, type Locator, type Page } from '@playwright/test';

/** A routed screen of the app. */
export abstract class BasePage {
  /** URL path of the page, without query string. */
  protected abstract readonly pathname: string;
  /** Element that only this page renders; its visibility proves the page finished loading. */
  protected abstract readonly readyMarker: Locator;

  protected constructor(protected readonly page: Page) {}

  /**
   * The one assertion page objects own: a navigation guard used after every page transition.
   * Matches on pathname only, because deep links render correctly but return HTTP 404.
   */
  async expectLoaded(): Promise<void> {
    await expect(this.page).toHaveURL((url) => url.pathname === this.pathname);
    await expect(this.readyMarker).toBeVisible();
  }
}
