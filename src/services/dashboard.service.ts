import { getPrisma } from './prisma.service';
import { ensureRedisConnected } from './redis.service';
import providerLimitsConfig from '../config/provider-limits.json';

/**
 * Dashboard data aggregation service.
 *
 * Assembles provider status from:
 *   - Redis: provider:health:{name} and provider:limits:{name} (written by worker cron)
 *   - PG: execution_ledger aggregate (calls_24h, avg_latency) + tools GROUP BY provider
 *
 * Cached in Redis for 60s to avoid repeated PG queries.
 */

const DASHBOARD_CACHE_KEY = 'dashboard:data';
const DASHBOARD_CACHE_TTL = 60;

interface ProviderHealth {
  status: 'green' | 'orange' | 'red' | 'unknown';
  latency_ms: number | null;
  last_check: string | null;
}

interface ProviderLimits {
  type: string;
  free_limit: number;
  used: number;
  remaining: number;
  pct_remaining: number;
  status: 'green' | 'orange' | 'yellow' | 'red' | 'paid';
}

interface ProviderDashboardEntry {
  provider: string;
  display_name: string;
  health: ProviderHealth;
  limits: ProviderLimits;
  calls_24h: number;
  avg_latency_ms: number | null;
  tool_count: number;
}

interface DashboardResponse {
  generated_at: string;
  providers: ProviderDashboardEntry[];
  totals: {
    providers: number;
    tools: number;
    calls_24h: number;
  };
}

const limitsConfig = providerLimitsConfig as Record<string, {
  display_name: string;
  health_url: string;
  limit_type: string;
  free_limit: number;
  reset_period: string;
  paid_balance?: boolean;
  balance_api?: boolean;
  docs_url?: string;
  limit_proof?: string;
}>;

export async function getDashboardData(): Promise<DashboardResponse> {
  try {
    const redis = await ensureRedisConnected();
    const cached = await redis.get(DASHBOARD_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached) as DashboardResponse;
    }
  } catch {
    // Redis unavailable — fall through to PG query
  }

  const prisma = getPrisma();

  // Single aggregate query: tools per provider + 24h call stats
  const providerStats: Array<{
    provider: string;
    tool_count: bigint;
    calls_24h: bigint;
    avg_latency_ms: number | null;
  }> = await prisma.$queryRawUnsafe(`
    SELECT
      t.provider,
      COUNT(DISTINCT t.tool_id) AS tool_count,
      COUNT(el.execution_id) AS calls_24h,
      ROUND(AVG(el.latency_ms))::integer AS avg_latency_ms
    FROM tools t
    LEFT JOIN execution_ledger el
      ON el.tool_id = t.tool_id
      AND el.created_at >= NOW() - INTERVAL '24 hours'
      AND el.status IN ('success', 'shared_success', 'provider_success')
    WHERE t.status != 'unavailable'
    GROUP BY t.provider
    ORDER BY t.provider
  `);

  // Read health and limits from Redis
  let redis: Awaited<ReturnType<typeof ensureRedisConnected>> | null = null;
  try {
    redis = await ensureRedisConnected();
  } catch {
    // Redis unavailable
  }

  const providers: ProviderDashboardEntry[] = [];
  let totalTools = 0;
  let totalCalls = 0;

  for (const row of providerStats) {
    const providerName = row.provider;
    const cfg = limitsConfig[providerName];
    const displayName = cfg?.display_name || providerName;
    const toolCount = Number(row.tool_count);
    const calls24h = Number(row.calls_24h);
    const avgLatency = row.avg_latency_ms;

    totalTools += toolCount;
    totalCalls += calls24h;

    // Read health from Redis
    let health: ProviderHealth = { status: 'unknown', latency_ms: null, last_check: null };
    if (redis) {
      try {
        const healthData = await redis.hgetall(`provider:health:${providerName}`);
        if (healthData && healthData.status) {
          health = {
            status: healthData.status as ProviderHealth['status'],
            latency_ms: healthData.latency_ms ? parseInt(healthData.latency_ms, 10) : null,
            last_check: healthData.last_check || null,
          };
        }
      } catch {
        // skip
      }
    }

    // Read limits from Redis or compute from config
    let limits: ProviderLimits;
    if (redis) {
      try {
        const limitsData = await redis.hgetall(`provider:limits:${providerName}`);
        if (limitsData && limitsData.type) {
          limits = {
            type: limitsData.type,
            free_limit: parseInt(limitsData.free_limit || '0', 10),
            used: parseInt(limitsData.used || '0', 10),
            remaining: parseInt(limitsData.remaining || '0', 10),
            pct_remaining: parseInt(limitsData.pct_remaining || '100', 10),
            status: limitsData.limit_status as ProviderLimits['status'] || 'green',
          };
        } else {
          limits = buildDefaultLimits(providerName, calls24h);
        }
      } catch {
        limits = buildDefaultLimits(providerName, calls24h);
      }
    } else {
      limits = buildDefaultLimits(providerName, calls24h);
    }

    providers.push({
      provider: providerName,
      display_name: displayName,
      health,
      limits,
      calls_24h: calls24h,
      avg_latency_ms: avgLatency,
      tool_count: toolCount,
    });
  }

  const response: DashboardResponse = {
    generated_at: new Date().toISOString(),
    providers,
    totals: {
      providers: providers.length,
      tools: totalTools,
      calls_24h: totalCalls,
    },
  };

  // Cache in Redis
  try {
    if (redis) {
      await redis.set(DASHBOARD_CACHE_KEY, JSON.stringify(response), 'EX', DASHBOARD_CACHE_TTL);
    }
  } catch {
    // non-fatal
  }

  return response;
}

function buildDefaultLimits(providerName: string, used: number): ProviderLimits {
  const cfg = limitsConfig[providerName];
  if (!cfg || cfg.limit_type === 'unlimited') {
    return {
      type: 'unlimited',
      free_limit: 0,
      used,
      remaining: 0,
      pct_remaining: 100,
      status: 'green',
    };
  }

  // Paid providers with no free tier
  if (cfg.paid_balance && cfg.free_limit === 0) {
    return {
      type: cfg.limit_type,
      free_limit: 0,
      used,
      remaining: 0,
      pct_remaining: 0,
      status: 'paid',
    };
  }

  const freeLimit = cfg.free_limit;
  const remaining = Math.max(0, freeLimit - used);
  const pctRemaining = freeLimit > 0 ? Math.round((remaining / freeLimit) * 100) : 100;

  return {
    type: cfg.limit_type,
    free_limit: freeLimit,
    used,
    remaining,
    pct_remaining: pctRemaining,
    status: computeLimitStatus(pctRemaining),
  };
}

function computeLimitStatus(pctRemaining: number): ProviderLimits['status'] {
  if (pctRemaining <= 0) return 'red';
  if (pctRemaining < 25) return 'yellow';
  if (pctRemaining < 50) return 'orange';
  return 'green';
}
