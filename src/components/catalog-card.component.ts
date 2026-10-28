import type { Locator } from '@playwright/test';

/**
 * One product card on a Dynamic Catalog page. The pages prefix the card's test ids differently
 * (`spinner-item-0-name`, `lazy-load-item-0-name`, `dynamic-catalog-slider-item-name`), so the
 * parts are matched by their shared suffix. A Lazy Load card shows only a placeholder until it
 * scrolls into view.
 */
export class CatalogCardComponent {
  readonly name: Locator;
  readonly price: Locator;
  readonly image: Locator;
  readonly placeholder: Locator;

  constructor(readonly root: Locator) {
    this.name = root.getByTestId(/-name$/);
    this.price = root.getByTestId(/-price$/);
    this.image = root.getByRole('img');
    this.placeholder = root.getByTestId(/-placeholder$/);
  }

  async scrollIntoView(): Promise<void> {
    await this.root.scrollIntoViewIfNeeded();
  }
}
