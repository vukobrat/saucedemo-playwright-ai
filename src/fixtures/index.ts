import { mergeTests } from '@playwright/test';
import { test as a11yTest } from './a11y.fixture';
import { test as dataTest } from './data.fixture';
import { test as pagesTest } from './pages.fixture';
import { test as personaTest } from './persona.fixture';

/** The only `test` specs should import: persona session, page objects, test data, axe. */
export const test = mergeTests(personaTest, pagesTest, dataTest, a11yTest);

export { expect } from '@playwright/test';
