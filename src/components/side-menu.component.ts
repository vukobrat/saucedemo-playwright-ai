import type { Locator, Page } from '@playwright/test';
import { CATALOG_VARIANTS, type CatalogVariant } from '@data/dynamic-catalog';

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
  /** Disclosure button (`aria-expanded`) for a submenu that is only rendered while expanded. */
  readonly dynamicCatalogButton: Locator;
  readonly aboutLink: Locator;
  readonly logoutButton: Locator;
  readonly resetAppStateButton: Locator;
  private readonly nav: Locator;

  constructor(page: Page) {
    // The data-test ids "open-menu" and "close-menu" sit on images covered by these buttons.
    this.openButton = page.getByRole('button', { name: 'Open Menu' });
    this.closeButton = page.getByRole('button', { name: 'Close Menu' });
    this.nav = page.getByRole('navigation');
    this.allItemsButton = this.nav.getByRole('button', { name: 'All Items' });
    this.dynamicCatalogButton = this.nav.getByRole('button', { name: 'Dynamic Catalog' });
    this.aboutLink = this.nav.getByRole('link', { name: 'About' });
    this.logoutButton = this.nav.getByRole('button', { name: 'Logout' });
    this.resetAppStateButton = this.nav.getByRole('button', { name: 'Reset App State' });
  }

  /** A submenu item of "Dynamic Catalog"; it exists only while that submenu is expanded. */
  dynamicCatalogItem(variant: CatalogVariant): Locator {
    return this.nav.getByRole('button', { name: CATALOG_VARIANTS[variant], exact: true });
  }

  /** Opens the menu and expands "Dynamic Catalog", which starts collapsed on every page. */
  async expandDynamicCatalog(): Promise<void> {
    await this.open();
    await this.dynamicCatalogButton.click();
  }

  async openDynamicCatalog(variant: CatalogVariant): Promise<void> {
    await this.expandDynamicCatalog();
    await this.dynamicCatalogItem(variant).click();
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
