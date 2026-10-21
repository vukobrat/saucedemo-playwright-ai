import { test as base, type APIRequestContext } from '@playwright/test';
import { AuthClient, CartsClient, ProductsClient, type Credentials } from '@api/clients';
import { parseBody } from '@api/parse';
import { LoginResponseSchema } from '@api/schemas';
import { env } from '@config/env';

export interface ApiFixtures {
  /**
   * A fresh HTTP context per test (no browser). Per test, not per worker: DummyJSON's login
   * sets auth cookies, and a shared cookie jar would silently authenticate later requests.
   */
  apiRequest: APIRequestContext;
  authClient: AuthClient;
  productsClient: ProductsClient;
  cartsClient: CartsClient;
}

export interface ApiWorkerFixtures {
  /** Demo account from the environment; fails fast with a clear message when missing. */
  apiCredentials: Credentials;
  /** Logged in once per worker, reused by every test in that worker. */
  accessToken: string;
}

export const test = base.extend<ApiFixtures, ApiWorkerFixtures>({
  apiCredentials: [
    async ({}, use) => {
      const { apiUsername: username, apiPassword: password } = env;
      if (!username || !password) {
        throw new Error(
          'API_USERNAME and API_PASSWORD are required for API tests: set them in .env or export them',
        );
      }
      await use({ username, password });
    },
    { scope: 'worker' },
  ],
  accessToken: [
    async ({ playwright, apiCredentials }, use) => {
      // Own throwaway context, so the login cookies never reach the tests' contexts.
      const request = await playwright.request.newContext({ baseURL: env.apiBaseUrl });
      const response = await new AuthClient(request).login(apiCredentials);
      if (!response.ok()) {
        throw new Error(`API login failed with HTTP ${response.status()}`);
      }
      const { accessToken } = await parseBody(response, LoginResponseSchema);
      await request.dispose();
      await use(accessToken);
    },
    { scope: 'worker' },
  ],
  apiRequest: async ({ playwright }, use) => {
    const request = await playwright.request.newContext({ baseURL: env.apiBaseUrl });
    await use(request);
    await request.dispose();
  },
  authClient: async ({ apiRequest }, use) => {
    await use(new AuthClient(apiRequest));
  },
  productsClient: async ({ apiRequest }, use) => {
    await use(new ProductsClient(apiRequest));
  },
  cartsClient: async ({ apiRequest }, use) => {
    await use(new CartsClient(apiRequest));
  },
});
