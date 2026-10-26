import { createHash } from 'node:crypto';
import stringify from 'fast-json-stable-stringify';
import { logger } from '../config/logger';
import type { PipelineContext } from '../pipeline/types';
import { TOOL_SCHEMAS_JSON } from '../mcp/tool-fingerprint';
import { VOLATILE_KEYWORD } from '../utils/zod-to-json-schema';

export { VOLATILE_KEYWORD };

/**
 * Cache & Single-Flight Service (§12.144, §12.150, §12.127).
 *
 * Redis key: cache:{toolId}:{SHA256(stable-stringify(params))}
 * Lock key:  lock:cache:{toolId}:{hash}
 * No agent_id in cache key — shared across agents.
 * TTL=0 tools use 5s ephemeral buffer for single-flight sharing.
 * Redis failure → fail closed (§12.186).
 */

// Lazy: importing the helpers (canonicalParams, dedup keys) must not load config/redis.
async function ensureRedisConnected() {
  return (await import('./redis.service')).ensureRedisConnected();
}

const LOCK_TTL_SECONDS = 30;
const EPHEMERAL_TTL_SECONDS = 5;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * T-0526: params minus the top-level properties whose input_schema entry carries
 * `x-apibase-volatile: true`. Same schema source the tool registry serves (TOOL_SCHEMAS_JSON).
 * No annotation → params returned untouched (a missed cache hit is the worst case, never a wrong answer).
 */
export function canonicalParams(
  toolId: string,
  params: unknown,
  schemas: ReadonlyMap<string, Record<string, unknown>> = TOOL_SCHEMAS_JSON,
): unknown {
  if (typeof params !== 'object' || params === null || Array.isArray(params)) return params;
  const props = schemas.get(toolId)?.properties;
  if (typeof props !== 'object' || props === null) return params;
  const volatile = Object.entries(props as Record<string, unknown>)
    .filter(
      ([, v]) =>
        typeof v === 'object' &&
        v !== null &&
        (v as Record<string, unknown>)[VOLATILE_KEYWORD] === true,
    )
    .map(([k]) => k);
  if (volatile.length === 0) return params;
  return Object.fromEntries(
    Object.entries(params as Record<string, unknown>).filter(([k]) => !volatile.includes(k)),
  );
}

/**
 * Generate deterministic cache key (§12.150).
 * cache:{toolId}:{SHA256(fast-json-stable-stringify({toolId, params}))}
 * Volatile-annotated properties are removed first (canonicalParams).
 */
export function generateCacheKey(toolId: string, params: unknown): string {
  const payload = stringify({ toolId, params: canonicalParams(toolId, params) });
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
 * True if the single-flight lock is still held (owner still working).
 * Used by waitForResult() to tell "owner still running" apart from "owner
 * already finished (and failed, since a success would have left a cached
 * value)" without waiting out the full poll timeout for the latter.
 */
export async function isLockHeld(key: string): Promise<boolean> {
  const r = await ensureRedisConnected();
  const exists = await r.exists(`lock:${key}`);
  return exists === 1;
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
    // The owner releases lock:{key} on EVERY completion path, success
    // (after writing the cache value — cache-set.stage.ts) and failure alike
    // (pipeline.ts's error/exception handlers, and cache-set.stage.ts's own
    // provider-failure branch). So by the time we observe the lock gone with
    // still no cached value, the owner has already finished and failed —
    // waiting out the rest of `timeoutMs` here only adds latency for a
    // legitimate concurrent duplicate (e.g. a client's own retry) hitting a
    // failing tool. Stop now; the caller re-attempts as a fresh owner.
    //
    // Narrow benign race: the owner could release the lock in the instant
    // between our getCache() and isLockHeld() checks, just as it finishes
    // successfully. Worst case we still return null here and the caller
    // re-acquires the (now-free) lock and repeats the call once — the same
    // outcome the existing full-timeout path already accepts below.
    if (!(await isLockHeld(key))) {
      return null;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  return null;
}

/** No-op — shared Redis singleton shutdown handled by redis.service.ts. */
export async function shutdownCacheRedis(): Promise<void> {
  // no-op: shared singleton
}

// ---------------------------------------------------------------------------
// x402 dedup window (T-0526)
// ---------------------------------------------------------------------------

/**
 * T-0526: x402 dedup window. A repeated cacheable read by the same VERIFIED payer within
 * DEDUP_WINDOW_SECONDS is answered from cache and not charged.
 *
 * Redis key: dedup:x402:{payer lowercase}:{cacheKey}; value = public receipt id of the charged
 * call, or '-' when none was issued. Set only after a charged x402 call completed (settled or
 * settlement_pending). Redis trouble → no dedup (fail toward charging), logged once.
 * MPP is excluded: mppx settles inside the middleware before the tool runs.
 */
export const DEDUP_WINDOW_SECONDS = 120;
export const NO_RECEIPT = '-';

let redisWarned = false;

function warnOnce(op: string, e: unknown): void {
  if (redisWarned) return;
  redisWarned = true;
  logger.warn(
    { op, err: e instanceof Error ? e.message : String(e) },
    'dedup: Redis unavailable, charging as usual',
  );
}

/** Test hook. */
export function resetDedupWarning(): void {
  redisWarned = false;
}

/** Cacheable tool (TTL > 0). The `shop.` exclusion is an explicit guard at each call site. */
export function isDedupEligible(toolId: string | undefined, cacheTtl: number | undefined): boolean {
  return !!toolId && (cacheTtl ?? 0) > 0;
}

export function dedupKey(payer: string, cacheKey: string): string {
  return `dedup:x402:${payer.toLowerCase()}:${cacheKey}`;
}

/** sha256 prefix for logs; a raw wallet never goes into a log line. */
export function payerTag(payer: string): string {
  return createHash('sha256').update(payer.toLowerCase()).digest('hex').slice(0, 12);
}

/** Receipt id (or '-') of the earlier charged call, or null when there is no live dedup entry. */
export async function readDedup(payer: string, cacheKey: string): Promise<string | null> {
  try {
    const r = await ensureRedisConnected();
    return await r.get(dedupKey(payer, cacheKey));
  } catch (e) {
    warnOnce('read', e);
    return null;
  }
}

export async function writeDedup(
  payer: string,
  cacheKey: string,
  receiptId?: string,
): Promise<void> {
  try {
    const r = await ensureRedisConnected();
    await r.set(dedupKey(payer, cacheKey), receiptId || NO_RECEIPT, 'EX', DEDUP_WINDOW_SECONDS);
  } catch (e) {
    warnOnce('write', e);
  }
}

/**
 * After a charged x402 call on a cacheable non-shop tool: open the window for this payer.
 * Called by the response surfaces once the public receipt id is known (the receipt is planned
 * after the pipeline). Balance and MPP calls never write; a dedup hit never re-arms the window.
 */
export async function recordDedupAfterCharge(
  ctx: PipelineContext,
  receiptId?: string,
): Promise<void> {
  if (!ctx.x402Paid || ctx.dedupHit || ctx.billingStatus !== 'PAID') return;
  if (ctx.x402SettleSucceeded !== true && ctx.x402SettleState !== 'pending') return;
  if (!ctx.cacheKey || !ctx.x402Payer || ctx.x402Payer === 'unknown') return;
  if (ctx.toolId?.startsWith('shop.')) return;
  if (!isDedupEligible(ctx.toolId, ctx.toolCacheTtl)) return;
  await writeDedup(ctx.x402Payer, ctx.cacheKey, receiptId);
}
