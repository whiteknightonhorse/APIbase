import { type Stage, type PipelineContext, ok, err, type PipelineError } from '../types';
import { checkIdempotency, setPending } from '../../services/idempotency.service';
import { randomUUID } from 'node:crypto';

/**
 * IDEMPOTENCY stage (§12.43 stage 2, §12.171).
 * Check X-Idempotency-Key header. Set PENDING if new.
 *
 * 2026-09-01: was reading ctx.headers['idempotency-key'], but BOTH real
 * callers (execute.router.ts, batch.service.ts) populate the context under
 * 'x-idempotency-key' (matching the actual wire header, X-Idempotency-Key) —
 * the key never matched, so this stage silently no-opped on every REST
 * request regardless of the header a client sent. A balance-paying agent
 * retrying with the SAME idempotency key got charged twice, protected by
 * nothing (the payment-nonce replay guard, A-01, only covers x402/MPP signed
 * payments, not balance billing). Fixed at the one place that was wrong —
 * the two independent callers already agreed with each other.
 */
export const idempotencyStage: Stage = {
  name: 'IDEMPOTENCY',

  async execute(ctx: PipelineContext) {
    const keyHeader = ctx.headers['x-idempotency-key'];
    const key = Array.isArray(keyHeader) ? keyHeader[0] : keyHeader;

    const executionId = randomUUID();
    ctx.executionId = executionId;

    if (!key || !ctx.agentId) {
      return ok(ctx);
    }

    ctx.idempotencyKey = key;

    try {
      const result = await checkIdempotency(ctx.agentId, key);

      switch (result.action) {
        case 'proceed':
          await setPending(ctx.agentId, key, executionId);
          return ok(ctx);

        case 'conflict':
          return err<PipelineError>({
            code: 409,
            error: 'conflict',
            message: 'Request in progress for this idempotency key',
            retryAfter: result.retryAfter,
          });

        case 'return_cached':
          return err<PipelineError>({
            code: result.statusCode,
            error: 'idempotency_hit',
            message: result.body,
            extra: { cached: true },
          });
      }
    } catch {
      // Redis failure — proceed without idempotency (§12.182 reconciliation)
      return ok(ctx);
    }
  },
};
