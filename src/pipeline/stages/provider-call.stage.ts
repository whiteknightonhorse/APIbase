import { logger } from '../../config/logger';
import { resolveAdapter } from '../../adapters/registry';
import { type ProviderError } from '../../types/provider';
import { type Stage, ok, err } from '../types';

/**
 * PROVIDER_CALL stage (§12.43 stage 9).
 *
 * Resolves the correct adapter for the tool, executes the provider call,
 * and stores the normalized response in context.
 *
 * - Timeout: 10s per attempt (enforced by BaseAdapter)
 * - Retries: 2 with exponential backoff (enforced by BaseAdapter)
 * - Response size limit: 1MB (enforced by BaseAdapter)
 */
export const providerCallStage: Stage = {
  name: 'PROVIDER_CALL',

  async execute(ctx) {
    if (ctx.cacheHit) {
      return ok(ctx);
    }

    const toolId = ctx.toolId;
    if (!toolId) {
      return err({
        code: 500,
        error: 'internal_error',
        message: 'No toolId in pipeline context',
      });
    }

    const adapter = resolveAdapter(toolId);
    if (!adapter) {
      return err({
        code: 503,
        error: 'service_unavailable',
        message: `No adapter registered for tool: ${toolId}`,
        retryAfter: 60,
      });
    }

    try {
      const raw = await adapter.call({
        toolId,
        params: ctx.body,
        requestId: ctx.requestId,
        agentId: ctx.agentId,
      });

      ctx.providerCalled = true;
      ctx.providerDurationMs = raw.durationMs;
      ctx.providerResponse = {
        data: raw.body,
        metadata: {
          provider_status: raw.status,
          provider_duration_ms: raw.durationMs,
          provider_bytes: raw.byteLength,
        },
      };

      // T-11 (2026-09-05) / Fable ruling-1 C.1: capture a provider-self-reported
      // per-call cost when the adapter's parsed body happens to carry one
      // (currently only api2pdf's `cost_usd`, see src/adapters/api2pdf/index.ts).
      // Generic duck-typed read on purpose — no per-adapter branching needed
      // here, and adapters that don't report a cost simply leave this unset
      // (never defaulted to 0; see execution_ledger.upstream_cost_usd doc).
      const body = raw.body as Record<string, unknown> | undefined;
      if (body && typeof body.cost_usd === 'number' && Number.isFinite(body.cost_usd)) {
        ctx.upstreamCostUsd = body.cost_usd;
      }

      logger.info(
        {
          request_id: ctx.requestId,
          tool_id: toolId,
          provider_duration_ms: raw.durationMs,
          provider_bytes: raw.byteLength,
        },
        'Provider call completed',
      );

      return ok(ctx);
    } catch (error) {
      const providerError = error as ProviderError;
      ctx.providerCalled = true;
      ctx.providerDurationMs = providerError.durationMs ?? 0;

      logger.warn(
        {
          request_id: ctx.requestId,
          tool_id: toolId,
          error_code: providerError.code,
          duration_ms: providerError.durationMs,
          message: providerError.message,
        },
        'Provider call failed',
      );

      return err({
        code: providerError.httpStatus || 502,
        error: providerError.code || 'bad_gateway',
        message: providerError.message || 'Provider call failed',
        retryAfter: providerError.retryAfter,
      });
    }
  },
};
