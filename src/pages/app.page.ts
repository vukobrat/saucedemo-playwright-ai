import type { Locator, Page } from '@playwright/test';
import { HeaderComponent } from '@components/header.component';
import { SideMenuComponent } from '@components/side-menu.component';
import { BasePage } from './base.page';

/** A page behind login: shared header, side menu and page title. */
export abstract class AppPage extends BasePage {
  readonly header: HeaderComponent;
  readonly menu: SideMenuComponent;
  /** Secondary header title, e.g. "Products". The product details page has none. */
  readonly title: Locator;

  protected constructor(page: Page) {
    super(page);
    this.header = new HeaderComponent(page);
    this.menu = new SideMenuComponent(page);
    this.title = page.getByTestId('title');
  }
}
