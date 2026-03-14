import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ensureRedisConnected } from './redis.service';

/**
 * Rate Limit Service — dual token bucket (§12.172, §12.152).
 *
 * Dual bucket per request:
 *   1. Per-agent-per-tool: ratelimit:{agent_id}:{tool_id}:bucket
 *   2. Per-agent-global:   ratelimit:{agent_id}:global:bucket
 *
 * Atomic Lua script for check + decrement. Lazy initialization.
 */

// ---------------------------------------------------------------------------
// Per-tool defaults (§12.172)
// ---------------------------------------------------------------------------

interface BucketConfig {
  tokensPerSec: number;
  burst: number;
}

const TOOL_DEFAULTS: Record<string, BucketConfig> = {
  'weather.get_current': { tokensPerSec: 10, burst: 50 },
  'crypto.get_price': { tokensPerSec: 5, burst: 25 },
  'polymarket.get_orderbook': { tokensPerSec: 3, burst: 15 },
  'aviasales.search_flights': { tokensPerSec: 2, burst: 10 },
};

const DEFAULT_TOOL_BUCKET: BucketConfig = { tokensPerSec: 10, burst: 50 };

// ---------------------------------------------------------------------------
// Global safety cap per tier (§12.175)
// ---------------------------------------------------------------------------

const TIER_GLOBALS: Record<string, BucketConfig> = {
  free: { tokensPerSec: 20, burst: 100 },
  paid: { tokensPerSec: 100, burst: 500 },
  enterprise: { tokensPerSec: 500, burst: 2000 },
};

// ---------------------------------------------------------------------------
// Lua script (lazy loaded)
// ---------------------------------------------------------------------------

let luaScript: string | null = null;

function getLuaScript(): string {
  if (!luaScript) {
    luaScript = readFileSync(resolve(__dirname, '..', '..', 'lua', 'rate-limit.lua'), 'utf-8');
  }
  return luaScript;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  retryAfterSecs: number;
}

// ---------------------------------------------------------------------------
// Core check
// ---------------------------------------------------------------------------

async function checkBucket(
  key: string,
  bucketConfig: BucketConfig,
): Promise<{ allowed: boolean; remaining: number; limit: number }> {
  const r = await ensureRedisConnected();

  const now = Date.now() / 1000; // fractional seconds
  const result = (await r.eval(
    getLuaScript(),
    1,
    key,
    bucketConfig.burst,
    bucketConfig.tokensPerSec,
    now,
  )) as number[];

  return {
    allowed: result[0] === 1,
    remaining: result[1],
    limit: result[2],
  };
}

/**
 * Check dual-bucket rate limit for a request (§12.172).
 *
 * 1. Check per-tool bucket
 * 2. Check global bucket
 * 3. Both must pass
 *
 * Returns the more restrictive result (lower remaining).
 */
export async function checkRateLimit(
  agentId: string,
  toolId: string,
  tier: string,
): Promise<RateLimitResult> {
  const toolConfig = TOOL_DEFAULTS[toolId] ?? DEFAULT_TOOL_BUCKET;
  const globalConfig = TIER_GLOBALS[tier] ?? TIER_GLOBALS['free'];

  const toolKey = `ratelimit:{${agentId}}:${toolId}:bucket`;
  const globalKey = `ratelimit:{${agentId}}:global:bucket`;

  // Check per-tool bucket first
  const toolResult = await checkBucket(toolKey, toolConfig);
  if (!toolResult.allowed) {
    const retryAfterSecs = Math.ceil(1 / toolConfig.tokensPerSec);
    return {
      allowed: false,
      remaining: 0,
      limit: toolResult.limit,
      retryAfterSecs,
    };
  }

  // Check global bucket
  const globalResult = await checkBucket(globalKey, globalConfig);
  if (!globalResult.allowed) {
    const retryAfterSecs = Math.ceil(1 / globalConfig.tokensPerSec);
    return {
      allowed: false,
      remaining: 0,
      limit: globalResult.limit,
      retryAfterSecs,
    };
  }

  // Both passed — return the more restrictive remaining count
  const remaining = Math.min(toolResult.remaining, globalResult.remaining);
  const limit = Math.min(toolResult.limit, globalResult.limit);

  return {
    allowed: true,
    remaining,
    limit,
    retryAfterSecs: 0,
  };
}

/** No-op — shared Redis singleton shutdown handled by redis.service.ts. */
export async function shutdownRateLimitRedis(): Promise<void> {
  // no-op: shared singleton
}
