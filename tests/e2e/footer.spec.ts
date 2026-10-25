import { test, expect } from '@fixtures';
import { ALL_SOCIAL_LINKS, FOOTER } from '@data/messages';

// Not the current year, so the test proves the year is read from the browser clock and not
// hardcoded. Noon UTC in mid-year falls in the same year in every time zone.
const CLIENT_TIME = new Date('2031-07-01T12:00:00Z');

test.describe('Footer', { tag: '@regression' }, () => {
  test('shows the social links in order', async ({ inventoryPage }) => {
    await inventoryPage.goto();

    await expect(inventoryPage.footer.socialLinks).toHaveText(
      ALL_SOCIAL_LINKS.map((link) => link.name),
    );
  });

  for (const link of ALL_SOCIAL_LINKS) {
    test(`${link.name} opens the Sauce Labs profile in a new tab`, async ({ inventoryPage }) => {
      await inventoryPage.goto();
      const socialLink = inventoryPage.footer.socialLink(link);

      await expect(socialLink).toBeVisible();
      await expect(socialLink).toHaveAttribute('href', link.href);
      await expect(socialLink).toHaveAttribute('target', '_blank');
      // Either keyword stops the new tab from reaching back to the shop via window.opener.
      await expect(socialLink).toHaveAttribute('rel', /\bno(opener|referrer)\b/);
    });
  }

  test('copyright shows the year of the browser clock', async ({ page, inventoryPage }) => {
    await page.clock.setFixedTime(CLIENT_TIME);
    await inventoryPage.goto();

    await expect(inventoryPage.footer.copyright).toHaveText(
      FOOTER.copyright(CLIENT_TIME.getUTCFullYear()),
    );
  });
});
