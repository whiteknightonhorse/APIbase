import { getSharedRedis } from './redis.service';
import { logger } from '../config/logger';
import client from 'prom-client';
import { ProviderErrorCode, type ProviderError } from '../types/provider';

/**
 * T-0657: per-TOOL short circuit breaker that protects the money path. It never writes
 * provider_status (the provider-level health law of T-09b stays untouched); it only makes
 * precheckToolCall answer 503 tool_unavailable BEFORE a 402 is issued or an MPP credential is
 * charged, for every payer, while a tool keeps failing.
 *
 * Redis key `tool:breaker:{toolId}` = JSON {fails, opened_until, opens}.
 *  - fails: paid failures in the last 10 minutes (TTL refreshed on each failure).
 *  - at fails >= 3: opened_until = now + min(60 s * 2^opens, 600 s), opens + 1.
 *  - a failure after the open window elapsed re-opens at once with the doubled window.
 *  - recordSuccess deletes the key (closes the breaker, resets the ladder).
 * Redis errors fail open (breaker closed): the catalog status still applies.
 */

const BREAKER_FAIL_THRESHOLD = 3;
const BREAKER_WINDOW_S = 600;
const BREAKER_BASE_OPEN_S = 60;
const BREAKER_MAX_OPEN_S = 600;
const MAX_GAUGE_SERIES = 50;

interface BreakerState {
  fails: number;
  opened_until: number;
  opens: number;
}

const toolBreakerOpensTotal = new client.Counter({
  name: 'tool_breaker_opens_total',
  help: 'Times a per-tool circuit breaker opened (3 paid 5xx/timeout/auth failures in 10 min)',
  labelNames: ['provider'] as const,
});

const toolBreakerOpen = new client.Gauge({
  name: 'tool_breaker_open',
  help: '1 while the per-tool circuit breaker is open (max 50 series)',
  labelNames: ['tool_id'] as const,
});

const gaugeTools = new Set<string>();

const keyOf = (toolId: string): string => `tool:breaker:${toolId}`;

/**
 * True for the failures that are about the provider, never about the caller's input:
 * TIMEOUT, UNAVAILABLE, PROVIDER_AUTH and INVALID_RESPONSE, the last two only with a 5xx status.
 */
function isBreakerFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as Partial<ProviderError>;
  if (e.code === ProviderErrorCode.TIMEOUT || e.code === ProviderErrorCode.UNAVAILABLE) return true;
  if (e.code === ProviderErrorCode.PROVIDER_AUTH || e.code === ProviderErrorCode.INVALID_RESPONSE) {
    return typeof e.httpStatus === 'number' && e.httpStatus >= 500;
  }
  return false;
}

function parse(raw: unknown): BreakerState | null {
  if (typeof raw !== 'string') return null;
  try {
    const v = JSON.parse(raw) as Partial<BreakerState>;
    if (
      typeof v.fails === 'number' &&
      typeof v.opened_until === 'number' &&
      typeof v.opens === 'number'
    ) {
      return { fails: v.fails, opened_until: v.opened_until, opens: v.opens };
    }
  } catch {
    /* corrupt value is treated as no state */
  }
  return null;
}

function dropGauge(toolId: string): void {
  if (gaugeTools.delete(toolId)) toolBreakerOpen.remove({ tool_id: toolId });
}

/** Records one paid failure; call only for failures where isBreakerFailure() is true. */
export async function recordFailure(
  toolId: string,
  error: unknown,
  now: number = Date.now(),
): Promise<void> {
  if (!isBreakerFailure(error)) return;
  try {
    const redis = getSharedRedis();
    const prev = parse(await redis.get(keyOf(toolId))) ?? { fails: 0, opened_until: 0, opens: 0 };
    if (prev.opened_until > now) return; // already open: in-flight stragglers do not extend it
    const state: BreakerState = { ...prev, fails: prev.fails + 1 };
    let opened = false;
    if (state.fails >= BREAKER_FAIL_THRESHOLD) {
      const openFor = Math.min(BREAKER_BASE_OPEN_S * 2 ** state.opens, BREAKER_MAX_OPEN_S);
      state.opened_until = now + openFor * 1000;
      state.opens += 1;
      opened = true;
    }
    const ttl = BREAKER_WINDOW_S + Math.max(0, Math.ceil((state.opened_until - now) / 1000));
    await redis.set(keyOf(toolId), JSON.stringify(state), 'EX', ttl);
    if (opened) {
      const provider =
        typeof (error as ProviderError).provider === 'string' &&
        (error as ProviderError).provider.length > 0
          ? (error as ProviderError).provider
          : toolId.split('.')[0];
      toolBreakerOpensTotal.inc({ provider });
      if (gaugeTools.has(toolId) || gaugeTools.size < MAX_GAUGE_SERIES) {
        gaugeTools.add(toolId);
        toolBreakerOpen.set({ tool_id: toolId }, 1);
      }
      logger.warn({ tool_id: toolId, opens: state.opens }, 'Tool circuit breaker opened');
    }
  } catch (err) {
    logger.warn({ err, tool_id: toolId }, 'Tool breaker recordFailure failed (fail-open)');
  }
}

/** A 2xx provider result closes the breaker and resets the backoff ladder. */
export async function recordSuccess(toolId: string): Promise<void> {
  try {
    await getSharedRedis().del(keyOf(toolId));
    dropGauge(toolId);
  } catch (err) {
    logger.warn({ err, tool_id: toolId }, 'Tool breaker recordSuccess failed (fail-open)');
  }
}

/** Remaining open seconds (>= 1) or 0 when closed. Redis trouble -> 0. */
export async function isOpen(toolId: string, now: number = Date.now()): Promise<number> {
  try {
    const state = parse(await getSharedRedis().get(keyOf(toolId)));
    const remaining = state ? Math.ceil((state.opened_until - now) / 1000) : 0;
    if (remaining > 0) return remaining;
    dropGauge(toolId);
    return 0;
  } catch {
    return 0;
  }
}
