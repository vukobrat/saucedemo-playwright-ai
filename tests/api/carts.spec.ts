import { z } from 'zod';
import { test, expect } from '@fixtures';
import { API_ERRORS } from '@api/messages';
import { parseBody } from '@api/parse';
import {
  AddedCartSchema,
  ErrorResponseSchema,
  StoredCartSchema,
  type AddedCart,
  type StoredCart,
} from '@api/schemas';
import { KNOWN_BUGS } from '@data/known-bugs';
import { knownBug } from '@utils/known-bug';

const CART_REQUEST = {
  userId: 1,
  products: [
    { id: 1, quantity: 2 },
    { id: 50, quantity: 1 },
  ],
} as const;

/** Endpoint-independent view of a cart, so one set of arithmetic checks covers both contracts. */
interface CartTotals {
  readonly products: readonly {
    readonly id: number;
    readonly price: number;
    readonly quantity: number;
    readonly total: number;
    readonly discounted: number;
  }[];
  readonly total: number;
  readonly discountedTotal: number;
  readonly totalProducts: number;
  readonly totalQuantity: number;
}

const fromAdded = (cart: AddedCart): CartTotals => ({
  ...cart,
  products: cart.products.map((line) => ({ ...line, discounted: line.discountedPrice })),
});

const fromStored = (cart: StoredCart): CartTotals => ({
  ...cart,
  products: cart.products.map((line) => ({ ...line, discounted: line.discountedTotal })),
});

/** Money is compared in cents to avoid floating point noise. */
const cents = (amount: number): number => Math.round(amount * 100);
const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

function expectConsistentTotals(cart: CartTotals): void {
  for (const line of cart.products) {
    expect(cents(line.total), `line ${line.id} total`).toBe(cents(line.price) * line.quantity);
    expect(line.discounted, `line ${line.id} discounted`).toBeLessThanOrEqual(line.total);
  }
  expect(cents(cart.total)).toBe(sum(cart.products.map((line) => cents(line.total))));
  expect(cents(cart.discountedTotal)).toBe(
    sum(cart.products.map((line) => cents(line.discounted))),
  );
  expect(cart.totalProducts).toBe(cart.products.length);
  expect(cart.totalQuantity).toBe(sum(cart.products.map((line) => line.quantity)));
}

/** Field names of the first cart line, whatever the endpoint. */
const AnyCartSchema = z.object({ products: z.array(z.record(z.string(), z.unknown())).min(1) });
const firstLineFields = (cart: z.infer<typeof AnyCartSchema>): string[] =>
  Object.keys(cart.products[0] ?? {}).sort();

test.describe('API: carts', { tag: '@api' }, () => {
  test('adding a cart returns the requested items with consistent totals', async ({
    cartsClient,
  }) => {
    const response = await cartsClient.add(CART_REQUEST);

    expect(response.status()).toBe(201);
    const cart = await parseBody(response, AddedCartSchema);
    expect(cart.userId).toBe(CART_REQUEST.userId);
    expect(cart.products.map(({ id, quantity }) => ({ id, quantity }))).toEqual(
      CART_REQUEST.products,
    );
    expectConsistentTotals(fromAdded(cart));
  });

  test('an existing cart has consistent totals', async ({ cartsClient }) => {
    const response = await cartsClient.get(1);

    expect(response.status()).toBe(200);
    expectConsistentTotals(fromStored(await parseBody(response, StoredCartSchema)));
  });

  test('cart lines use the same fields on every endpoint', async ({ cartsClient }) => {
    knownBug(KNOWN_BUGS.apiCartLineFieldNames);

    const added = await parseBody(await cartsClient.add(CART_REQUEST), AnyCartSchema);
    const stored = await parseBody(await cartsClient.get(1), AnyCartSchema);

    expect(firstLineFields(added)).toEqual(firstLineFields(stored));
  });

  test('a cart requires a user id', async ({ cartsClient }) => {
    const response = await cartsClient.add({ products: CART_REQUEST.products });

    expect(response.status()).toBe(400);
    expect(await parseBody(response, ErrorResponseSchema)).toEqual({
      message: API_ERRORS.userIdRequired,
    });
  });

  test('added carts are simulated and not stored', async ({ cartsClient }) => {
    const added = await parseBody(await cartsClient.add(CART_REQUEST), AddedCartSchema);

    const response = await cartsClient.get(added.id);

    expect(response.status()).toBe(404);
    expect(await parseBody(response, ErrorResponseSchema)).toEqual({
      message: API_ERRORS.cartNotFound(added.id),
    });
  });
});
