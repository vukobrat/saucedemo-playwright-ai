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

  // problem_user
  problemBrokenImages: {
    id: 'SD-101',
    summary: 'problem_user: every inventory image is the same broken "sl-404" image',
  },
  problemSortingIgnored: {
    id: 'SD-102',
    summary: 'problem_user: choosing a sort option does not change the product order',
  },
  problemAddToCartIgnored: {
    id: 'SD-103',
    summary:
      'problem_user: Add to cart does nothing for Bolt T-Shirt, Fleece Jacket and Red T-Shirt',
  },
  problemRemoveIgnored: {
    id: 'SD-104',
    summary: 'problem_user: Remove on the inventory page does nothing',
  },
  problemWrongProductDetails: {
    id: 'SD-105',
    summary: 'problem_user: product links open the details of a different product',
  },
  problemLastNameOverwritesFirstName: {
    id: 'SD-106',
    summary: 'problem_user: typing the last name overwrites the first name at checkout',
  },
  problemAboutLinkBroken: {
    id: 'SD-107',
    summary: 'problem_user: side menu About links to a Sauce Labs 404 page',
  },

  // error_user
  errorSortingAlert: {
    id: 'SD-201',
    summary: 'error_user: sorting raises "Sorting is broken!" and keeps the order',
  },
  errorAddToCartFails: {
    id: 'SD-202',
    summary: 'error_user: Add to cart throws for Bolt T-Shirt, Fleece Jacket and Red T-Shirt',
  },
  errorRemoveFails: {
    id: 'SD-203',
    summary: 'error_user: Remove on the inventory page throws and keeps the item',
  },
  errorLastNameNotEditable: {
    id: 'SD-204',
    summary: 'error_user: the last name field cannot be typed into',
  },
  errorLastNameNotValidated: {
    id: 'SD-205',
    summary: 'error_user: checkout continues without a last name',
  },
  errorFinishDoesNothing: {
    id: 'SD-206',
    summary: 'error_user: Finish throws and the order is never completed',
  },

  // performance_glitch_user
  performanceSlowLogin: {
    id: 'SD-301',
    summary: 'performance_glitch_user: login takes about 5 seconds',
  },
  performanceSlowSorting: {
    id: 'SD-302',
    summary: 'performance_glitch_user: each sort takes about 5 seconds',
  },

  // visual_user
  visualRandomPrices: {
    id: 'SD-401',
    summary: 'visual_user: inventory prices are random and differ from the catalog',
  },
  visualBrokenBackpackImage: {
    id: 'SD-402',
    summary: 'visual_user: the Sauce Labs Backpack image is the broken "sl-404" image',
  },

  // accessibility best practices (axe "best-practice" rules; WCAG 2.2 AA itself passes)
  a11yNoLevelOneHeading: {
    id: 'SD-501',
    summary: 'No page has a level-one heading (axe page-has-heading-one)',
  },
  a11yLoginContentOutsideLandmarks: {
    id: 'SD-502',
    summary: 'Login page content is not inside landmarks (axe region)',
  },
} as const satisfies Record<string, KnownBug>;
