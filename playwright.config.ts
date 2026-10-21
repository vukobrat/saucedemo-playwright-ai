import { defineConfig, devices } from '@playwright/test';
import { env } from './src/config/env';

/** Functional browser specs; a11y, visual and api specs get dedicated projects. */
const BROWSER_SPECS = /tests\/(e2e|personas)\/.*\.spec\.ts$/;

/** performance_glitch_user takes about 5.1 s to log in, just over the default 5 s. */
const SETUP_EXPECT_TIMEOUT_MS = 15_000;

const chromium = {
  ...devices['Desktop Chrome'],
  ...(env.browserChannel && { channel: env.browserChannel }),
};

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
    video: env.recordVideo ? 'retain-on-failure' : 'off',
  },

  projects: [
    {
      // Logs in each persona once and saves storageState; sessions are browser-independent.
      name: 'setup',
      testMatch: /tests\/setup\/.*\.setup\.ts$/,
      use: chromium,
      expect: { timeout: SETUP_EXPECT_TIMEOUT_MS },
    },
    {
      name: 'chromium',
      testMatch: BROWSER_SPECS,
      dependencies: ['setup'],
      use: chromium,
    },
    {
      name: 'firefox',
      testMatch: BROWSER_SPECS,
      dependencies: ['setup'],
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      testMatch: BROWSER_SPECS,
      dependencies: ['setup'],
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
