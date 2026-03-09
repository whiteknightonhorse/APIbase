import { type Stage, ok } from '../types';

/**
 * RESPONSE stage (§12.43 stage 13).
 * Prepare the final HTTP response from pipeline context.
 */
export const responseStage: Stage = {
  name: 'RESPONSE',

  async execute(ctx) {
    ctx.responseStatus = 200;
    ctx.responseBody = {
      data: ctx.providerResponse?.data ?? null,
      metadata: {
        request_id: ctx.requestId,
        execution_id: ctx.executionId,
        tool_id: ctx.toolId,
        cache_hit: ctx.cacheHit ?? false,
        provider_called: ctx.providerCalled ?? false,
        provider_latency_ms: ctx.providerDurationMs ?? 0,
        billing_status: ctx.billingStatus,
        cost_usd: ctx.finalCost ?? 0,
      },
    };

    return ok(ctx);
  },
};
