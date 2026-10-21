import { mergeTests } from '@playwright/test';
import { test as dataTest } from './data.fixture';
import { test as pagesTest } from './pages.fixture';

/** The only `test` specs should import: page objects plus seeded test data. */
export const test = mergeTests(pagesTest, dataTest);

export { expect } from '@playwright/test';
