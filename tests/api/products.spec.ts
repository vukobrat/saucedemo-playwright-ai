import { z } from 'zod';
import { test, expect } from '@fixtures';
import { API_ERRORS } from '@api/messages';
import { parseBody } from '@api/parse';
import { ErrorResponseSchema, ProductPageSchema, ProductSchema, pageOf } from '@api/schemas';

const SEARCH_TERM = 'phone';
const CATEGORY = 'smartphones';

test.describe('API: products', { tag: '@api' }, () => {
  test('paginates with limit and skip', async ({ productsClient }) => {
    const response = await productsClient.list({ limit: 10, skip: 5 });

    expect(response.status()).toBe(200);
    const page = await parseBody(response, ProductPageSchema);
    expect(page).toMatchObject({ limit: 10, skip: 5 });
    expect(page.products.map((p) => p.id)).toEqual([6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(page.total).toBeGreaterThan(page.skip + page.limit);
  });

  test('returns only the selected fields', async ({ productsClient }) => {
    const response = await productsClient.list({ limit: 3, select: ['title', 'price'] });

    expect(response.status()).toBe(200);
    // strictObject: any field besides id, title and price breaks the contract.
    const page = await parseBody(
      response,
      pageOf(z.strictObject({ id: z.number(), title: z.string(), price: z.number() })),
    );
    expect(page.products).toHaveLength(3);
  });

  test('search returns only matching products', async ({ productsClient }) => {
    const response = await productsClient.search(SEARCH_TERM, { limit: 50 });

    expect(response.status()).toBe(200);
    const page = await parseBody(response, ProductPageSchema);
    expect(page.total).toBeGreaterThan(0);
    for (const product of page.products) {
      expect(`${product.title} ${product.description}`.toLowerCase()).toContain(SEARCH_TERM);
    }
  });

  test('returns a single product by id', async ({ productsClient }) => {
    const response = await productsClient.get(1);

    expect(response.status()).toBe(200);
    expect((await parseBody(response, ProductSchema)).id).toBe(1);
  });

  for (const id of [999999, 'abc']) {
    test(`an unknown product id (${id}) returns 404`, async ({ productsClient }) => {
      const response = await productsClient.get(id);

      expect(response.status()).toBe(404);
      expect(await parseBody(response, ErrorResponseSchema)).toEqual({
        message: API_ERRORS.productNotFound(id),
      });
    });
  }

  test('filters products by category', async ({ productsClient }) => {
    const categories = await parseBody(await productsClient.categories(), z.array(z.string()));
    expect(categories).toContain(CATEGORY);

    const response = await productsClient.byCategory(CATEGORY);

    expect(response.status()).toBe(200);
    const page = await parseBody(response, ProductPageSchema);
    expect(page.products.length).toBeGreaterThan(0);
    expect(new Set(page.products.map((p) => p.category))).toEqual(new Set([CATEGORY]));
  });
});
