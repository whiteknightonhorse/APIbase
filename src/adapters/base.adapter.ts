import { logger } from '../config/logger';
import {
  type AdapterConfig,
  type ProviderRequest,
  type ProviderRawResponse,
  type ProviderError,
  ProviderErrorCode,
  PROVIDER_TIMEOUT_MS,
  PROVIDER_MAX_RETRIES,
  PROVIDER_BACKOFF_BASE_MS,
  PROVIDER_MAX_RESPONSE_BYTES,
} from '../types/provider';
import providerLimitsConfig from '../config/provider-limits.json';
import { getSharedRedis } from '../services/redis.service';
import {
  X_RATELIMIT_LIMIT,
  X_RATELIMIT_REMAINING,
  X_RATELIMIT_RESET,
} from '../config/http-headers';

/**
 * AP-2 (2026-09-03): the upstream's own rate-limit/Retry-After headers, and a
 * ProviderError itself, are both signals we already receive on every call and
 * previously discarded. Captured here — the one place all ~372 adapters
 * funnel through — instead of duplicated per-adapter.
 *   - `provider:upstream_rl:{provider}` (G3.1): last-write-wins snapshot of
 *     whatever rate-limit headers this response carried, for burn-rate calc.
 *   - `probe:asap:{provider}` (G2): a ProviderError is "suspicion" — flag the
 *     provider for an out-of-turn health-job probe instead of waiting out the
 *     round-robin. Consuming/classifying that flag (e.g. respecting a
 *     FAIL_DETERMINISTIC pause) is the probe job's job, not this one's.
 * Both are best-effort: a Redis hiccup must never fail the actual provider
 * call, so failures here are caught and logged, never thrown.
 */
const UPSTREAM_RL_TTL_S = 6 * 60 * 60; // 6h (G3.1)
const ASAP_PROBE_TTL_S = 600; // 10 min (G2)

/**
 * F1/C-6 (2026-09-01): retries cost real money against a PAID upstream — each
 * retry is another billed call while the client paid us exactly once. Cap
 * retries to 0 (one attempt, honest fail-fast) for any provider that is not
 * confirmed free. Unlike dashboard.service.ts (which defaults an unlisted
 * provider to \"unlimited\" for a permissive health view), this defaults the
 * OTHER way on purpose: a provider missing from provider-limits.json is
 * treated as paid, because assuming \"free\" here is the direction that costs
 * money if wrong. Per-adapter maxRetries in AdapterConfig still sets the
 * ceiling for confirmed-free providers; it can only be capped down here,
 * never raised.
 */
const limitsConfig = providerLimitsConfig as Record<string, { limit_type?: string }>;

function isConfirmedFreeUpstream(provider: string): boolean {
  return limitsConfig[provider]?.limit_type === 'unlimited';
}

/**
 * Abstract base adapter for upstream provider calls (§10.2 Level 1, §12.40).
 *
 * Handles:
 * - Timeout enforcement (10s, §12.40)
 * - Retry with exponential backoff (2 retries, 1s → 2s, §12.40)
 * - Response size limiting (1MB, §12.162)
 * - Structured error handling (§12.80)
 *
 * Subclasses implement `buildRequest` and `parseResponse` for each provider.
 */
export abstract class BaseAdapter {
  protected readonly provider: string;
  protected readonly baseUrl: string;
  protected readonly timeoutMs: number;
  protected readonly maxRetries: number;
  protected readonly maxResponseBytes: number;

  constructor(config: AdapterConfig) {
    this.provider = config.provider;
    this.baseUrl = config.baseUrl;
    this.timeoutMs = config.timeoutMs ?? PROVIDER_TIMEOUT_MS;
    this.maxRetries = config.maxRetries ?? PROVIDER_MAX_RETRIES;
    this.maxResponseBytes = config.maxResponseBytes ?? PROVIDER_MAX_RESPONSE_BYTES;
  }

  /**
   * Build the outgoing HTTP request for the provider.
   * Subclasses inject auth headers, map params to provider-specific format, etc.
   */
  protected abstract buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  };

  /**
   * Parse the raw provider response body into a typed result.
   * Called only on 2xx responses with valid JSON.
   */
  protected abstract parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown;

  /**
   * T-11 (2026-09-05) / Fable ruling-1 D.3: optional per-adapter override for
   * the 401/402/403 error message. Default (undefined) keeps the generic
   * "rejected our credentials" message. A provider whose spending-cap
   * rejection is distinguishable in the response body (e.g. Zyte's
   * `/auth/account-suspended` type field) should override this so the
   * incident evidence says "spending cap reached", not a false "bad key"
   * reading — the error CODE stays PROVIDER_AUTH either way (pipeline
   * behavior is unchanged), only the human/incident-facing text sharpens.
   */
  protected describeAuthError(_status: number, _bodyText: string): string | undefined {
    return undefined;
  }

  /**
   * Execute a provider call with timeout, retries, and size enforcement.
   * Returns either a ProviderRawResponse or throws a structured ProviderError.
   *
   * Thin wrapper around callInternal() so every failure path — non-retryable
   * immediate throw, or retries exhausted — flags an asap re-probe exactly
   * once, regardless of which branch inside callInternal() produced it (G2).
   */
  async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    try {
      return await this.callInternal(req);
    } catch (error) {
      await this.flagAsapProbe();
      throw error;
    }
  }

  private async callInternal(req: ProviderRequest): Promise<ProviderRawResponse> {
    const built = this.buildRequest(req);
    let lastError: ProviderError | undefined;

    // F1/C-6: never retry a confirmed-paid (or unclassified) upstream — cap
    // to a single attempt regardless of what this adapter configured. See
    // isConfirmedFreeUpstream() doc above.
    const effectiveMaxRetries = isConfirmedFreeUpstream(this.provider) ? this.maxRetries : 0;

    for (let attempt = 0; attempt <= effectiveMaxRetries; attempt++) {
      if (attempt > 0) {
        const delayMs = PROVIDER_BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
        await sleep(delayMs);
        logger.info(
          { provider: this.provider, tool_id: req.toolId, attempt: attempt + 1, delay_ms: delayMs },
          'Retrying provider call',
        );
      }

      const start = performance.now();
      try {
        const raw = await this.executeRequest(built, req, start);
        return raw;
      } catch (error) {
        const providerError = error as ProviderError;
        lastError = providerError;

        if (!isRetryable(providerError)) {
          throw providerError;
        }

        logger.warn(
          {
            provider: this.provider,
            tool_id: req.toolId,
            attempt: attempt + 1,
            error_code: providerError.code,
            duration_ms: providerError.durationMs,
          },
          'Provider call failed, will retry',
        );
      }
    }

    // lastError is guaranteed to be set: loop runs at least once (attempt=0)
    // and either returns or assigns lastError before continuing.
    throw lastError as ProviderError;
  }

  private async executeRequest(
    built: { url: string; method: string; headers: Record<string, string>; body?: string },
    req: ProviderRequest,
    start: number,
  ): Promise<ProviderRawResponse> {
    let response: Response;
    try {
      response = await fetch(built.url, {
        method: built.method,
        headers: built.headers,
        body: built.body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const durationMs = Math.round(performance.now() - start);
      const isTimeout =
        error instanceof DOMException ||
        (error instanceof Error && error.name === 'TimeoutError') ||
        (error instanceof Error && error.name === 'AbortError');

      if (isTimeout) {
        throw createProviderError({
          code: ProviderErrorCode.TIMEOUT,
          httpStatus: 504,
          message: `Provider call timed out after ${this.timeoutMs}ms`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs,
          cause: error instanceof Error ? error : undefined,
        });
      }

      throw createProviderError({
        code: ProviderErrorCode.UNAVAILABLE,
        httpStatus: 502,
        message: `Provider connection failed: ${error instanceof Error ? error.message : 'unknown'}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs,
        cause: error instanceof Error ? error : undefined,
      });
    }

    // G3.1: capture upstream rate-limit signal before anything else can
    // throw (size limit, JSON parse, 4xx/5xx branches below) — the headers
    // are on every response regardless of status, so capture unconditionally.
    await this.captureUpstreamRateLimit(response);

    // Read response body with size enforcement (§12.162)
    const bodyText = await this.readResponseBody(response, req, start);
    const durationMs = Math.round(performance.now() - start);
    const byteLength = Buffer.byteLength(bodyText, 'utf8');

    // Handle provider error statuses (§12.80)
    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('retry-after') ?? '60', 10);
      throw createProviderError({
        code: ProviderErrorCode.RATE_LIMIT,
        httpStatus: 429,
        message: `${this.provider} API rate limit exceeded`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs,
        retryAfter,
      });
    }

    if (response.status >= 500) {
      throw createProviderError({
        code: ProviderErrorCode.UNAVAILABLE,
        httpStatus: 502,
        message: `Provider returned ${response.status}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs,
      });
    }

    // Upstream 401/402/403 = OUR credential/account problem (key invalid or
    // out of quota/credits), NOT the caller's fault and not retryable.
    if (response.status === 401 || response.status === 402 || response.status === 403) {
      const detail = bodyText.length > 0 ? `: ${bodyText.slice(0, 300)}` : '';
      // T-11 (2026-09-05) / Fable ruling-1 D.3: a real spending-cap hit and a
      // dead/rotated key both land here as an indistinguishable "rejected our
      // credentials" message once real money is involved (e.g. Zyte's PAYG
      // cap: same HTTP 403 as an invalid key). Code stays PROVIDER_AUTH (this
      // is still "we can't call the provider right now", the pipeline
      // shouldn't branch on it) but the message subclasses can sharpen via
      // describeAuthError() so the incident evidence is unambiguous.
      const message =
        this.describeAuthError(response.status, bodyText) ??
        `Provider rejected our credentials (HTTP ${response.status})${detail}`;
      throw createProviderError({
        code: ProviderErrorCode.PROVIDER_AUTH,
        httpStatus: 503,
        message,
        provider: this.provider,
        toolId: req.toolId,
        durationMs,
        retryAfter: 60,
      });
    }

    // Other upstream 4xx = the CALLER's input was rejected (bad/missing params,
    // not-found, unprocessable). Surface as a 422 client error so agents fix
    // their request instead of treating it as a gateway/provider failure —
    // previously all 4xx were lumped into INVALID_RESPONSE → HTTP 502.
    if (response.status >= 400) {
      const detail = bodyText.length > 0 ? `: ${bodyText.slice(0, 500)}` : '';
      throw createProviderError({
        code: ProviderErrorCode.INPUT_REJECTED,
        httpStatus: 422,
        message: `Provider rejected the request (HTTP ${response.status})${detail}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs,
      });
    }

    // Parse JSON (§12.58)
    let body: unknown;
    try {
      body = JSON.parse(bodyText);
    } catch {
      throw createProviderError({
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'Provider returned invalid JSON',
        provider: this.provider,
        toolId: req.toolId,
        durationMs,
      });
    }

    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    const raw: ProviderRawResponse = {
      status: response.status,
      headers,
      body,
      durationMs,
      byteLength,
    };

    // Let subclass parse/validate the response structure
    raw.body = this.parseResponse(raw, req);
    return raw;
  }

  /**
   * Stream-read the response body with 1MB size limit enforcement (§12.162).
   */
  private async readResponseBody(
    response: Response,
    req: ProviderRequest,
    start: number,
  ): Promise<string> {
    if (!response.body) {
      return '';
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const chunks: string[] = [];
    let totalBytes = 0;

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        totalBytes += value.byteLength;
        if (totalBytes > this.maxResponseBytes) {
          reader.cancel().catch(() => {});
          const durationMs = Math.round(performance.now() - start);
          throw createProviderError({
            code: ProviderErrorCode.RESPONSE_TOO_LARGE,
            httpStatus: 502,
            message: `Provider response exceeded ${this.maxResponseBytes} byte limit`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs,
          });
        }

        chunks.push(decoder.decode(value, { stream: true }));
      }
    } finally {
      reader.releaseLock();
    }

    // Flush any remaining bytes in the decoder
    chunks.push(decoder.decode());
    return chunks.join('');
  }

  /**
   * G3.1: mirror the upstream's own rate-limit/Retry-After headers into
   * Redis as a last-write-wins snapshot. DEL-then-write so a response that
   * only carries `retry-after` (e.g. a 429) doesn't leave stale
   * limit/remaining fields from an earlier, different-shaped response mixed
   * into the same hash — each capture fully replaces the prior one.
   */
  private async captureUpstreamRateLimit(response: Response): Promise<void> {
    const limit = response.headers.get(X_RATELIMIT_LIMIT);
    const remaining = response.headers.get(X_RATELIMIT_REMAINING);
    const reset = response.headers.get(X_RATELIMIT_RESET);
    const retryAfter = response.headers.get('retry-after');

    if (limit === null && remaining === null && reset === null && retryAfter === null) {
      return; // nothing on this response — leave any previous snapshot alone
    }

    const fields: Record<string, string> = { captured_at: new Date().toISOString() };
    if (limit !== null) fields.limit = limit;
    if (remaining !== null) fields.remaining = remaining;
    if (reset !== null) fields.reset = reset;
    if (retryAfter !== null) fields.retry_after = retryAfter;

    const key = `provider:upstream_rl:${this.provider}`;
    try {
      const redis = getSharedRedis();
      await redis.del(key);
      await redis.hmset(key, fields);
      await redis.expire(key, UPSTREAM_RL_TTL_S);
    } catch (err) {
      logger.warn(
        { provider: this.provider, err },
        'Failed to capture upstream rate-limit headers',
      );
    }
  }

  /**
   * G2: a ProviderError is itself "suspicion" — flag this provider for an
   * out-of-turn probe on the health job's next tick instead of waiting out
   * the slow round-robin/adaptive schedule.
   */
  private async flagAsapProbe(): Promise<void> {
    const key = `probe:asap:${this.provider}`;
    try {
      const redis = getSharedRedis();
      await redis.setex(key, ASAP_PROBE_TTL_S, '1');
    } catch (err) {
      logger.warn({ provider: this.provider, err }, 'Failed to flag asap probe');
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createProviderError(fields: ProviderError): ProviderError {
  return fields;
}

/** Retryable: 5xx, timeout, connection reset. Not retryable: 4xx (§12.40). */
function isRetryable(error: ProviderError): boolean {
  return error.code === ProviderErrorCode.TIMEOUT || error.code === ProviderErrorCode.UNAVAILABLE;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
