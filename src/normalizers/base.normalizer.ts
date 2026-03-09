import {
  type ProviderNormalizedResponse,
  type ProviderRawResponse,
  type ProviderError,
  ProviderErrorCode,
  PROVIDER_MAX_NORMALIZED_BYTES,
} from '../types/provider';

/**
 * Abstract base normalizer (§10.2 Level 2).
 *
 * Maps provider-specific response fields into the canonical APIbase domain model.
 * Subclasses implement `normalize` for each provider.
 *
 * Invariant: agent always receives the same response schema regardless of which
 * provider key was used or whether the response came from cache (§12.147).
 */
export abstract class BaseNormalizer {
  protected readonly provider: string;
  protected readonly maxNormalizedBytes: number;

  constructor(provider: string, maxNormalizedBytes?: number) {
    this.provider = provider;
    this.maxNormalizedBytes = maxNormalizedBytes ?? PROVIDER_MAX_NORMALIZED_BYTES;
  }

  /**
   * Normalize a raw provider response into the canonical domain model.
   * Subclasses map provider-specific fields to the unified schema.
   */
  protected abstract normalize(
    raw: ProviderRawResponse,
    toolId: string,
  ): ProviderNormalizedResponse;

  /**
   * Run normalization with size enforcement (§12.162 — 512KB max).
   * Throws a structured ProviderError on normalization failure.
   */
  process(raw: ProviderRawResponse, toolId: string): ProviderNormalizedResponse {
    let normalized: ProviderNormalizedResponse;
    try {
      normalized = this.normalize(raw, toolId);
    } catch (error) {
      throw createFormatError(
        this.provider,
        toolId,
        raw.durationMs,
        error instanceof Error ? error : undefined,
      );
    }

    const serialized = JSON.stringify(normalized);
    const byteLength = Buffer.byteLength(serialized, 'utf8');

    if (byteLength > this.maxNormalizedBytes) {
      throw createSizeError(this.provider, toolId, raw.durationMs, this.maxNormalizedBytes);
    }

    return normalized;
  }
}

// ---------------------------------------------------------------------------
// Error factories
// ---------------------------------------------------------------------------

function createFormatError(
  provider: string,
  toolId: string,
  durationMs: number,
  cause?: Error,
): ProviderError {
  return {
    code: ProviderErrorCode.FORMAT_ERROR,
    httpStatus: 502,
    message: 'Provider returned unexpected response format',
    provider,
    toolId,
    durationMs,
    cause,
  };
}

function createSizeError(
  provider: string,
  toolId: string,
  durationMs: number,
  maxBytes: number,
): ProviderError {
  return {
    code: ProviderErrorCode.RESPONSE_TOO_LARGE,
    httpStatus: 502,
    message: `Normalized response exceeded ${maxBytes} byte limit`,
    provider,
    toolId,
    durationMs,
  };
}
