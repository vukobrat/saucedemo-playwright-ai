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
} as const satisfies Record<string, KnownBug>;
