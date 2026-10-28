import type { Locator, Page } from '@playwright/test';
import { CatalogCardComponent } from '@components/catalog-card.component';
import { AppPage } from './app.page';

/**
 * Dynamic Catalog - Lazy Load: an endless list. A card shows a placeholder until it scrolls into
 * view, and every time the end of the list scrolls into view, more cards are appended.
 */
export class LazyLoadCatalogPage extends AppPage {
  protected readonly pathname = '/dynamic-catalog-lazy-load.html';
  protected readonly readyMarker: Locator;

  readonly cards: Locator;
  readonly productNames: Locator;
  readonly productPrices: Locator;
  /** Empty element after the last card; it loads more cards when it scrolls into view. */
  readonly endOfList: Locator;

  constructor(page: Page) {
    super(page);
    const list = page.getByTestId('dynamic-catalog-lazy-load-container');
    this.cards = list.getByTestId(/^lazy-load-item-\d+$/);
    this.productNames = list.getByTestId(/^lazy-load-item-\d+-name$/);
    this.productPrices = list.getByTestId(/^lazy-load-item-\d+-price$/);
    this.endOfList = page.getByTestId('dynamic-catalog-lazy-load-sentinel');
    this.readyMarker = list;
  }

  async goto(): Promise<void> {
    await this.page.goto(this.pathname);
  }

  /**
   * The card at a position in the list, counted from 0. Position is a card's only identity: the
   * list repeats its catalog endlessly, so names are not unique, and a card that has not scrolled
   * into view shows no name at all. The app's test ids are positional for the same reason.
   */
  card(index: number): CatalogCardComponent {
    return new CatalogCardComponent(this.page.getByTestId(`lazy-load-item-${index}`));
  }

  /** The last card loaded so far, addressed by its position so it stays put as the list grows. */
  async lastLoadedCard(): Promise<CatalogCardComponent> {
    return this.card((await this.cards.count()) - 1);
  }

  async scrollToEnd(): Promise<void> {
    await this.endOfList.scrollIntoViewIfNeeded();
  }

  /**
   * Names and prices of the first `count` cards, in list order. Every one of those cards must be
   * inside the viewport, or the lists would skip the ones still showing a placeholder.
   */
  async firstEntries(count: number): Promise<{ names: string[]; prices: string[] }> {
    await this.card(count - 1).name.waitFor();
    return {
      names: (await this.productNames.allTextContents()).slice(0, count),
      prices: (await this.productPrices.allTextContents()).slice(0, count),
    };
  }
}
