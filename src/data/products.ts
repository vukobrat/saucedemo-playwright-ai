/** Inventory items as verified on the live app. Prices are integer cents to keep math exact. */
export interface Product {
  readonly id: number;
  readonly name: string;
  readonly priceCents: number;
  /** Image file name stem; the served file adds a content hash, e.g. `-CjRW-Djj.jpg`. */
  readonly image: string;
}

export const PRODUCTS = {
  backpack: {
    id: 4,
    name: 'Sauce Labs Backpack',
    priceCents: 2999,
    image: 'sauce-backpack-1200x1500',
  },
  bikeLight: {
    id: 0,
    name: 'Sauce Labs Bike Light',
    priceCents: 999,
    image: 'bike-light-1200x1500',
  },
  boltTShirt: {
    id: 1,
    name: 'Sauce Labs Bolt T-Shirt',
    priceCents: 1599,
    image: 'bolt-shirt-1200x1500',
  },
  fleeceJacket: {
    id: 5,
    name: 'Sauce Labs Fleece Jacket',
    priceCents: 4999,
    image: 'sauce-pullover-1200x1500',
  },
  onesie: { id: 2, name: 'Sauce Labs Onesie', priceCents: 799, image: 'red-onesie-1200x1500' },
  redTShirt: {
    id: 3,
    name: 'Test.allTheThings() T-Shirt (Red)',
    priceCents: 1599,
    image: 'red-tatt-1200x1500',
  },
} as const satisfies Record<string, Product>;

export type ProductKey = keyof typeof PRODUCTS;

/** Every product, in the app's default order (name A to Z). */
export const ALL_PRODUCTS: readonly Product[] = Object.values(PRODUCTS);

/** Matches the served image URL of a product, e.g. `/assets/sauce-backpack-1200x1500-CjRW-Djj.jpg`. */
export function imageSrcPattern(product: Product): RegExp {
  return new RegExp(`/${product.image}-[\\w-]+\\.jpg$`);
}
