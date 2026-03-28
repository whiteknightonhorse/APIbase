import Redis from 'ioredis';
import cron from 'node-cron';
import { config } from '../config';
import { logger } from '../config/logger';
import { createHealthServer, updateHeartbeatTimestamp } from './health';
import { run as runReconciliation } from '../jobs/reconciliation.job';
import { run as runProviderHealth } from '../jobs/provider-health.job';
import { run as runX402Health } from '../jobs/x402-health.job';
import { run as runPartitionCreate } from '../jobs/partition-create.job';
import { run as runToolQuality } from '../jobs/tool-quality.job';

/**
 * Worker process entry point (§12.194, §12.244).
 *
 * Responsibilities:
 *   - Redis heartbeat every 5s (§12.141)
 *   - Escrow reconciliation every 60s (§12.244 job #3)
 *   - Health endpoint: GET /worker/health on port 3001
 *   - Graceful shutdown (60s stop_grace_period)
 */

const WORKER_PORT = 3001;
const HEARTBEAT_INTERVAL_MS = 5_000;
const HEARTBEAT_TTL_SECONDS = 20;

// ---------------------------------------------------------------------------
// Redis heartbeat (§12.141)
// ---------------------------------------------------------------------------

let redis: Redis | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      connectTimeout: 1000,
    });
    redis.on('error', (err) => {
      logger.warn({ err }, 'Worker Redis background error');
    });
  }
  return redis;
}

async function sendHeartbeat(): Promise<void> {
  try {
    const r = getRedis();
    if (r.status === 'wait') {
      await r.connect();
    }
    await r.set('worker:heartbeat', String(Date.now()), 'EX', HEARTBEAT_TTL_SECONDS);
    updateHeartbeatTimestamp();
  } catch (err) {
    logger.warn({ err }, 'Failed to send worker heartbeat');
  }
}

// ---------------------------------------------------------------------------
// Cron jobs (§12.244)
// ---------------------------------------------------------------------------

let reconciliationRunning = false;
let providerHealthRunning = false;

async function runReconciliationSafe(): Promise<void> {
  if (reconciliationRunning) {
    return;
  }
  reconciliationRunning = true;
  try {
    await runReconciliation();
  } catch (err) {
    logger.error({ err }, 'Reconciliation job failed');
  } finally {
    reconciliationRunning = false;
  }
}

async function runProviderHealthSafe(): Promise<void> {
  if (providerHealthRunning) {
    return;
  }
  providerHealthRunning = true;
  try {
    const r = getRedis();
    if (r.status === 'wait') {
      await r.connect();
    }
    await runProviderHealth(r);
  } catch (err) {
    logger.error({ err }, 'Provider health job failed');
  } finally {
    providerHealthRunning = false;
  }
}

let toolQualityRunning = false;

async function runToolQualitySafe(): Promise<void> {
  if (toolQualityRunning) {
    return;
  }
  toolQualityRunning = true;
  try {
    const r = getRedis();
    if (r.status === 'wait') {
      await r.connect();
    }
    await runToolQuality(r);
  } catch (err) {
    logger.error({ err }, 'Tool quality job failed');
  } finally {
    toolQualityRunning = false;
  }
}

let x402HealthRunning = false;

async function runX402HealthSafe(): Promise<void> {
  if (x402HealthRunning) {
    return;
  }
  x402HealthRunning = true;
  try {
    const r = getRedis();
    if (r.status === 'wait') {
      await r.connect();
    }
    await runX402Health(r);
  } catch (err) {
    logger.error({ err }, 'x402 health job failed');
  } finally {
    x402HealthRunning = false;
  }
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const healthServer = createHealthServer(WORKER_PORT);

// Start heartbeat
heartbeatTimer = setInterval(() => {
  sendHeartbeat().catch(() => {});
}, HEARTBEAT_INTERVAL_MS);
sendHeartbeat().catch(() => {});

// Schedule reconciliation every 60s (§12.244 job #3)
const reconciliationTask = cron.schedule('* * * * *', () => {
  runReconciliationSafe().catch(() => {});
});

// Schedule provider health checks every 2 min (round-robin, 1 provider per run)
const providerHealthTask = cron.schedule('*/2 * * * *', () => {
  runProviderHealthSafe().catch(() => {});
});

// Schedule x402 facilitator health check every hour (§12.244)
const x402HealthTask = cron.schedule('0 * * * *', () => {
  runX402HealthSafe().catch(() => {});
});

// Schedule tool quality index every 10 min (F5)
const toolQualityTask = cron.schedule('*/10 * * * *', () => {
  runToolQualitySafe().catch(() => {});
});

// Run tool quality once at startup after 15s delay
setTimeout(() => { runToolQualitySafe().catch(() => {}); }, 15_000);

// Run x402 health once at startup after 10s delay
setTimeout(() => { runX402HealthSafe().catch(() => {}); }, 10_000);

// Schedule partition creation daily at 23:00 UTC (§12.244 job #1)
async function runPartitionCreateSafe(): Promise<void> {
  try { await runPartitionCreate(); }
  catch (err) { logger.error({ err, job: 'partition-create' }, 'Partition creation failed'); }
}
const partitionCreateTask = cron.schedule('0 23 * * *', () => {
  runPartitionCreateSafe().catch(() => {});
});

// Create partitions for next 7 days at startup (catch up after restart/missed crons)
setTimeout(async () => {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const db = new PrismaClient();
    const tables = ['execution_ledger', 'outbox', 'request_metrics'];
    for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + dayOffset);
      d.setUTCHours(0, 0, 0, 0);
      const next = new Date(d);
      next.setUTCDate(next.getUTCDate() + 1);
      const suffix = `${d.getUTCFullYear()}_${String(d.getUTCMonth() + 1).padStart(2, '0')}_${String(d.getUTCDate()).padStart(2, '0')}`;
      const from = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      const to = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
      for (const table of tables) {
        await db.$executeRawUnsafe(
          `CREATE TABLE IF NOT EXISTS "${table}_${suffix}" PARTITION OF "${table}" FOR VALUES FROM ('${from}') TO ('${to}')`,
        ).catch(() => {}); // ignore if already exists
      }
    }
    await db.$disconnect();
    logger.info({ job: 'partition-create', days: 8 }, 'Startup partition catch-up complete (today + 7 days)');
  } catch (err) {
    logger.error({ err, job: 'partition-create' }, 'Startup partition catch-up failed');
  }
}, 5_000);

logger.info('Worker started — heartbeat + reconciliation + provider-health + x402-health + partition-create cron active');

// ---------------------------------------------------------------------------
// Graceful shutdown (§12.230 — 60s stop_grace_period)
// ---------------------------------------------------------------------------

function shutdown(signal: string): void {
  logger.info({ signal }, 'Worker shutdown signal received');

  reconciliationTask.stop();
  providerHealthTask.stop();
  x402HealthTask.stop();
  partitionCreateTask.stop();
  toolQualityTask.stop();

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  healthServer.close(() => {
    if (redis) {
      redis.disconnect();
      redis = null;
    }
    logger.info('Worker shutdown complete');
    process.exit(0);
  });

  // Force exit after 58s (stop_grace_period is 60s, leave 2s buffer)
  setTimeout(() => {
    logger.warn('Worker graceful shutdown timeout — force exit');
    process.exit(1);
  }, 58_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
