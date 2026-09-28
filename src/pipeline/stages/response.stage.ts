import { type Stage, ok } from '../types';
import { getAttributionForTool } from '../../config/provider-attribution';

/**
 * RESPONSE stage (§12.43 stage 13).
 * Prepare the final HTTP response from pipeline context.
 */
export const responseStage: Stage = {
  name: 'RESPONSE',

  async execute(ctx) {
    ctx.responseStatus = 200;

    const attribution = getAttributionForTool(ctx.toolId);
    const metadata: Record<string, unknown> = {
      request_id: ctx.requestId,
      execution_id: ctx.executionId,
      tool_id: ctx.toolId,
      cache_hit: ctx.cacheHit ?? false,
      provider_called: ctx.providerCalled ?? false,
      provider_latency_ms: ctx.providerDurationMs ?? 0,
      billing_status: ctx.billingStatus,
      cost_usd: ctx.finalCost ?? 0,
    };
    // T-0218: only providers with a documented attribution requirement get
    // this field (currently OpenWeather, see provider-attribution.ts) — most
    // tools have none, and it must not be invented for them.
    if (attribution) {
      metadata.attribution = attribution;
    }

    ctx.responseBody = {
      data: ctx.providerResponse?.data ?? null,
      metadata,
    };

    return ok(ctx);
  },
};
