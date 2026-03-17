import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { logger } from '../config/logger';
import providerLimitsConfig from '../config/provider-limits.json';

/**
 * Provider Health Check Job.
 *
 * Round-robin: checks 1 provider per run (every 2 min).
 * Full rotation: ~33 providers x 2 min = ~66 min.
 *
 * For each provider:
 *   1. HEAD request to health_url (5s timeout)
 *   2. Write Redis provider:health:{name} (2h TTL)
 *   3. Count usage from execution_ledger
 *   4. Write Redis provider:limits:{name} (2h TTL)
 */

const HEALTH_CHECK_TIMEOUT_MS = 5000;
const REDIS_HEALTH_TTL = 7200; // 2 hours
const REDIS_LIMITS_TTL = 7200;

const limitsConfig = providerLimitsConfig as Record<string, {
  display_name: string;
  health_url: string;
  limit_type: string;
  free_limit: number;
  reset_period: string;
  paid_balance?: boolean;
  balance_api?: boolean;
}>;

// Sorted provider list for round-robin
const providerNames = Object.keys(limitsConfig).sort();
let currentIndex = 0;

let prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

export async function run(redis: Redis): Promise<void> {
  if (providerNames.length === 0) return;

  const providerName = providerNames[currentIndex % providerNames.length];
  currentIndex++;

  const cfg = limitsConfig[providerName];
  if (!cfg) return;

  // 1. Health check
  const healthResult = await checkHealth(cfg.health_url, providerName);

  // Write health to Redis
  await redis.hmset(`provider:health:${providerName}`, {
    status: healthResult.status,
    latency_ms: String(healthResult.latencyMs),
    last_check: new Date().toISOString(),
  });
  await redis.expire(`provider:health:${providerName}`, REDIS_HEALTH_TTL);

  // 2. Count usage + compute limits
  const db = getPrisma();

  // Determine period for usage counting
  let interval = '24 hours';
  if (cfg.reset_period === 'hourly') interval = '1 hour';
  else if (cfg.reset_period === 'monthly') interval = '30 days';
  else if (cfg.reset_period === 'daily') interval = '24 hours';

  const usageRows: Array<{ count: bigint }> = await db.$queryRawUnsafe(`
    SELECT COUNT(*) AS count
    FROM execution_ledger el
    WHERE el.tool_id IN (SELECT tool_id FROM tools WHERE provider = $1)
      AND el.created_at >= NOW() - INTERVAL '${interval}'
      AND el.status IN ('success', 'shared_success', 'provider_success')
  `, providerName);

  const used = Number(usageRows[0]?.count || 0);
  const freeLimit = cfg.free_limit;
  const isUnlimited = cfg.limit_type === 'unlimited';
  const remaining = isUnlimited ? 0 : Math.max(0, freeLimit - used);
  const pctRemaining = isUnlimited ? 100 : (freeLimit > 0 ? Math.round((remaining / freeLimit) * 100) : 100);

  let limitStatus: string;
  if (isUnlimited) limitStatus = 'green';
  else if (pctRemaining <= 0) limitStatus = 'red';
  else if (pctRemaining < 25) limitStatus = 'yellow';
  else if (pctRemaining < 50) limitStatus = 'orange';
  else limitStatus = 'green';

  // Special handling: ZeroBounce has a credits API
  if (cfg.balance_api && providerName === 'zerobounce') {
    try {
      const zbCredits = await fetchZeroBounceCredits(redis);
      if (zbCredits !== null) {
        const zbPct = freeLimit > 0 ? Math.round((zbCredits / freeLimit) * 100) : 100;
        await redis.hmset(`provider:limits:${providerName}`, {
          type: cfg.limit_type,
          free_limit: String(freeLimit),
          used: String(freeLimit - zbCredits),
          remaining: String(zbCredits),
          pct_remaining: String(zbPct),
          limit_status: zbPct <= 0 ? 'red' : zbPct < 25 ? 'yellow' : zbPct < 50 ? 'orange' : 'green',
        });
        await redis.expire(`provider:limits:${providerName}`, REDIS_LIMITS_TTL);

        logger.info({
          job: 'provider-health',
          provider: providerName,
          health: healthResult.status,
          latency_ms: healthResult.latencyMs,
          credits_remaining: zbCredits,
        }, 'Provider health check completed');
        return;
      }
    } catch {
      // Fall through to ledger-based counting
    }
  }

  await redis.hmset(`provider:limits:${providerName}`, {
    type: cfg.limit_type,
    free_limit: String(freeLimit),
    used: String(used),
    remaining: String(remaining),
    pct_remaining: String(pctRemaining),
    limit_status: limitStatus,
  });
  await redis.expire(`provider:limits:${providerName}`, REDIS_LIMITS_TTL);

  logger.info({
    job: 'provider-health',
    provider: providerName,
    health: healthResult.status,
    latency_ms: healthResult.latencyMs,
    used,
    limit_status: limitStatus,
  }, 'Provider health check completed');
}

async function checkHealth(
  url: string,
  providerName: string,
): Promise<{ status: 'green' | 'orange' | 'red'; latencyMs: number }> {
  const start = performance.now();
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
      headers: { 'User-Agent': 'APIbase-HealthCheck/1.0' },
    });
    const latencyMs = Math.round(performance.now() - start);

    // 2xx or auth errors (401/403) = provider is UP
    if (response.status < 400 || response.status === 401 || response.status === 403) {
      return { status: latencyMs <= 2000 ? 'green' : 'orange', latencyMs };
    }
    // 405 = HEAD not supported, but service is alive
    if (response.status === 405) {
      return { status: 'orange', latencyMs };
    }
    // 5xx = provider down
    if (response.status >= 500) {
      return { status: 'red', latencyMs };
    }
    // Other 4xx = reachable but issues
    return { status: 'orange', latencyMs };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    logger.warn({ provider: providerName, err, latency_ms: latencyMs }, 'Health check failed');
    return { status: 'red', latencyMs };
  }
}

async function fetchZeroBounceCredits(_redis: Redis): Promise<number | null> {
  // Read ZeroBounce API key from environment
  const apiKey = process.env.PROVIDER_KEY_ZEROBOUNCE;
  if (!apiKey) return null;

  try {
    const response = await fetch(
      `https://api.zerobounce.net/v2/getcredits?api_key=${encodeURIComponent(apiKey)}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok) return null;
    const data = await response.json() as { Credits: string };
    const credits = parseInt(data.Credits, 10);
    return isNaN(credits) ? null : credits;
  } catch {
    return null;
  }
}
