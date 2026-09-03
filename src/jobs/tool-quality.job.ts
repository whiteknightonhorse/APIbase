import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { logger } from '../config/logger';
import { recordProbeResult } from './provider-health.job';
import {
  PASSIVE_MIN_SUCCESS_CALLS,
  PASSIVE_WINDOW_HOURS,
  PASSIVE_ERROR_RATE_WINDOW_HOURS,
  PASSIVE_ERROR_RATE_MIN_CALLS,
  PASSIVE_ERROR_RATE_THRESHOLD,
} from '../config/autopilot';

/**
 * Tool Quality Index Job (F5).
 *
 * Runs every 10 min via worker cron.
 * Reads execution_ledger (last 24h), computes per-tool metrics,
 * writes to Redis tool:quality:{toolId} with 15-min TTL.
 *
 * Metrics: uptime_pct, p50_ms, p95_ms, error_rate, total_calls, success_calls.
 *
 * AP-3 (2026-09-03, G1 "passive first" + F1's traffic-derived DEGRADED
 * trigger): also aggregates by PROVIDER over two trailing windows and feeds
 * both directions into the same provider_status state machine the active
 * probe job uses (recordProbeResult, shared — one place decides what a
 * probe result means):
 *   - ≥10 successes in 6h -> passive OK (a provider real traffic already
 *     vouches for doesn't need an active probe spent on it).
 *   - error_rate ≥25% over ≥20 calls in 1h -> passive FAIL_TRANSIENT (F1:
 *     "реальный трафик первичен" — don't wait for an active probe to notice
 *     what real traffic already shows).
 */

const QUALITY_TTL_SECONDS = 900; // 15 min
const QUALITY_KEY_PREFIX = 'tool:quality:';

let prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

interface ToolMetricsRow {
  tool_id: string;
  total: bigint;
  ok: bigint;
  p50: number | null;
  p95: number | null;
}

interface ProviderPassiveRow {
  provider: string;
  successes: bigint;
  p95: number | null;
}

interface ProviderErrorRateRow {
  provider: string;
  total: bigint;
  failed: bigint;
}

/**
 * G1: a provider with real, recent successful traffic has already proven
 * itself up — spending an active probe on it too is pure waste. Every
 * qualifying provider gets exactly one passive OK fed through the same
 * state machine an active probe uses (recordProbeResult), which pushes its
 * next_probe_at out on its own — no separate "skip the active probe" branch
 * needed here.
 *
 * Returns the set of providers that got a passive OK this tick, so
 * applyPassiveDegradation (below) can leave them alone — the OK signal wins
 * within a single tick rather than the two racing to overwrite the same row.
 */
async function applyPassiveStep(db: PrismaClient, redis: Redis): Promise<Set<string>> {
  const rows: ProviderPassiveRow[] = await db.$queryRawUnsafe(`
    SELECT
      t.provider AS provider,
      COUNT(*) AS successes,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY el.provider_latency_ms)
        FILTER (WHERE el.provider_latency_ms IS NOT NULL) AS p95
    FROM execution_ledger el
    JOIN tools t ON t.tool_id = el.tool_id
    WHERE el.created_at >= NOW() - INTERVAL '${PASSIVE_WINDOW_HOURS} hours'
      AND el.provider_called = true
      AND el.status IN ('success', 'shared_success', 'provider_success')
    GROUP BY t.provider
    HAVING COUNT(*) >= ${PASSIVE_MIN_SUCCESS_CALLS}
  `);

  const confirmedOk = new Set<string>();
  for (const row of rows) {
    try {
      await recordProbeResult(db, redis, row.provider, 'passive', 'OK', {
        latencyMs: row.p95 !== null ? Math.round(row.p95) : undefined,
        detail: `${Number(row.successes)} successful calls in ${PASSIVE_WINDOW_HOURS}h`,
      });
      confirmedOk.add(row.provider);
    } catch (err) {
      logger.error(
        { err, provider: row.provider, job: 'tool-quality' },
        'Passive probe record failed',
      );
    }
  }

  if (rows.length > 0) {
    logger.info(
      { job: 'tool-quality', providers_passive_ok: rows.length },
      'Passive traffic confirmed provider health — active probe skipped for these',
    );
  }

  return confirmedOk;
}

/**
 * F1's other HEALTHY→DEGRADED trigger: "error_rate ≥25% за 1ч при ≥20
 * реальных вызовах" — real traffic is primary, so this doesn't wait for an
 * active probe to notice. Fed through the SAME state machine as a
 * FAIL_TRANSIENT (counts toward consecutive_failures, escalates exactly like
 * a bad active probe would). Skips any provider already given a passive OK
 * this same tick (see applyPassiveStep) so the two signals don't fight over
 * one row within a single pass — a persisting problem still surfaces on the
 * next tick once the 6h success count no longer clears the OK threshold.
 */
async function applyPassiveDegradation(
  db: PrismaClient,
  redis: Redis,
  skipProviders: Set<string>,
): Promise<void> {
  const rows: ProviderErrorRateRow[] = await db.$queryRawUnsafe(`
    SELECT
      t.provider AS provider,
      COUNT(*) AS total,
      COUNT(*) FILTER (
        WHERE el.status NOT IN ('success', 'shared_success', 'provider_success')
      ) AS failed
    FROM execution_ledger el
    JOIN tools t ON t.tool_id = el.tool_id
    WHERE el.created_at >= NOW() - INTERVAL '${PASSIVE_ERROR_RATE_WINDOW_HOURS} hour'
      AND el.provider_called = true
    GROUP BY t.provider
    HAVING COUNT(*) >= ${PASSIVE_ERROR_RATE_MIN_CALLS}
  `);

  for (const row of rows) {
    if (skipProviders.has(row.provider)) continue;
    const total = Number(row.total);
    const failed = Number(row.failed);
    const errorRate = total > 0 ? failed / total : 0;
    if (errorRate < PASSIVE_ERROR_RATE_THRESHOLD) continue;

    try {
      await recordProbeResult(db, redis, row.provider, 'passive', 'FAIL_TRANSIENT', {
        detail: `error_rate ${Math.round(errorRate * 100)}% over ${total} calls (${PASSIVE_ERROR_RATE_WINDOW_HOURS}h)`,
      });
    } catch (err) {
      logger.error(
        { err, provider: row.provider, job: 'tool-quality' },
        'Passive degradation record failed',
      );
    }
  }
}

export async function run(redis: Redis): Promise<void> {
  const db = getPrisma();

  const confirmedOk = await applyPassiveStep(db, redis);
  await applyPassiveDegradation(db, redis, confirmedOk);

  const rows: ToolMetricsRow[] = await db.$queryRawUnsafe(`
    SELECT
      tool_id,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status IN ('success', 'shared_success', 'provider_success')) AS ok,
      PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY provider_latency_ms)
        FILTER (WHERE provider_latency_ms IS NOT NULL) AS p50,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY provider_latency_ms)
        FILTER (WHERE provider_latency_ms IS NOT NULL) AS p95
    FROM execution_ledger
    WHERE created_at >= NOW() - INTERVAL '24 hours'
      AND provider_called = true
    GROUP BY tool_id
  `);

  if (rows.length === 0) {
    logger.info({ job: 'tool-quality' }, 'No execution data in last 24h — skipping');
    return;
  }

  const now = new Date().toISOString();
  const pipeline = redis.pipeline();

  for (const row of rows) {
    const total = Number(row.total);
    const ok = Number(row.ok);
    const uptimePct = total > 0 ? Math.round((ok / total) * 10000) / 100 : 0;
    const errorRate = total > 0 ? Math.round(((total - ok) / total) * 10000) / 100 : 0;

    const quality = {
      tool_id: row.tool_id,
      uptime_pct: uptimePct,
      p50_ms: row.p50 !== null ? Math.round(row.p50) : null,
      p95_ms: row.p95 !== null ? Math.round(row.p95) : null,
      error_rate: errorRate,
      total_calls: total,
      success_calls: ok,
      last_updated: now,
    };

    const key = `${QUALITY_KEY_PREFIX}${row.tool_id}`;
    pipeline.set(key, JSON.stringify(quality), 'EX', QUALITY_TTL_SECONDS);
  }

  await pipeline.exec();

  logger.info(
    {
      job: 'tool-quality',
      tools_updated: rows.length,
    },
    'Tool quality index updated',
  );
}
