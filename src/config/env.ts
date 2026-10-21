import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

/**
 * Typed, validated runtime configuration. This is the only module that reads `process.env`.
 *
 * Sources, highest precedence first: real environment variables (shell, CI secrets), then the
 * optional `.env` file at the repo root. `process.loadEnvFile()` never overrides a variable that
 * is already set, so CI values always win over a stray local file.
 */
const ENV_FILE = path.resolve(__dirname, '../../.env');

if (existsSync(ENV_FILE)) {
  process.loadEnvFile(ENV_FILE);
}

const REQUIRED = 'is required: copy .env.example to .env and set it, or export it';

const EnvSchema = z.object({
  BASE_URL: z.url().default('https://www.saucedemo.com'),
  SAUCE_PASSWORD: z.string({ error: REQUIRED }).min(1, { error: REQUIRED }),
  EXPOSE_KNOWN_BUGS: z.stringbool().default(false),
  BROWSER_CHANNEL: z.enum(['chrome', 'msedge']).optional(),
  RECORD_VIDEO: z.stringbool().default(true),
  CI: z.stringbool().default(false),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
}

export const env = Object.freeze({
  baseUrl: parsed.data.BASE_URL,
  saucePassword: parsed.data.SAUCE_PASSWORD,
  /** When true, `knownBug()` markers are disabled so known defects fail for real. */
  exposeKnownBugs: parsed.data.EXPOSE_KNOWN_BUGS,
  /** Installed browser for the chromium project instead of Playwright's bundled Chromium. */
  browserChannel: parsed.data.BROWSER_CHANNEL,
  /** Video needs Playwright's ffmpeg build, which is unavailable on some platforms (macOS 12). */
  recordVideo: parsed.data.RECORD_VIDEO,
  isCI: parsed.data.CI,
});

export type Env = typeof env;
