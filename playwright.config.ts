import { defineConfig, devices } from '@playwright/test';
import { env } from './src/config/env';

/** Functional browser specs; a11y, visual and api specs get dedicated projects. */
const BROWSER_SPECS = /tests\/(e2e|personas)\/.*\.spec\.ts$/;

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',

  fullyParallel: true,
  forbidOnly: env.isCI,
  retries: env.isCI ? 2 : 0,

  reporter: env.isCI ? [['blob'], ['github'], ['list']] : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: env.baseUrl,
    testIdAttribute: 'data-test',
    // Record on every run, keep only for failures: the first failure always has a trace.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      testMatch: BROWSER_SPECS,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      testMatch: BROWSER_SPECS,
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      testMatch: BROWSER_SPECS,
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
