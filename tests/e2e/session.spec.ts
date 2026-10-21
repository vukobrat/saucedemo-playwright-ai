import { test, expect } from '@fixtures';
import { LOGIN_ERRORS } from '@data/messages';
import { PERSONAS } from '@data/users';

test.describe('Session', { tag: '@regression' }, () => {
  for (const persona of PERSONAS) {
    test.describe(`as ${persona}`, () => {
      test.use({ persona });

      test('saved session opens the products page without logging in', async ({
        inventoryPage,
      }) => {
        await inventoryPage.goto();

        await inventoryPage.expectLoaded();
      });
    });
  }

  test('logout ends the session', { tag: '@smoke' }, async ({ inventoryPage, loginPage }) => {
    await inventoryPage.goto();
    await inventoryPage.menu.logout();
    await loginPage.expectLoaded();

    await inventoryPage.goto();

    await loginPage.expectLoaded();
    await expect(loginPage.error).toHaveText(LOGIN_ERRORS.protectedRoute('/inventory.html'));
  });
});
