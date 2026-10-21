import { mergeTests } from '@playwright/test';
import { test as a11yTest } from './a11y.fixture';
import { test as apiTest } from './api.fixture';
import { test as dataTest } from './data.fixture';
import { test as pagesTest } from './pages.fixture';
import { test as personaTest } from './persona.fixture';

/**
 * The only `test` specs should import: persona session, page objects, test data, axe and API
 * clients. Fixtures are lazy, so API tests never start a browser.
 */
export const test = mergeTests(personaTest, pagesTest, dataTest, a11yTest, apiTest);

export { expect } from '@playwright/test';
