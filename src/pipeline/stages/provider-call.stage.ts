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

      // T-09b: `error` is caught as `unknown` and force-cast to ProviderError
      // above — a raw exception that slipped past BaseAdapter's own
      // classification (e.g. a DOMException with a NUMERIC `.code`) would
      // otherwise write that non-string value into this pipeline's
      // string-typed error field, which then crashed
      // `(result.error.error || '').toUpperCase()` in execute.router.ts —
      // a bare, contract-less 500 instead of this stage's own clean 502/504
      // (see AUTOPILOT-PROGRESS.md#T-09b, loc.search 2026-09-06 04:39 UTC).
      // BaseAdapter no longer lets that shape through, but this stage is the
      // one place ALL ~372 adapters funnel through — guarding here too means
      // a future adapter with the same mistake fails into a generic 502,
      // never an unhandled crash.
      return err({
        code: typeof providerError.httpStatus === 'number' ? providerError.httpStatus : 502,
        error: typeof providerError.code === 'string' ? providerError.code : 'bad_gateway',
        message:
          typeof providerError.message === 'string'
            ? providerError.message
            : 'Provider call failed',
        retryAfter: providerError.retryAfter,
      });
    }
  },
};
