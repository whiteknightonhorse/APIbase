import { createHash } from 'node:crypto';
import stringify from 'fast-json-stable-stringify';
import { ensureRedisConnected } from './redis.service';

/**
 * Cache & Single-Flight Service (§12.144, §12.150, §12.127).
 *
 * Redis key: cache:{toolId}:{SHA256(stable-stringify(params))}
 * Lock key:  lock:cache:{toolId}:{hash}
 * No agent_id in cache key — shared across agents.
 * TTL=0 tools use 5s ephemeral buffer for single-flight sharing.
 * Redis failure → fail closed (§12.186).
 */

const LOCK_TTL_SECONDS = 30;
const EPHEMERAL_TTL_SECONDS = 5;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate deterministic cache key (§12.150).
 * cache:{toolId}:{SHA256(fast-json-stable-stringify({toolId, params}))}
 */
export function generateCacheKey(toolId: string, params: unknown): string {
  const payload = stringify({ toolId, params });
  const hash = createHash('sha256').update(payload).digest('hex');
  return `cache:${toolId}:${hash}`;
}

/**
 * Get cached value by key.
 * Returns raw JSON string or null if not found.
 * Throws on Redis error (fail closed §12.186).
 */
export async function getCache(key: string): Promise<string | null> {
  const r = await ensureRedisConnected();
  return r.get(key);
}

/**
 * Store value in cache with tool-specific TTL (§12.127).
 * TTL <= 0 uses 5s ephemeral buffer for single-flight sharing.
 */
export async function setCache(key: string, value: string, ttlSeconds: number): Promise<void> {
  const r = await ensureRedisConnected();
  const effectiveTtl = ttlSeconds > 0 ? ttlSeconds : EPHEMERAL_TTL_SECONDS;
  await r.set(key, value, 'EX', effectiveTtl);
}

/**
 * Acquire single-flight lock (§12.144).
 * Lock key: lock:{cacheKey}, TTL 30s, NX semantics.
 * Returns true if this request is the lock owner.
 */
export async function acquireLock(key: string): Promise<boolean> {
  const r = await ensureRedisConnected();
  const result = await r.set(`lock:${key}`, '1', 'EX', LOCK_TTL_SECONDS, 'NX');
  return result === 'OK';
}

/**
 * Release single-flight lock after cache is set.
 */
export async function releaseLock(key: string): Promise<void> {
  const r = await ensureRedisConnected();
  await r.del(`lock:${key}`);
}

/**
 * Wait for cached result to appear (single-flight waiter §12.144).
 * Polls Redis GET every pollIntervalMs until value appears or timeout.
 * Returns cached value or null on timeout.
 */
export async function waitForResult(
  key: string,
  timeoutMs: number,
  pollIntervalMs: number,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await getCache(key);
    if (value !== null) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  return null;
}

/** No-op — shared Redis singleton shutdown handled by redis.service.ts. */
export async function shutdownCacheRedis(): Promise<void> {
  // no-op: shared singleton
}
