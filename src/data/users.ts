/** SauceDemo demo accounts. All share one password, provided by `env.saucePassword`. */
export interface User {
  readonly username: string;
}

export const USERS = {
  standard: { username: 'standard_user' },
  lockedOut: { username: 'locked_out_user' },
  problem: { username: 'problem_user' },
  performanceGlitch: { username: 'performance_glitch_user' },
  error: { username: 'error_user' },
  visual: { username: 'visual_user' },
} as const satisfies Record<string, User>;

export type UserKey = keyof typeof USERS;

/** Users that can log in, so each gets a saved session (storageState) from the setup project. */
export const PERSONAS = [
  'standard',
  'problem',
  'performanceGlitch',
  'error',
  'visual',
] as const satisfies readonly UserKey[];

export type Persona = (typeof PERSONAS)[number];
