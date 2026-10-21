import { test, expect } from '@fixtures';
import { env } from '@config/env';
import { LOGIN_ERRORS, PAGE_TITLES } from '@data/messages';
import { USERS } from '@data/users';

const INVALID_LOGINS = [
  {
    scenario: 'an empty username',
    username: '',
    password: 'any-password',
    error: LOGIN_ERRORS.usernameRequired,
  },
  {
    scenario: 'an empty password',
    username: USERS.standard.username,
    password: '',
    error: LOGIN_ERRORS.passwordRequired,
  },
  {
    scenario: 'a wrong password',
    username: USERS.standard.username,
    password: 'wrong-password',
    error: LOGIN_ERRORS.invalidCredentials,
  },
  {
    scenario: 'an unknown username',
    username: 'unknown_user',
    password: env.saucePassword,
    error: LOGIN_ERRORS.invalidCredentials,
  },
  {
    scenario: 'a locked out user',
    username: USERS.lockedOut.username,
    password: env.saucePassword,
    error: LOGIN_ERRORS.lockedOut,
  },
] as const;

test.describe('Login', { tag: '@regression' }, () => {
  test.use({ persona: null });

  test.beforeEach(async ({ loginPage }) => {
    await loginPage.goto();
  });

  test(
    'standard user logs in and lands on the products page',
    { tag: '@smoke' },
    async ({ loginPage, inventoryPage }) => {
      await loginPage.loginAs(USERS.standard);

      await inventoryPage.expectLoaded();
      await expect(inventoryPage.title).toHaveText(PAGE_TITLES.inventory);
    },
  );

  for (const { scenario, username, password, error } of INVALID_LOGINS) {
    test(`rejects ${scenario} with a clear error`, async ({ loginPage }) => {
      await loginPage.login(username, password);

      await expect(loginPage.error).toHaveText(error);
      await loginPage.expectLoaded();
    });
  }

  test('error message can be dismissed', async ({ loginPage }) => {
    await loginPage.login('', '');
    await expect(loginPage.error).toBeVisible();

    await loginPage.dismissError();

    await expect(loginPage.error).toBeHidden();
  });

  test('protected pages redirect to login with an explanation', async ({
    loginPage,
    inventoryPage,
  }) => {
    await inventoryPage.goto();

    await loginPage.expectLoaded();
    await expect(loginPage.error).toHaveText(LOGIN_ERRORS.protectedRoute('/inventory.html'));
  });
});
