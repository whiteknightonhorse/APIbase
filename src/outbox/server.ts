import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { config } from '../config';
import { logger } from '../config/logger';
import { createHealthServer, recordProcessed, updateLag } from './health';

/**
 * Outbox-worker process entry point (§12.176, §12.153).
 *
 * Transactional outbox pattern:
 *   PG outbox table → poll every 1s → process events → Redis cache invalidation.
 *
 * Event types (Phase 1):
 *   - cache_invalidate / TOOL_CONFIG_UPDATED → delete Redis cache keys for tool
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
// Event processing
// ---------------------------------------------------------------------------

interface OutboxEvent {
  id: bigint;
  created_at: Date;
  event_type: string;
  payload: unknown;
}

async function processEvent(event: OutboxEvent): Promise<void> {
  const payload = event.payload as Record<string, unknown>;
  const eventType = event.event_type;

  if (eventType === 'cache_invalidate' || eventType === 'TOOL_CONFIG_UPDATED') {
    const toolId = (payload.tool_id as string) || '';
    if (toolId) {
      const r = getRedis();
      if (r.status === 'wait') {
        await r.connect();
      }
      // Scan and delete cache keys for this tool
      const pattern = `cache:${toolId}:*`;
      let cursor = '0';
      do {
        const [nextCursor, keys] = await r.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length > 0) {
          await r.del(...keys);
        }
      } while (cursor !== '0');

      logger.info({ eventType, toolId }, 'Cache invalidated for tool');
    }
  } else {
    logger.warn({ eventType, eventId: event.id.toString() }, 'Unknown outbox event type');
  }
}

// ---------------------------------------------------------------------------
// Poll loop
// ---------------------------------------------------------------------------

let running = true;
let pollTimer: ReturnType<typeof setTimeout> | null = null;

async function pollOnce(): Promise<void> {
  const db = getPrisma();

  try {
    // Fetch unprocessed events
    const events: OutboxEvent[] = await db.$queryRawUnsafe(
      `SELECT id, created_at, event_type, payload
       FROM outbox
       WHERE processed = false
       ORDER BY created_at ASC
       LIMIT $1`,
      BATCH_SIZE,
    );

    if (events.length > 0) {
      for (const event of events) {
        try {
          await processEvent(event);
        } catch (err) {
          logger.error(
            { err, eventId: event.id.toString(), eventType: event.event_type },
            'Failed to process outbox event',
          );
          continue;
        }

        // Mark as processed
        await db.$executeRawUnsafe(
          `UPDATE outbox SET processed = true WHERE id = $1 AND created_at = $2`,
          event.id,
          event.created_at,
        );
      }

      recordProcessed(events.length);
    }

    // Compute lag and backlog for health endpoint
    const lagResult: Array<{ lag_ms: number; backlog_size: bigint }> = await db.$queryRawUnsafe(`
      SELECT
        COALESCE(EXTRACT(EPOCH FROM (NOW() - MIN(created_at))) * 1000, 0)::double precision AS lag_ms,
        COUNT(*) AS backlog_size
      FROM outbox
      WHERE processed = false
    `);

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
// Start
// ---------------------------------------------------------------------------

const healthServer = createHealthServer(OUTBOX_PORT);

pollLoop().catch((err) => {
  logger.error({ err }, 'Outbox poll loop crashed');
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
