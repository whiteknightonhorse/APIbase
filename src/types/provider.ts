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
  /** Upstream rejected the CALLER's input (4xx other than 401/402/403/429):
   *  bad/missing params, not-found, unprocessable. The caller should fix the
   *  request — surfaced as HTTP 422, distinct from genuine provider failures. */
  INPUT_REJECTED: 'provider_input_rejected',
  /** Upstream rejected OUR credentials/quota (401/402/403): the provider key is
   *  invalid or out of credits. Not the caller's fault — surfaced as HTTP 503. */
  PROVIDER_AUTH: 'provider_auth_error',
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

/**
 * T-09b (2026-09-06): a TIMEOUT gets a SMALLER retry budget than other
 * retryable failures, independent of PROVIDER_MAX_RETRIES. Repeating a call
 * that already burned the full timeoutMs budget rarely succeeds on a 3rd
 * identical attempt, and every extra attempt adds a full timeoutMs +
 * backoff to the client's wall-clock wait — for a confirmed-free provider
 * at the default 10s timeout, the full PROVIDER_MAX_RETRIES budget means a
 * genuinely-down upstream makes the client wait 10s+1s+10s+2s+10s = 33s
 * before a contractual 504, worse than the ~22s the loc.search incident
 * actually measured (AUTOPILOT-PROGRESS.md#T-09b). Capping timeouts to 1
 * retry (2 total attempts) bounds that to timeoutMs + 1s + timeoutMs = 21s
 * at the default timeout, while 5xx/UNAVAILABLE — often a one-off blip more
 * likely to succeed on a 2nd retry — keeps the full budget.
 */
export const PROVIDER_MAX_TIMEOUT_RETRIES = 1;

/** Exponential backoff base: 1s → 2s → 4s (§12.40). */
export const PROVIDER_BACKOFF_BASE_MS = 1_000;

/** Max raw response size: 1MB (§12.162). */
export const PROVIDER_MAX_RESPONSE_BYTES = 1_048_576;

/** Max normalized response size: 512KB (§12.162). */
export const PROVIDER_MAX_NORMALIZED_BYTES = 524_288;
