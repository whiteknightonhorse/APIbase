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
   * Execute a provider call with timeout, retries, and size enforcement.
   * Returns either a ProviderRawResponse or throws a structured ProviderError.
   */
  async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    const built = this.buildRequest(req);
    let lastError: ProviderError | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
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

    if (response.status >= 400) {
      throw createProviderError({
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `Provider returned client error ${response.status}`,
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
