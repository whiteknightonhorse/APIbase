import { type Stage, type PipelineContext, ok, err, type PipelineError } from '../types';
import { checkIdempotency, setPending } from '../../services/idempotency.service';
import { randomUUID } from 'node:crypto';

/**
 * IDEMPOTENCY stage (§12.43 stage 2, §12.171).
 * Check Idempotency-Key header. Set PENDING if new.
 */
export const idempotencyStage: Stage = {
  name: 'IDEMPOTENCY',

  async execute(ctx: PipelineContext) {
    const keyHeader = ctx.headers['idempotency-key'];
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
