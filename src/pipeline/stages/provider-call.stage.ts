import { logger } from '../../config/logger';
import { resolveAdapter } from '../../adapters/registry';
import { type ProviderError, ProviderErrorCode } from '../../types/provider';
import { type Stage, ok, err } from '../types';
import { recordProbeResult, type ProbeResult } from '../../jobs/provider-health.job';
import { getPrisma } from '../../services/prisma.service';
import { getSharedRedis } from '../../services/redis.service';
import { PASSIVE_CALL_FAILURE_DEBOUNCE_S } from '../../config/autopilot';

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
      await recordProviderCallFailure(providerError, toolId);

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

/**
 * T-09b: a failed PROVIDER_CALL never reaches LEDGER_WRITE — pipeline.ts
 * stops on first error, so ledger-write.stage.ts's execution_ledger row
 * simply never gets written for it. tool-quality.job.ts's passive detector
 * (applyPassiveDegradation) reads execution_ledger for its error-rate
 * signal, so a provider whose every real call fails at PROVIDER_CALL was
 * passively invisible to it — the active health probe was the only signal
 * left, and it only hits a generic `health_url`, not the specific failing
 * tool_id (see AUTOPILOT-PROGRESS.md#T-09b for the cma.artwork_search case
 * this blind spot let through). This feeds the SAME shared state machine
 * (recordProbeResult, also used by the active probe job and by
 * tool-quality.job.ts's ledger-based passive step — "one place decides what
 * a probe result means") directly from the real failure, independent of
 * whether a ledger row exists.
 *
 * Deliberately narrow about which failures count as a health signal:
 *   - TIMEOUT / UNAVAILABLE (BaseAdapter's own classification of a genuine
 *     transport/5xx failure) -> FAIL_TRANSIENT, same as an active probe.
 *   - PROVIDER_AUTH (401/402/403) is deliberately EXCLUDED here (attempt-2
 *     wrote this to FAIL_DETERMINISTIC and Fable rejected it, ruling-2: two
 *     WAF-triggered 403s 30s apart from ONE bot's odd input — exactly the
 *     heartbeat's own traffic shape — would pause the whole provider for 24h
 *     off nothing but that bot. `BaseAdapter.call()` already flags
 *     `probe:asap:{provider}` on every ProviderError including this one
 *     (G2); the active probe job's own `probeAuth` (a real auth-header check
 *     against `auth_env`, not a guess from one request's status code) is the
 *     one place that gets to call a key dead.
 *   - Everything else (INPUT_REJECTED, RATE_LIMIT, RESPONSE_TOO_LARGE,
 *     INVALID_RESPONSE, or a shape with no recognizable `.code` at all —
 *     e.g. our own "Unsupported tool" catalog/adapter mismatch) is
 *     deliberately EXCLUDED. Those are signals about OUR routing/schema, not
 *     the upstream's health, and feeding them here would wrongly demote a
 *     provider's OTHER, correctly-wired tools every time one broken tool_id
 *     gets called — the exact trap this task's review caught (cma.search
 *     works fine; cma.artwork_search's 100%-failure "Unsupported tool" must
 *     not drag cma's provider_status down with it). Those get fixed at the
 *     catalog/adapter level instead (see the adapter alias fixes and the
 *     manual `unavailable` migration in this same task).
 *
 * Two independent throttles, not one — ruling-2 found the first alone still
 * broke F1's "между замерами ≥ probe_interval" spacing:
 *   1. A short (PASSIVE_CALL_FAILURE_DEBOUNCE_S) per-provider Redis SETNX —
 *      this runs on EVERY failing request, not once per aggregation tick
 *      like the ledger-based passive steps, so without ANY debounce a tool
 *      failing at high volume would write a provider_status update +
 *      probe_log row per request.
 *   2. The SAME `provider_status.next_probe_at` gate applyPassiveDegradation
 *      already uses — the debounce alone re-arms every
 *      PASSIVE_CALL_FAILURE_DEBOUNCE_S regardless of what interval the state
 *      machine's own last transition earned, so a sustained outage still
 *      wrote a fresh FAIL_TRANSIENT every ~30s and walked HEALTHY -> DOWN's
 *      24h backoff cap in well under 5 minutes of real traffic (ruling-2's
 *      table: fail #10 at t=270s already at the 24h cap) — the "reactive
 *      500 crushes down for a day" failure this whole task exists to avoid,
 *      just via the fix instead of the bug. Gating on next_probe_at makes a
 *      passive call-failure advance the state machine at most once per
 *      adaptive interval, exactly like an active probe or the ledger-based
 *      passive steps.
 *
 * Best-effort and awaited (mirrors BaseAdapter.flagAsapProbe's posture for
 * the identical class of problem): a Prisma/Redis hiccup here must never
 * change the client's response, so failures are caught and logged, never
 * rethrown.
 */
// Exported (not just internal to the catch block above) so the F1-gate
// transition can be exercised directly — both by the unit suite
// (tests/unit/pipeline/provider-call.stage.test.ts) and by a live
// demonstration against a real database, without needing a fake adapter
// wired through the registry just to reach this function.
export async function recordProviderCallFailure(
  providerError: ProviderError,
  toolId: string,
): Promise<void> {
  const result: ProbeResult | null =
    providerError.code === ProviderErrorCode.TIMEOUT ||
    providerError.code === ProviderErrorCode.UNAVAILABLE
      ? 'FAIL_TRANSIENT'
      : null;

  if (result === null) {
    return;
  }

  const provider =
    typeof providerError.provider === 'string' && providerError.provider.length > 0
      ? providerError.provider
      : toolId.split('.')[0];

  try {
    const redis = getSharedRedis();
    const debounceKey = `probe:passive-call-fail:${provider}`;
    const acquired = await redis.set(debounceKey, '1', 'EX', PASSIVE_CALL_FAILURE_DEBOUNCE_S, 'NX');
    if (acquired !== 'OK') {
      return; // another failure already recorded this provider within the window
    }

    const db = getPrisma();
    const status = await db.providerStatus.findUnique({
      where: { provider },
      select: { next_probe_at: true },
    });
    // Same rule as applyPassiveDegradation (tool-quality.job.ts): a null
    // next_probe_at (never probed) is always due; anything else must have
    // elapsed. Skipping here — not just failing to acquire the debounce —
    // is what keeps a sustained outage from advancing the state machine
    // faster than the interval it already earned.
    if (status && status.next_probe_at.getTime() > Date.now()) {
      return;
    }

    await recordProbeResult(db, redis, provider, 'passive', result, {
      httpStatus:
        typeof providerError.httpStatus === 'number' ? providerError.httpStatus : undefined,
      detail: `passive: ${providerError.code} from ${toolId} call`,
    });
  } catch (err) {
    logger.warn(
      { err, provider, tool_id: toolId },
      'T-09b: passive probe record failed for a provider-call failure',
    );
  }
}
