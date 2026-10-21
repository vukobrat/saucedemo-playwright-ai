import type { APIRequestContext, APIResponse } from '@playwright/test';

/**
 * Thin, typed wrappers over DummyJSON endpoints. They return the raw response so tests can
 * assert status codes and error bodies; `parseBody()` validates success bodies against contracts.
 */

export interface Credentials {
  readonly username: string;
  readonly password: string;
}

/** Access tokens issued for tests live long enough for one worker. */
const TOKEN_TTL_MINUTES = 30;

const bearer = (accessToken?: string): Record<string, string> =>
  accessToken === undefined ? {} : { Authorization: `Bearer ${accessToken}` };

export class AuthClient {
  constructor(private readonly request: APIRequestContext) {}

  login(credentials: Credentials): Promise<APIResponse> {
    return this.request.post('/auth/login', {
      data: { ...credentials, expiresInMins: TOKEN_TTL_MINUTES },
    });
  }

  me(accessToken?: string): Promise<APIResponse> {
    return this.request.get('/auth/me', { headers: bearer(accessToken) });
  }

  refresh(refreshToken: string): Promise<APIResponse> {
    return this.request.post('/auth/refresh', {
      data: { refreshToken, expiresInMins: TOKEN_TTL_MINUTES },
    });
  }
}

export interface PageParams {
  readonly limit?: number;
  readonly skip?: number;
  /** Return only these fields (plus `id`). */
  readonly select?: readonly string[];
}

const pageQuery = ({ limit, skip, select }: PageParams = {}): Record<string, string | number> => ({
  ...(limit !== undefined && { limit }),
  ...(skip !== undefined && { skip }),
  ...(select && { select: select.join(',') }),
});

export class ProductsClient {
  constructor(private readonly request: APIRequestContext) {}

  list(params?: PageParams): Promise<APIResponse> {
    return this.request.get('/products', { params: pageQuery(params) });
  }

  get(id: number | string): Promise<APIResponse> {
    return this.request.get(`/products/${id}`);
  }

  search(query: string, params?: PageParams): Promise<APIResponse> {
    return this.request.get('/products/search', { params: { q: query, ...pageQuery(params) } });
  }

  categories(): Promise<APIResponse> {
    return this.request.get('/products/category-list');
  }

  byCategory(category: string): Promise<APIResponse> {
    return this.request.get(`/products/category/${encodeURIComponent(category)}`);
  }

  /** Same product resource behind authentication. */
  getAuthenticated(id: number, accessToken?: string): Promise<APIResponse> {
    return this.request.get(`/auth/products/${id}`, { headers: bearer(accessToken) });
  }
}

export interface CartRequest {
  readonly userId?: number;
  readonly products: readonly { readonly id: number; readonly quantity: number }[];
}

export class CartsClient {
  constructor(private readonly request: APIRequestContext) {}

  /** DummyJSON simulates writes: the response is computed but nothing is stored. */
  add(cart: CartRequest): Promise<APIResponse> {
    return this.request.post('/carts/add', { data: cart });
  }

  get(id: number): Promise<APIResponse> {
    return this.request.get(`/carts/${id}`);
  }
}
