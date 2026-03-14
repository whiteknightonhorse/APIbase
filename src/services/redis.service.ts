import Redis from 'ioredis';
import { config } from '../config';
import { logger } from '../config/logger';

/**
 * Shared Redis singleton for the API process (§12.186).
 *
 * ioredis multiplexes commands over a single TCP connection — one instance
 * is sufficient and preferred over per-service instances.
 *
 * health.service.ts keeps its own instance (200ms connectTimeout for
 * health-check budget). worker/ and outbox/ are separate containers.
 */

let redis: Redis | null = null;

/**
 * Return the shared Redis instance, creating it lazily on first call.
 * Config matches the previous per-service instances.
 */
export function getSharedRedis(): Redis {
  if (!redis) {
    redis = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      connectTimeout: 1000,
    });
    redis.on('error', (err) => {
      logger.warn({ err }, 'Shared Redis background error');
    });
  }
  return redis;
}

/**
 * Ensure the shared Redis instance is connected.
 * Returns the connected instance.
 */
export async function ensureRedisConnected(): Promise<Redis> {
  const r = getSharedRedis();
  if (r.status === 'wait') {
    await r.connect();
  }
  return r;
}

/**
 * Graceful shutdown — disconnect the shared Redis instance.
 * Called once during API process shutdown (§12.230).
 */
export async function shutdownRedis(): Promise<void> {
  if (redis) {
    redis.disconnect();
    redis = null;
  }
}
