import path from 'node:path';
import type { Persona } from '@data/users';

const AUTH_DIR = path.resolve(__dirname, '../../.auth');

/** Saved session (cookies + localStorage) for a persona, written by the setup project. */
export function authStatePath(persona: Persona): string {
  return path.join(AUTH_DIR, `${persona}.json`);
}
