/** Inventory items as verified on the live app. Prices are integer cents to keep math exact. */
export interface Product {
  readonly id: number;
  readonly name: string;
  readonly priceCents: number;
}

export const PRODUCTS = {
  backpack: { id: 4, name: 'Sauce Labs Backpack', priceCents: 2999 },
  bikeLight: { id: 0, name: 'Sauce Labs Bike Light', priceCents: 999 },
  boltTShirt: { id: 1, name: 'Sauce Labs Bolt T-Shirt', priceCents: 1599 },
  fleeceJacket: { id: 5, name: 'Sauce Labs Fleece Jacket', priceCents: 4999 },
  onesie: { id: 2, name: 'Sauce Labs Onesie', priceCents: 799 },
  redTShirt: { id: 3, name: 'Test.allTheThings() T-Shirt (Red)', priceCents: 1599 },
} as const satisfies Record<string, Product>;

export type ProductKey = keyof typeof PRODUCTS;

/** Every product, in the app's default order (name A to Z). */
export const ALL_PRODUCTS: readonly Product[] = Object.values(PRODUCTS);
