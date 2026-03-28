import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { logger } from '../config/logger';

/**
 * Tool Quality Index Job (F5).
 *
 * Runs every 10 min via worker cron.
 * Reads execution_ledger (last 24h), computes per-tool metrics,
 * writes to Redis tool:quality:{toolId} with 15-min TTL.
 *
 * Metrics: uptime_pct, p50_ms, p95_ms, error_rate, total_calls, success_calls.
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

export async function run(redis: Redis): Promise<void> {
  const db = getPrisma();

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

  logger.info({
    job: 'tool-quality',
    tools_updated: rows.length,
  }, 'Tool quality index updated');
}
