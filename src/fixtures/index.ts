import { mergeTests } from '@playwright/test';
import { test as dataTest } from './data.fixture';
import { test as pagesTest } from './pages.fixture';
import { test as personaTest } from './persona.fixture';

/** The only `test` specs should import: persona session, page objects and seeded test data. */
export const test = mergeTests(personaTest, pagesTest, dataTest);

export { expect } from '@playwright/test';
