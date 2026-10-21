import { test, expect } from '@fixtures';
import { API_ERRORS } from '@api/messages';
import { parseBody } from '@api/parse';
import { ErrorResponseSchema, LoginResponseSchema, TokensSchema, UserSchema } from '@api/schemas';
import { KNOWN_BUGS } from '@data/known-bugs';
import { knownBug } from '@utils/known-bug';

const INVALID_LOGINS = [
  {
    scenario: 'a wrong password',
    password: 'wrong-password',
    error: API_ERRORS.invalidCredentials,
  },
  { scenario: 'an empty password', password: '', error: API_ERRORS.credentialsRequired },
] as const;

test.describe('API: authentication', { tag: '@api' }, () => {
  test('login returns tokens and the user profile', async ({ authClient, apiCredentials }) => {
    const response = await authClient.login(apiCredentials);

    expect(response.status()).toBe(200);
    const body = await parseBody(response, LoginResponseSchema);
    expect(body.username).toBe(apiCredentials.username);
  });

  for (const { scenario, password, error } of INVALID_LOGINS) {
    test(`login rejects ${scenario}`, async ({ authClient, apiCredentials }) => {
      const response = await authClient.login({ username: apiCredentials.username, password });

      expect(response.status()).toBe(400);
      expect(await parseBody(response, ErrorResponseSchema)).toEqual({ message: error });
    });
  }

  test('the access token identifies the current user', async ({
    authClient,
    accessToken,
    apiCredentials,
  }) => {
    const response = await authClient.me(accessToken);

    expect(response.status()).toBe(200);
    expect((await parseBody(response, UserSchema)).username).toBe(apiCredentials.username);
  });

  test('requests without a token are rejected', async ({ authClient }) => {
    const response = await authClient.me();

    expect(response.status()).toBe(401);
    expect(await parseBody(response, ErrorResponseSchema)).toEqual({
      message: API_ERRORS.accessTokenRequired,
    });
  });

  test('a malformed token is rejected as unauthorized', async ({ authClient }) => {
    knownBug(KNOWN_BUGS.apiMalformedTokenServerError);

    const response = await authClient.me('not.a.token');

    expect(response.status()).toBe(401);
  });

  test('a refresh token issues working tokens', async ({ authClient, apiCredentials }) => {
    const login = await parseBody(await authClient.login(apiCredentials), LoginResponseSchema);

    const response = await authClient.refresh(login.refreshToken);

    expect(response.status()).toBe(200);
    const tokens = await parseBody(response, TokensSchema);
    expect((await authClient.me(tokens.accessToken)).status()).toBe(200);
  });

  test('protected resources require a token', async ({ productsClient, accessToken }) => {
    expect((await productsClient.getAuthenticated(1, accessToken)).status()).toBe(200);
    expect((await productsClient.getAuthenticated(1)).status()).toBe(401);
  });
});
