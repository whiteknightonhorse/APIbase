/**
 * Provider adapter types (§10, §12.40, §12.147, §12.162).
 *
 * Three-layer architecture:
 *  1. Protocol Adapter — auth, pagination, rate limiting, retry
 *  2. Semantic Normalizer — provider fields → canonical domain model
 *  3. Referral + Payment Injector — affiliate IDs, x402 headers
 */

// ---------------------------------------------------------------------------
// Provider request / response
// ---------------------------------------------------------------------------

/** Raw response from an upstream provider before normalization. */
export interface ProviderRawResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  durationMs: number;
  byteLength: number;
}

/** Normalized response returned to the pipeline (§12.147). */
export interface ProviderNormalizedResponse {
  data: unknown;
  metadata?: Record<string, unknown>;
}

/** Provider call request passed to the adapter. */
export interface ProviderRequest {
  toolId: string;
  params: unknown;
  requestId: string;
  agentId?: string;
}

// ---------------------------------------------------------------------------
// Provider errors (§12.80, §12.148)
// ---------------------------------------------------------------------------

/** Error codes for provider failures, mapped to specific HTTP statuses. */
export const ProviderErrorCode = {
  TIMEOUT: 'provider_timeout',
  UNAVAILABLE: 'provider_unavailable',
  RATE_LIMIT: 'provider_rate_limit',
  INVALID_RESPONSE: 'provider_invalid_response',
  FORMAT_ERROR: 'provider_format_error',
  RESPONSE_TOO_LARGE: 'provider_response_too_large',
} as const;

export type ProviderErrorCodeValue = (typeof ProviderErrorCode)[keyof typeof ProviderErrorCode];

/** Structured provider error (§12.80). */
export interface ProviderError {
  code: ProviderErrorCodeValue;
  httpStatus: number;
  message: string;
  provider: string;
  toolId: string;
  durationMs: number;
  retryAfter?: number;
  cause?: Error;
}

// ---------------------------------------------------------------------------
// Adapter configuration (§12.40)
// ---------------------------------------------------------------------------

/** Per-adapter retry and timeout configuration. */
export interface AdapterConfig {
  /** Provider name (e.g. 'openweathermap', 'coingecko'). */
  provider: string;
  /** Base URL for the provider API. */
  baseUrl: string;
  /** Request timeout in milliseconds. Default: 10_000 (§12.40). */
  timeoutMs?: number;
  /** Max retry attempts (not counting the initial request). Default: 2 (§12.40). */
  maxRetries?: number;
  /** Max raw response size in bytes. Default: 1_048_576 (1MB, §12.162). */
  maxResponseBytes?: number;
}

// ---------------------------------------------------------------------------
// Constants (§12.40, §12.162)
// ---------------------------------------------------------------------------

/** Default provider call timeout: 10 seconds (§12.40). */
export const PROVIDER_TIMEOUT_MS = 10_000;

/** Max retry attempts: 2 retries = 3 total attempts (§12.40). */
export const PROVIDER_MAX_RETRIES = 2;

/** Exponential backoff base: 1s → 2s → 4s (§12.40). */
export const PROVIDER_BACKOFF_BASE_MS = 1_000;

/** Max raw response size: 1MB (§12.162). */
export const PROVIDER_MAX_RESPONSE_BYTES = 1_048_576;

/** Max normalized response size: 512KB (§12.162). */
export const PROVIDER_MAX_NORMALIZED_BYTES = 524_288;
