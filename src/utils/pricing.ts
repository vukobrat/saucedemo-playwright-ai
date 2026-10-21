import type { Product } from '@data/products';

/** Checkout tax rate, verified on the live app (39.98 -> 3.20, 105.96 -> 8.48). */
export const TAX_RATE = 0.08;

export interface OrderTotals {
  readonly subtotalCents: number;
  readonly taxCents: number;
  readonly totalCents: number;
}

/** Formats cents the way the app shows prices, e.g. 2999 -> "$29.99". */
export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function orderTotals(products: readonly Product[]): OrderTotals {
  const subtotalCents = products.reduce((sum, product) => sum + product.priceCents, 0);
  const taxCents = Math.round(subtotalCents * TAX_RATE);
  return { subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
}

/** The three summary lines exactly as the checkout overview renders them. */
export function summaryLines(totals: OrderTotals): {
  subtotal: string;
  tax: string;
  total: string;
} {
  return {
    subtotal: `Item total: ${formatPrice(totals.subtotalCents)}`,
    tax: `Tax: ${formatPrice(totals.taxCents)}`,
    total: `Total: ${formatPrice(totals.totalCents)}`,
  };
}
