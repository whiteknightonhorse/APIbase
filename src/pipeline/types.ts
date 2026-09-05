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
  'MODERATION',
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
  mppPaid?: boolean;
  mppPayer?: string;
  mppMethod?: string;
  mppPaymentHeader?: string;
  /** On-chain tx hash of the MPP charge (resolved by mpp.middleware.ts via
   *  Payment-Receipt + read-only RPC lookup). Needed so a refund-owed record
   *  (escrow-finalize.stage.ts) can name the original transaction — without
   *  it, a human resolving the refund has to re-derive it from logs. */
  mppTxHash?: string;

  // MODERATION stage (F2/C-2/C-3, 2026-09-01)
  /** Set when MODERATION blocked this request. Read by ESCROW_FINALIZE
   *  (settle-on-block for a paid request) and LEDGER_WRITE (records the
   *  block on the ledger row) — both invoked directly by pipeline.ts's
   *  settle-on-block exception even though MODERATION itself returned an
   *  error and would otherwise have stopped the pipeline there. */
  moderationBlocked?: boolean;
  moderationRuleId?: string;
  moderationCategory?: string;
  /** Only set for a PAID block — an appeal exists only where something was
   *  charged to contest. */
  moderationAppealId?: string;

  // PROVIDER_CALL stage
  providerResponse?: NormalizedResponse;
  providerDurationMs?: number;
  providerCalled?: boolean;
  /** T-11 (2026-09-05): real per-call cost the upstream provider itself
   *  reported in its parsed response body (currently only api2pdf's `cost`
   *  field). undefined when the provider didn't self-report one — never
   *  defaulted to 0, see execution_ledger.upstream_cost_usd doc comment. */
  upstreamCostUsd?: number;

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
