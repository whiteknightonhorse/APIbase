import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { config } from '../config';
import { logger } from '../config/logger';
import { deliverDue, DELIVERY_CONCURRENCY } from '../shop/webhook/delivery.service';
import type { ShopDeps } from '../shop/merchant-lifecycle.service';
import type { ShopTx } from '../shop/db';
import { createHealthServer, recordProcessed, updateLag } from './health';
import {
  HANDLED_EVENT_TYPES,
  LAG_SQL,
  SELECT_SQL,
  processBatch,
  type OutboxEvent,
  type ProcessorDeps,
} from './processor';

/**
 * Outbox-worker process entry point (§12.176, §12.153).
 *
 * Transactional outbox pattern:
 *   PG outbox table → poll every 1s → process events → Redis cache invalidation.
 *
 * Ownership rule (T-0259): this worker owns ONLY HANDLED_EVENT_TYPES
 * (src/outbox/processor.ts) — cache_invalidate, TOOL_CONFIG_UPDATED,
 * form_submission. It selects only those rows and marks `processed = true`
 * only after a handler ran. Money events belong to scripts/*.py with two
 * different meanings of `processed`:
 *   - x402_settle_failed: processed=true = "paged" (x402-settle-leak-alerts.py)
 *   - mpp_refund_owed:    processed=false = "refund still owed", closed only by
 *     a human via mpp-refund-resolve.py (operator decision 2026-09-01, see
 *     src/pipeline/stages/escrow-finalize.stage.ts:17-36)
 * Expected side effect: while a refund is open, partition-cleanup logs
 * `Skipping partition with unprocessed events` daily — normal, not an incident.
 *
 * T-INT-14: the same process also delivers merchant webhooks (src/shop/webhook): shop.* events become
 * shop_webhook_deliveries rows in processEvent, `deliverLoop` below sends them (concurrency 16, no BullMQ).
 *
 * Invariant: outbox-worker failure does NOT affect API or Worker.
 * Events eventually delivered. Worker = stateless event processor.
 */

const OUTBOX_PORT = 3002;
const POLL_INTERVAL_MS = 1_000;
const BATCH_SIZE = 100;

// ---------------------------------------------------------------------------
// Prisma + Redis
// ---------------------------------------------------------------------------

let prisma: PrismaClient | null = null;
let redis: Redis | null = null;

function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      connectTimeout: 1000,
    });
    redis.on('error', (err) => {
      logger.warn({ err }, 'Outbox Redis background error');
    });
  }
  return redis;
}

// ---------------------------------------------------------------------------
// Poll loop
// ---------------------------------------------------------------------------

let running = true;
let pollTimer: ReturnType<typeof setTimeout> | null = null;

async function pollOnce(): Promise<void> {
  const db = getPrisma();
  const deps: ProcessorDeps = {
    queryRaw: (sql, ...params) => db.$queryRawUnsafe(sql, ...params),
    executeRaw: (sql, ...params) => db.$executeRawUnsafe(sql, ...params),
    redis: getRedis,
    log: logger,
  };
  const owned = [...HANDLED_EVENT_TYPES];

  try {
    // Fetch unprocessed events of the types this worker owns
    const events = (await deps.queryRaw(SELECT_SQL, BATCH_SIZE, owned)) as OutboxEvent[];

    if (events.length > 0) {
      recordProcessed(await processBatch(events, deps));
    }

    // Compute lag and backlog for health endpoint (owned types only)
    const lagResult = (await deps.queryRaw(LAG_SQL, owned)) as Array<{
      lag_ms: number;
      backlog_size: bigint;
    }>;

    if (lagResult[0]) {
      updateLag(Math.round(lagResult[0].lag_ms), Number(lagResult[0].backlog_size));
    }
  } catch (err) {
    logger.error({ err }, 'Outbox poll error');
  }
}

async function pollLoop(): Promise<void> {
  while (running) {
    await pollOnce();
    if (running) {
      await new Promise<void>((resolve) => {
        pollTimer = setTimeout(resolve, POLL_INTERVAL_MS);
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Webhook delivery loop (F-6): batches of DELIVERY_CONCURRENCY (16) POSTs
// ---------------------------------------------------------------------------

async function deliverLoop(): Promise<void> {
  const db = getPrisma();
  const deps: ShopDeps = {
    db: db as unknown as ShopTx,
    transaction: (fn) => db.$transaction((tx) => fn(tx as unknown as ShopTx)),
  };
  while (running) {
    let claimed = 0;
    try {
      // up to 16 attempts at once; each is bounded by the 10 s webhook timeout
      claimed = await deliverDue(deps, { limit: DELIVERY_CONCURRENCY });
    } catch (err) {
      logger.error({ err }, 'Webhook delivery loop error');
    }
    if (running && claimed === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const healthServer = createHealthServer(OUTBOX_PORT);

pollLoop().catch((err) => {
  logger.error({ err }, 'Outbox poll loop crashed');
  process.exit(1);
});

deliverLoop().catch((err) => {
  logger.error({ err }, 'Webhook delivery loop crashed');
  process.exit(1);
});

logger.info('Outbox worker started — polling every 1s');

// ---------------------------------------------------------------------------
// Graceful shutdown (§12.230 — 30s stop_grace_period)
// ---------------------------------------------------------------------------

function shutdown(signal: string): void {
  logger.info({ signal }, 'Outbox worker shutdown signal received');

  running = false;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }

  healthServer.close(() => {
    if (redis) {
      redis.disconnect();
      redis = null;
    }
    if (prisma) {
      prisma
        .$disconnect()
        .catch(() => {})
        .finally(() => {
          logger.info('Outbox worker shutdown complete');
          process.exit(0);
        });
    } else {
      process.exit(0);
    }
  });

  // Force exit after 28s (stop_grace_period is 30s, leave 2s buffer)
  setTimeout(() => {
    logger.warn('Outbox worker graceful shutdown timeout — force exit');
    process.exit(1);
  }, 28_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
