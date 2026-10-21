import type { Locator, Page } from '@playwright/test';

/**
 * Burger side menu. Items are `<a role="button">` (About is a real link) inside a wrapper that
 * is `aria-hidden` while closed. Role locators therefore only match an open menu: actions wait
 * for it to open, and `toBeHidden()` means closed. Test-id locators would not work for that,
 * because closed items sit off-screen but still count as visible.
 */
export class SideMenuComponent {
  readonly openButton: Locator;
  readonly closeButton: Locator;
  readonly allItemsButton: Locator;
  readonly aboutLink: Locator;
  readonly logoutButton: Locator;
  readonly resetAppStateButton: Locator;

  constructor(page: Page) {
    // The data-test ids "open-menu" and "close-menu" sit on images covered by these buttons.
    this.openButton = page.getByRole('button', { name: 'Open Menu' });
    this.closeButton = page.getByRole('button', { name: 'Close Menu' });
    const nav = page.getByRole('navigation');
    this.allItemsButton = nav.getByRole('button', { name: 'All Items' });
    this.aboutLink = nav.getByRole('link', { name: 'About' });
    this.logoutButton = nav.getByRole('button', { name: 'Logout' });
    this.resetAppStateButton = nav.getByRole('button', { name: 'Reset App State' });
  }

  async open(): Promise<void> {
    await this.openButton.click();
  }

  async close(): Promise<void> {
    await this.closeButton.click();
  }

  async logout(): Promise<void> {
    await this.open();
    await this.logoutButton.click();
  }

  async resetAppState(): Promise<void> {
    await this.open();
    await this.resetAppStateButton.click();
  }

  async goToAllItems(): Promise<void> {
    await this.open();
    await this.allItemsButton.click();
  }
}
