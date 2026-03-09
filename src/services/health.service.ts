import { Pool } from 'pg';
import Redis from 'ioredis';
import { config } from '../config';
import { logger } from '../config/logger';

/**
 * Health check service (§12.167, §12.185).
 *
 * - Isolated PG pool (max 1 connection) to prevent cascading failures.
 * - Redis PING with timeout.
 * - Config validation check.
 * - Per-check timeout: 200ms.
 */

const CHECK_TIMEOUT_MS = 200;

// Isolated PG pool for health checks — NOT shared with Prisma (§12.167)
let healthPgPool: Pool | null = null;

function getHealthPgPool(): Pool {
  if (!healthPgPool) {
    healthPgPool = new Pool({
      connectionString: config.DATABASE_URL,
      max: 1,
      idleTimeoutMillis: 30_000,
    });
    healthPgPool.on('error', (err) => {
      logger.warn({ err }, 'Health PG pool background error');
    });
  }
  return healthPgPool;
}

// Lazy Redis instance for health checks
let healthRedis: Redis | null = null;

function getHealthRedis(): Redis {
  if (!healthRedis) {
    healthRedis = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      connectTimeout: CHECK_TIMEOUT_MS,
    });
    healthRedis.on('error', (err) => {
      logger.warn({ err }, 'Health Redis background error');
    });
  }
  return healthRedis;
}

/** Run a promise with a timeout. Rejects if exceeds ms. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Health check timeout')), ms);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e as Error);
      });
  });
}

async function checkPostgres(): Promise<boolean> {
  const pool = getHealthPgPool();
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    return true;
  } finally {
    client.release();
  }
}

async function checkRedis(): Promise<boolean> {
  const redis = getHealthRedis();
  if (redis.status === 'wait') {
    await redis.connect();
  }
  const result = await redis.ping();
  return result === 'PONG';
}

function checkConfig(): boolean {
  return config !== null && config !== undefined;
}

export interface HealthCheckResult {
  status: 'ready' | 'not_ready';
  checks: {
    postgresql: boolean;
    redis: boolean;
    config: boolean;
  };
}

/**
 * Run all readiness checks (§12.167).
 * Per-check timeout: 200ms. Any failure → not_ready.
 */
export async function getReadiness(): Promise<HealthCheckResult> {
  const results = await Promise.allSettled([
    withTimeout(checkPostgres(), CHECK_TIMEOUT_MS),
    withTimeout(checkRedis(), CHECK_TIMEOUT_MS),
    Promise.resolve(checkConfig()),
  ]);

  const checks = {
    postgresql: results[0].status === 'fulfilled' && results[0].value === true,
    redis: results[1].status === 'fulfilled' && results[1].value === true,
    config: results[2].status === 'fulfilled' && results[2].value === true,
  };

  const allOk = checks.postgresql && checks.redis && checks.config;

  return {
    status: allOk ? 'ready' : 'not_ready',
    checks,
  };
}

/** Shut down health check connections. Called during graceful shutdown. */
export async function shutdownHealthConnections(): Promise<void> {
  if (healthRedis) {
    healthRedis.disconnect();
    healthRedis = null;
  }
  if (healthPgPool) {
    await healthPgPool.end();
    healthPgPool = null;
  }
}
