// Fails when the Playwright versions in package.json, node_modules and the Docker image differ.
// A mismatch makes the image's preinstalled browsers unusable ("Executable doesn't exist").
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const declared = JSON.parse(readFileSync('package.json', 'utf8')).devDependencies[
  '@playwright/test'
];
const installed = require('@playwright/test/package.json').version;
const imageTag = /^FROM mcr\.microsoft\.com\/playwright:v([\d.]+)-/m.exec(
  readFileSync('Dockerfile', 'utf8'),
)?.[1];

const versions = { 'package.json': declared, node_modules: installed, Dockerfile: imageTag };
const distinct = new Set(Object.values(versions));

if (distinct.size !== 1 || distinct.has(undefined)) {
  console.error('Playwright version mismatch:', versions);
  console.error('Update @playwright/test and the Dockerfile FROM tag together.');
  process.exit(1);
}

console.log(`Playwright ${declared} everywhere (package.json, node_modules, Dockerfile).`);
