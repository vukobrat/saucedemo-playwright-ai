import { test as base } from '@playwright/test';
import type { Persona } from '@data/users';
import { authStatePath } from '@utils/auth-state';

export interface PersonaOptions {
  /**
   * Who the test runs as, using the session saved by the setup project.
   * `null` starts logged out (login specs only). Override with `test.use({ persona: 'problem' })`.
   */
  persona: Persona | null;
}

const LOGGED_OUT = { cookies: [], origins: [] };

export const test = base.extend<PersonaOptions>({
  persona: ['standard', { option: true }],
  storageState: async ({ persona }, use) => {
    await use(persona === null ? LOGGED_OUT : authStatePath(persona));
  },
});
