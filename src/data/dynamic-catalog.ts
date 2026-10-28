import { ALL_PRODUCTS, PRODUCTS, type Product } from './products';

/** The Dynamic Catalog pages, as the side menu's "Dynamic Catalog" submenu labels them. */
export const CATALOG_VARIANTS = {
  lazyLoad: 'Lazy Load',
  spinner: 'Spinner',
  slider: 'Slider',
} as const;

export type CatalogVariant = keyof typeof CATALOG_VARIANTS;

/** Every catalog variant, in submenu order. */
export const ALL_CATALOG_VARIANTS: readonly CatalogVariant[] = Object.keys(
  CATALOG_VARIANTS,
) as CatalogVariant[];

// Timings and batch size as the app's source sets them (verified 2026-10-28).

/** The Spinner page shows its loading status for a random 0.5 to 3 s. */
export const SPINNER_MAX_DELAY_MS = 3_000;
/** The Slider shows the next product every 2 s and wraps around after the last. */
export const SLIDER_INTERVAL_MS = 2_000;
/** Each time the end of the Lazy Load list scrolls into view, this many cards are appended. */
export const LAZY_LOAD_BATCH_SIZE = 6;

/** The Spinner and Slider pages list the catalog in product id order. */
export const PRODUCTS_BY_ID: readonly Product[] = [...ALL_PRODUCTS].sort((a, b) => a.id - b.id);

export const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;

/** Products the Lazy Load catalog lists once per size, named "<product> (<size>)". */
const SIZED_PRODUCTS: readonly Product[] = [
  PRODUCTS.boltTShirt,
  PRODUCTS.fleeceJacket,
  PRODUCTS.redTShirt,
];

/** One entry of the Lazy Load catalog: a product, possibly in one size. */
export interface CatalogEntry {
  readonly name: string;
  readonly product: Product;
}

/**
 * One cycle of the Lazy Load catalog as it should be: every product, sized products once per
 * size. The page repeats the cycle endlessly.
 */
export const LAZY_LOAD_ENTRIES: readonly CatalogEntry[] = PRODUCTS_BY_ID.flatMap((product) =>
  SIZED_PRODUCTS.includes(product)
    ? SIZES.map((size) => ({ name: `${product.name} (${size})`, product }))
    : [{ name: product.name, product }],
);
