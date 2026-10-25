import type { Locator, Page } from '@playwright/test';
import type { SocialLink } from '@data/messages';

/** Footer shown on every logged-in page: social links and the copyright line. */
export class FooterComponent {
  /** The social links, in display order. */
  readonly socialLinks: Locator;
  /** Copyright line; it contains the current year, so screenshots mask it. */
  readonly copyright: Locator;

  private readonly root: Locator;

  constructor(page: Page) {
    this.root = page.getByTestId('footer');
    this.socialLinks = this.root.getByRole('list').getByRole('link');
    this.copyright = this.root.getByTestId('footer-copy');
  }

  /** Exact match, because role names match substrings and "X" is a single letter. */
  socialLink(link: SocialLink): Locator {
    return this.root.getByRole('link', { name: link.name, exact: true });
  }
}
