import { Faker, en } from '@faker-js/faker';
import { test as base } from '@playwright/test';
import { seedFrom } from '@utils/seed';

export interface DataFixtures {
  /**
   * Faker seeded from the test id: data varies between tests but is identical on every run
   * of the same test, so failures reproduce. The seed is recorded as an annotation.
   */
  faker: Faker;
}

export const test = base.extend<DataFixtures>({
  faker: async ({}, use, testInfo) => {
    const seed = seedFrom(testInfo.testId);
    testInfo.annotations.push({ type: 'faker-seed', description: String(seed) });
    const faker = new Faker({ locale: [en] });
    faker.seed(seed);
    await use(faker);
  },
});
