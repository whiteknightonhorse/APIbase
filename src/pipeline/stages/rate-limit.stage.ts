import { type Stage, ok, err, type PipelineError } from '../types';
import { checkRateLimit } from '../../services/rate-limit.service';

/**
 * RATE_LIMIT stage (§12.43 stage 7, §12.172).
 * Dual token bucket: per-agent-per-tool + per-agent-global.
 * Only lock owners reach this stage (single-flight waiters skip).
 */
export const rateLimitStage: Stage = {
  name: 'RATE_LIMIT',

  async execute(ctx) {
    if (!ctx.agentId || !ctx.toolId || !ctx.tier) {
      return ok(ctx);
    }

    // Single-flight waiters skip rate limiting
    if (ctx.isLockOwner === false) {
      return ok(ctx);
    }

    try {
      const result = await checkRateLimit(ctx.agentId, ctx.toolId, ctx.tier);

      ctx.rateLimitRemaining = result.remaining;

      if (!result.allowed) {
        return err<PipelineError>({
          code: 429,
          error: 'rate_limit_exceeded',
          message: 'Too many requests',
          retryAfter: result.retryAfterSecs,
        });
      }

      return ok(ctx);
    } catch {
      // Redis failure — fail closed (§12.186)
      return err<PipelineError>({
        code: 503,
        error: 'service_unavailable',
        message: 'Rate limit service unavailable',
        retryAfter: 5,
      });
    }
  },
};
