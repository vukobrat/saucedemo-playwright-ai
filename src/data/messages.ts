/** User-facing text, copied verbatim from the live app. */

export const LOGIN_ERRORS = {
  usernameRequired: 'Epic sadface: Username is required',
  passwordRequired: 'Epic sadface: Password is required',
  invalidCredentials: 'Epic sadface: Username and password do not match any user in this service',
  lockedOut: 'Epic sadface: Sorry, this user has been locked out.',
  protectedRoute: (path: string) =>
    `Epic sadface: You can only access '${path}' when you are logged in.`,
} as const;

export const CHECKOUT_ERRORS = {
  firstNameRequired: 'Error: First Name is required',
  lastNameRequired: 'Error: Last Name is required',
  postalCodeRequired: 'Error: Postal Code is required',
} as const;

export const PAGE_TITLES = {
  inventory: 'Products',
  cart: 'Your Cart',
  checkoutInformation: 'Checkout: Your Information',
  checkoutOverview: 'Checkout: Overview',
  checkoutComplete: 'Checkout: Complete!',
} as const;

/** Expected targets of links in the app (content, not environment configuration). */
export const LINKS = {
  about: 'https://saucelabs.com/',
} as const;

/** Product details page for an unknown product id. */
export const PRODUCT_NOT_FOUND = 'ITEM NOT FOUND';

export const CHECKOUT_SUMMARY = {
  payment: 'SauceCard #31337',
  shipping: 'Free Pony Express Delivery!',
} as const;

export const ORDER_COMPLETE = {
  heading: 'Thank you for your order!',
  text: 'Your order has been dispatched, and will arrive just as fast as the pony can get there!',
} as const;
