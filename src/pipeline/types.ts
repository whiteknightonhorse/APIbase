/**
 * Pipeline typed contracts (§12.170).
 *
 * Result<T,E> pattern — inspired by Rust.
 * Each stage has typed I/O. Pipeline stops on first error.
 * Context is ephemeral in-memory state for one request execution.
 */

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export type Result<T, E = PipelineError> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// ---------------------------------------------------------------------------
// Pipeline errors
// ---------------------------------------------------------------------------

export interface PipelineError {
  code: number;
  error: string;
  message: string;
  retryAfter?: number;
  extra?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Stage interface
// ---------------------------------------------------------------------------

export interface Stage<Input = PipelineContext, Output = PipelineContext> {
  name: StageName;
  execute(ctx: Input): Promise<Result<Output, PipelineError>>;
}

// ---------------------------------------------------------------------------
// Stage names (§12.157 — order is programmatically enforced)
// ---------------------------------------------------------------------------

export const STAGE_NAMES = [
  'AUTH',
  'IDEMPOTENCY',
  'CONTENT_NEG',
  'SCHEMA_VALIDATION',
  'TOOL_STATUS',
  'CACHE_OR_SINGLE_FLIGHT',
  'RATE_LIMIT',
  'ESCROW',
  'PROVIDER_CALL',
  'ESCROW_FINALIZE',
  'LEDGER_WRITE',
  'CACHE_SET',
  'RESPONSE',
] as const;

export type StageName = (typeof STAGE_NAMES)[number];

// ---------------------------------------------------------------------------
// Pipeline context (accumulated through stages)
// ---------------------------------------------------------------------------

export interface NormalizedResponse {
  data: unknown;
  metadata?: Record<string, unknown>;
}

export interface PipelineContext {
  // Request metadata
  requestId: string;
  method: string;
  path: string;
  body: unknown;
  headers: Record<string, string | string[] | undefined>;

  // AUTH stage output
  agentId?: string;
  tier?: 'free' | 'paid' | 'enterprise';

  // Tool resolution
  toolId?: string;
  toolPrice?: number;
  toolCacheTtl?: number;

  // IDEMPOTENCY stage
  idempotencyKey?: string;
  executionId?: string;

  // CACHE_OR_SINGLE_FLIGHT stage
  cacheHit?: boolean;
  cacheKey?: string;
  isLockOwner?: boolean;

  // RATE_LIMIT stage
  rateLimitRemaining?: number;

  // ESCROW stage
  escrowId?: string;
  escrowAmount?: number;
  escrowCreatedAt?: Date;
  x402Paid?: boolean;
  x402Payer?: string;
  x402PaymentHeader?: string;

  // PROVIDER_CALL stage
  providerResponse?: NormalizedResponse;
  providerDurationMs?: number;
  providerCalled?: boolean;

  // ESCROW_FINALIZE stage
  billingStatus?: string;
  finalCost?: number;

  // LEDGER_WRITE stage
  ledgerWritten?: boolean;

  // CACHE_SET stage
  cacheSet?: boolean;

  // Response
  responseStatus?: number;
  responseBody?: unknown;

  // Current stage (for observability)
  currentStage?: StageName;
  stageTimings?: Record<string, number>;
}

/**
 * Create an initial pipeline context from an incoming request.
 */
export function createPipelineContext(
  requestId: string,
  method: string,
  path: string,
  body: unknown,
  headers: Record<string, string | string[] | undefined>,
): PipelineContext {
  return {
    requestId,
    method,
    path,
    body,
    headers,
    stageTimings: {},
  };
}
