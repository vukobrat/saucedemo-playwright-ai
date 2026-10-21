/** @type {import('lint-staged').Configuration} */
export default {
  '*.{ts,mjs,js}': ['eslint --fix --max-warnings=0', 'prettier --write'],
  '*.{json,md,yml,yaml}': 'prettier --write',
};
