import type { Locator, Page } from '@playwright/test';
import { HeaderComponent } from '@components/header.component';
import { SideMenuComponent } from '@components/side-menu.component';
import { BasePage } from './base.page';

/** A page behind login: shared header, side menu, page title and footer. */
export abstract class AppPage extends BasePage {
  readonly header: HeaderComponent;
  readonly menu: SideMenuComponent;
  /** Secondary header title, e.g. "Products". The product details page has none. */
  readonly title: Locator;
  /** Footer copyright line; it contains the current year, so screenshots mask it. */
  readonly footerCopy: Locator;

  protected constructor(page: Page) {
    super(page);
    this.header = new HeaderComponent(page);
    this.menu = new SideMenuComponent(page);
    this.title = page.getByTestId('title');
    this.footerCopy = page.getByTestId('footer-copy');
  }
}
