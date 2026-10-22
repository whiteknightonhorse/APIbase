/**
 * Size gate for static/.well-known/openapi-discovery.json (served at /openapi.json).
 * isitagentready.com reads at most 1 MiB of the decoded body; a longer document is cut
 * mid-string and reported as "not valid JSON" (T-0520).
 */
export const DISCOVERY_SIZE_LIMIT = 900_000;
export const DISCOVERY_SIZE_WARN = 800_000;

/** Throws when the discovery doc exceeds the limit; returns a warning string near it. */
export function assertDiscoverySize(bytes: number): string | null {
  if (bytes > DISCOVERY_SIZE_LIMIT) {
    throw new Error(
      `generate-openapi: openapi-discovery.json is ${bytes} bytes, limit ${DISCOVERY_SIZE_LIMIT} (isitagentready reads at most 1 MiB)`,
    );
  }
  if (bytes > DISCOVERY_SIZE_WARN) {
    return `generate-openapi: WARNING openapi-discovery.json is ${bytes} bytes, warn threshold ${DISCOVERY_SIZE_WARN}, limit ${DISCOVERY_SIZE_LIMIT}; open a task for the next size cut`;
  }
  return null;
}
