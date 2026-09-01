import { ensureRedisConnected, getSharedRedis } from './redis.service';
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
  const r = await ensureRedisConnected();

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
  const r = getSharedRedis();
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
    const r = getSharedRedis();
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

/**
 * Finalize the idempotency record for a completed pipeline execution, if this
 * request actually opened one (2026-09-01 follow-up to the header-name fix).
 *
 * finalizeIdempotency() above was always the right primitive but nothing
 * called it — every entry point ran the pipeline and returned, leaving the
 * PENDING record from setPending() to sit until its 600s TTL expired. Any
 * retry with the same key in that window got 'conflict' (409) forever,
 * instead of the intended replay-with-cached-response semantics.
 *
 * Callers pass whatever they actually sent back to THEIR client — the
 * cached replay must match what really happened on that entry point (REST
 * error envelope vs. a batch sub-call's plain result), so this only decides
 * WHETHER to finalize, not what to store.
 *
 * No-ops when:
 *  - no idempotency key was presented (nothing was opened), or
 *  - the pipeline stopped AT the IDEMPOTENCY stage itself (currentStage
 *    still equals 'IDEMPOTENCY') — that outcome (conflict or a cached hit)
 *    belongs to a PRIOR request's record, not this one; finalizing here
 *    would overwrite that prior record with the wrong status.
 */
export async function finalizePipelineIdempotency(
  ctx: { idempotencyKey?: string; agentId?: string; executionId?: string; currentStage?: string },
  status: 'SUCCESS' | 'FAILED',
  responseStatus: number,
  responseBody: string,
): Promise<void> {
  if (!ctx.idempotencyKey || !ctx.agentId || !ctx.executionId) return;
  if (ctx.currentStage === 'IDEMPOTENCY') return;
  await finalizeIdempotency(
    ctx.agentId,
    ctx.idempotencyKey,
    ctx.executionId,
    status,
    responseStatus,
    responseBody,
  );
}

/** No-op — shared Redis singleton shutdown handled by redis.service.ts. */
export async function shutdownIdempotencyRedis(): Promise<void> {
  // no-op: shared singleton
}
