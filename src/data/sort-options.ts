import type { Product } from './products';

/** Inventory sort dropdown: `<option>` value and visible label. */
export const SORT_OPTIONS = {
  nameAsc: { value: 'az', label: 'Name (A to Z)' },
  nameDesc: { value: 'za', label: 'Name (Z to A)' },
  priceAsc: { value: 'lohi', label: 'Price (low to high)' },
  priceDesc: { value: 'hilo', label: 'Price (high to low)' },
} as const;

export type SortOption = keyof typeof SORT_OPTIONS;

const byName = (a: Product, b: Product): number => a.name.localeCompare(b.name, 'en');

/**
 * Expected product order for a sort option. Price ties keep name A to Z order in both
 * directions, as verified on the live app.
 */
export function sortProducts(products: readonly Product[], option: SortOption): Product[] {
  const nameAsc = [...products].sort(byName);
  switch (option) {
    case 'nameAsc':
      return nameAsc;
    case 'nameDesc':
      return nameAsc.reverse();
    case 'priceAsc':
      return nameAsc.sort((a, b) => a.priceCents - b.priceCents);
    case 'priceDesc':
      return nameAsc.sort((a, b) => b.priceCents - a.priceCents);
  }
}
