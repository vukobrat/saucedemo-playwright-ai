/** DummyJSON error messages, copied verbatim from the live API. */
export const API_ERRORS = {
  invalidCredentials: 'Invalid credentials',
  credentialsRequired: 'Username and password required',
  accessTokenRequired: 'Access Token is required',
  userIdRequired: 'User id is required',
  productNotFound: (id: number | string) => `Product with id '${id}' not found`,
  cartNotFound: (id: number | string) => `Cart with id '${id}' not found`,
} as const;
