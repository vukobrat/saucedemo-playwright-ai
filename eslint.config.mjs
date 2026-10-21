// @ts-check
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import playwright from 'eslint-plugin-playwright';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Suite tags used for CI selection. Keep in sync with CLAUDE.md and the npm test scripts. */
const SUITE_TAGS = ['@smoke', '@regression', '@persona', '@a11y', '@visual', '@api'];

export default defineConfig(
  globalIgnores(['test-results/', 'playwright-report/', 'blob-report/', '.auth/']),

  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
  },

  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // Report output through Playwright (annotations, attachments, reporters), not the console.
      'no-console': 'error',
    },
  },

  // Every lint suppression must say why, so silencing a rule is a reviewable decision.
  eslintComments.recommended,
  {
    rules: {
      '@eslint-community/eslint-comments/require-description': ['error', { ignore: [] }],
      '@eslint-community/eslint-comments/no-unlimited-disable': 'error',
    },
  },

  // Plain JS (config files, scripts) runs in Node and is outside the TypeScript project.
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },

  // Playwright rules for all framework code: pages, components, fixtures and specs.
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    extends: [playwright.configs['flat/recommended']],
    rules: {
      'playwright/no-wait-for-timeout': 'error',
      'playwright/no-wait-for-selector': 'error',
      'playwright/no-force-option': 'error',
      'playwright/no-element-handle': 'error',
      'playwright/no-eval': 'error',
      'playwright/no-page-pause': 'error',
      'playwright/no-nth-methods': 'error',
      'playwright/no-magic-timeouts': 'error',
      'playwright/prefer-locator': 'error',
      'playwright/prefer-native-locators': ['error', { testIdAttribute: 'data-test' }],
      'playwright/require-annotation-reason': [
        'error',
        { annotations: ['skip', 'fixme', 'fail', 'slow'] },
      ],
    },
  },

  // Specs: no locators (they belong in page objects), tagged, deterministic, assertion-driven.
  {
    files: ['tests/**/*.ts'],
    rules: {
      'playwright/no-raw-locators': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.object.name='page'][callee.property.name=/^(locator|getBy\\w+|frameLocator)$/]",
          message:
            'Specs must not build locators. Add the locator to a page object or component in src/.',
        },
      ],
      'playwright/valid-test-tags': ['error', { allowedTags: SUITE_TAGS }],
      'playwright/no-conditional-in-test': 'error',
      'playwright/no-conditional-expect': 'error',
      'playwright/no-skipped-test': ['error', { allowConditional: true }],
      'playwright/no-identical-title': 'error',
      // Page-object guards such as `inventoryPage.expectLoaded()` count as assertions.
      'playwright/expect-expect': ['error', { assertFunctionPatterns: ['^expect'] }],
    },
  },
  {
    files: ['tests/**/*.spec.ts'],
    rules: { 'playwright/require-tags': 'error' },
  },

  // Must stay last: turns off stylistic rules that Prettier owns.
  prettier,
);
