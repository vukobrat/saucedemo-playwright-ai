import type { APIResponse } from '@playwright/test';
import { z } from 'zod';

/**
 * Validates a response body against a contract and returns it typed. A mismatch fails with the
 * endpoint and a readable list of the offending fields, instead of an `undefined` deep in a test.
 */
export async function parseBody<T extends z.ZodType>(
  response: APIResponse,
  schema: T,
): Promise<z.infer<T>> {
  const body: unknown = await response.json();
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new Error(
      `Response of ${response.url()} (HTTP ${response.status()}) breaks the contract:\n` +
        z.prettifyError(result.error),
    );
  }
  return result.data;
}
