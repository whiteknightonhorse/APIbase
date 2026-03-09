import Redis from 'ioredis';
import cron from 'node-cron';
import { config } from '../config';
import { logger } from '../config/logger';
import { createHealthServer, updateHeartbeatTimestamp } from './health';
import { run as runReconciliation } from '../jobs/reconciliation.job';

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

logger.info('Worker started — heartbeat + reconciliation cron active');

// ---------------------------------------------------------------------------
// Graceful shutdown (§12.230 — 60s stop_grace_period)
// ---------------------------------------------------------------------------

function shutdown(signal: string): void {
  logger.info({ signal }, 'Worker shutdown signal received');

  reconciliationTask.stop();

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
