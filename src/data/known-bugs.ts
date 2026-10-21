/**
 * Catalogue of known SauceDemo defects (details in docs/app-exploration.md). Specs assert the
 * correct behavior and reference an entry through `knownBug()`. The ids are stable: reports,
 * triage agents and evals refer to them.
 */
export interface KnownBug {
  readonly id: string;
  readonly summary: string;
}

export const KNOWN_BUGS = {
  resetAppStateStaleButtons: {
    id: 'SD-001',
    summary: 'Reset App State empties the cart but product buttons keep showing "Remove"',
  },
  cartAccessibleNameSingular: {
    id: 'SD-002',
    summary: 'Cart button is announced as "Cart, 1 items" instead of "Cart, 1 item"',
  },
  checkoutWithEmptyCart: {
    id: 'SD-003',
    summary: 'Checkout is allowed with an empty cart; a $0.00 order can be completed',
  },
  whitespaceOnlyCustomerName: {
    id: 'SD-004',
    summary: 'Checkout accepts a last name made only of spaces',
  },
} as const satisfies Record<string, KnownBug>;
