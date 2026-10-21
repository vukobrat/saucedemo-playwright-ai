import { test as setup } from '@fixtures';
import { PERSONAS, USERS } from '@data/users';
import { authStatePath } from '@utils/auth-state';

// Logs in once per persona through the real UI and saves the session for every browser project.
// The session cookie expires after 10 minutes, so this runs at the start of every test run.
setup.use({ persona: null });

for (const persona of PERSONAS) {
  setup(`authenticate as ${persona}`, async ({ page, loginPage, inventoryPage }) => {
    await loginPage.goto();
    await loginPage.loginAs(USERS[persona]);
    await inventoryPage.expectLoaded();
    await page.context().storageState({ path: authStatePath(persona) });
  });
}
