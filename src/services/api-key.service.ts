import { randomBytes, createHmac } from 'node:crypto';

/**
 * API Key Service (§12.60, §9.3).
 *
 * Key format: ak_live_<32 hex chars> (e.g. ak_live_b7c41d9a6e12f4a9d83c61e0ab5c93fd)
 * Storage:    SHA-256(full_key) stored in agents.api_key_hash (CHAR(64))
 * Plaintext:  returned to agent exactly once at creation, never stored
 */

const LIVE_PREFIX = 'ak_live_';
const TEST_PREFIX = 'ak_test_';
const KEY_BYTES = 16; // 16 bytes = 32 hex chars

/** Generate a new live API key with cryptographic randomness. */
export function generateApiKey(): string {
  return LIVE_PREFIX + randomBytes(KEY_BYTES).toString('hex');
}

/** Generate a test API key. */
export function generateTestApiKey(): string {
  return TEST_PREFIX + randomBytes(KEY_BYTES).toString('hex');
}

/**
 * Hash an API key with HMAC-SHA256 for storage (CWE-916).
 * Uses server-side secret to prevent rainbow table attacks.
 * Returns 64-char hex string.
 */
export function hashApiKey(key: string): string {
  const secret = process.env.API_KEY_HMAC_SECRET || 'apibase-key-hmac-v1';
  return createHmac('sha256', secret).update(key).digest('hex');
}

/** Validate API key format (prefix + 32 hex chars). */
export function isValidApiKeyFormat(key: string): boolean {
  if (key.length !== 40) return false;
  if (!key.startsWith(LIVE_PREFIX) && !key.startsWith(TEST_PREFIX)) return false;
  const hexPart = key.slice(8);
  return /^[0-9a-f]{32}$/.test(hexPart);
}

/**
 * Extract the prefix from an API key for safe logging (§12.92).
 * Returns first 12 chars + **** + last 4 chars.
 */
export function maskApiKeyForLog(key: string): string {
  if (key.length <= 16) return '****';
  return key.slice(0, 12) + '****' + key.slice(-4);
}
