import Redis from 'ioredis';
import { config } from '../config';
import { logger } from '../config/logger';

/**
 * Idempotency Service (§12.171, §12.182).
 *
 * Redis key: idempotency:{agent_id}:{key}, TTL 600s (10 min).
 * Redis value: { status, execution_id, created_at }.
 * Response payload is NOT stored in Redis — loaded from PG on cache hit.
 */

const IDEMPOTENCY_TTL_SECONDS = 600; // 10 minutes

export type IdempotencyStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

export interface IdempotencyRecord {
  status: IdempotencyStatus;
  execution_id: string;
  created_at: string;
  response_status?: number;
  response_body?: string;
}

export type IdempotencyCheckResult =
  | { action: 'proceed' }
  | { action: 'conflict'; retryAfter: number }
  | { action: 'return_cached'; statusCode: number; body: string };

// ---------------------------------------------------------------------------
// Lazy Redis instance
// ---------------------------------------------------------------------------

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      connectTimeout: 1000,
    });
    redis.on('error', (err) => {
      logger.warn({ err }, 'Idempotency Redis background error');
    });
  }
  return redis;
}

function redisKey(agentId: string, key: string): string {
  return `idempotency:${agentId}:${key}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check idempotency state for a given agent + key (§12.171).
 *
 * Returns:
 *   - proceed: no record, caller should continue pipeline
 *   - conflict: PENDING state, return 409
 *   - return_cached: SUCCESS or FAILED, return stored response
 */
export async function checkIdempotency(
  agentId: string,
  key: string,
): Promise<IdempotencyCheckResult> {
  const r = getRedis();
  if (r.status === 'wait') {
    await r.connect();
  }

  const rk = redisKey(agentId, key);
  const raw = await r.get(rk);

  if (!raw) {
    return { action: 'proceed' };
  }

  const record = JSON.parse(raw) as IdempotencyRecord;

  if (record.status === 'PENDING') {
    return { action: 'conflict', retryAfter: 2 };
  }

  // SUCCESS or FAILED — return cached response
  return {
    action: 'return_cached',
    statusCode: record.response_status ?? (record.status === 'SUCCESS' ? 200 : 500),
    body: record.response_body ?? '{}',
  };
}

/**
 * Set idempotency state to PENDING at pipeline start (§12.171).
 * Called after checkIdempotency returns 'proceed'.
 */
export async function setPending(agentId: string, key: string, executionId: string): Promise<void> {
  const r = getRedis();
  const rk = redisKey(agentId, key);

  const record: IdempotencyRecord = {
    status: 'PENDING',
    execution_id: executionId,
    created_at: new Date().toISOString(),
  };

  await r.set(rk, JSON.stringify(record), 'EX', IDEMPOTENCY_TTL_SECONDS);
}

/**
 * Finalize idempotency record after pipeline completion (§12.171).
 * Called in LEDGER_WRITE stage or error handler.
 */
export async function finalizeIdempotency(
  agentId: string,
  key: string,
  executionId: string,
  status: 'SUCCESS' | 'FAILED',
  responseStatus: number,
  responseBody: string,
): Promise<void> {
  try {
    const r = getRedis();
    const rk = redisKey(agentId, key);

    const record: IdempotencyRecord = {
      status,
      execution_id: executionId,
      created_at: new Date().toISOString(),
      response_status: responseStatus,
      response_body: responseBody,
    };

    await r.set(rk, JSON.stringify(record), 'EX', IDEMPOTENCY_TTL_SECONDS);
  } catch (err) {
    // Redis failure during finalization is non-fatal.
    // Reconciliation (§12.182) will fix PENDING→SUCCESS from PG.
    logger.error({ err, agentId, key, executionId }, 'Failed to finalize idempotency record');
  }
}

/** Shut down Redis connection (graceful shutdown). */
export async function shutdownIdempotencyRedis(): Promise<void> {
  if (redis) {
    redis.disconnect();
    redis = null;
  }
}
