import { AsyncLocalStorage } from 'node:async_hooks';
import client from 'prom-client';

/**
 * Application Metrics (§12.197, §AP-2 observability-first).
 *
 * prom-client registry with default Node.js process metrics +
 * custom APIbase counters, histograms, and gauges.
 *
 * Forbidden labels: agent_id, request_id (§7 — cardinality explosion).
 */

// ---------------------------------------------------------------------------
// Registry — collect default process metrics (GC, memory, event loop, etc.)
// ---------------------------------------------------------------------------

export const register = client.register;

client.collectDefaultMetrics({ register });

// ---------------------------------------------------------------------------
// HTTP request metrics
// ---------------------------------------------------------------------------

export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status'] as const,
  registers: [register],
});

export const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

// ---------------------------------------------------------------------------
// Cache metrics
// ---------------------------------------------------------------------------

/** T-0525: a payment identifier reused for another payer ("payer") or another request ("request"). */
export const shopPaymentIdentifierConflictsTotal = new client.Counter({
  name: 'shop_payment_identifier_conflicts_total',
  help: 'shop.order.pay payment-identifier conflicts, by reason',
  labelNames: ['reason'] as const,
  registers: [register],
});

/** T-0426: MPP challenges issued, by the one currency (token address) the challenge advertises. */
export const mppChallengesTotal = new client.Counter({
  name: 'mpp_challenges_total',
  help: 'MPP challenges built, by advertised currency',
  labelNames: ['currency'] as const,
  registers: [register],
});

export const cacheHitsTotal = new client.Counter({
  name: 'cache_hits_total',
  help: 'Total cache hits',
  labelNames: ['tool_id'] as const,
  registers: [register],
});

export const cacheMissesTotal = new client.Counter({
  name: 'cache_misses_total',
  help: 'Total cache misses',
  labelNames: ['tool_id'] as const,
  registers: [register],
});

// ---------------------------------------------------------------------------
// Escrow metrics
// ---------------------------------------------------------------------------

export const escrowActiveCount = new client.Gauge({
  name: 'escrow_active_count',
  help: 'Number of active escrows',
  registers: [register],
});

export const escrowAgeSeconds = new client.Histogram({
  name: 'escrow_age_seconds',
  help: 'Escrow age in seconds at finalization',
  buckets: [1, 5, 10, 15, 30, 60, 120],
  registers: [register],
});

// ---------------------------------------------------------------------------
// Rate limit metrics
// ---------------------------------------------------------------------------

export const rateLimitHitsTotal = new client.Counter({
  name: 'rate_limit_hits_total',
  help: 'Total rate limit rejections',
  labelNames: ['tool_id'] as const,
  registers: [register],
});

// ---------------------------------------------------------------------------
// Provider metrics
// ---------------------------------------------------------------------------

export const providerCallDurationSeconds = new client.Histogram({
  name: 'provider_call_duration_seconds',
  help: 'Provider API call duration in seconds',
  labelNames: ['provider'] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

// T-0642: a Base RPC call failed on the primary and was served by the reserve host.
export const x402RpcFallbackUsedTotal = new client.Counter({
  name: 'x402_rpc_fallback_used_total',
  help: 'Base RPC requests that failed on the primary host and were retried on the fallback host',
  labelNames: ['host'] as const,
  registers: [register],
});

// T-0339 (finding 048): a paid request reached LEDGER_WRITE with no escrow and no on-chain ledger
// entry, so nothing recorded it. Expected to stay 0.
export const ledgerPaidWithoutEscrowTotal = new client.Counter({
  name: 'apibase_ledger_paid_without_escrow_total',
  help: 'Paid tool calls that reached LEDGER_WRITE without an escrow or on-chain ledger entry',
  labelNames: ['rail'] as const,
  registers: [register],
});

// T-0601: LEDGER_WRITE threw after the payer's money moved (settled / pending / MPP charged).
// The result was delivered and an outbox row `ledger.write_failed` was booked. Expected to stay 0.
export const ledgerWriteFailedAfterSettleTotal = new client.Counter({
  name: 'apibase_ledger_write_failed_after_settle_total',
  help: 'LEDGER_WRITE exceptions after a successful settle (result delivered, outbox row booked)',
  labelNames: ['rail'] as const,
  registers: [register],
});

// T-0646: the worker booked a `ledger.write_failed` outbox row into execution_ledger.
export const ledgerWriteFailedBookedTotal = new client.Counter({
  name: 'apibase_ledger_write_failed_booked_total',
  help: 'ledger.write_failed outbox rows booked into execution_ledger by the worker reconcile job',
  labelNames: ['rail'] as const,
  registers: [register],
});

export const providerErrorsTotal = new client.Counter({
  name: 'provider_errors_total',
  help: 'Total provider errors',
  labelNames: ['provider'] as const,
  registers: [register],
});

export const providerRequestsTotal = new client.Counter({
  name: 'provider_requests_total',
  help: 'Total provider requests',
  labelNames: ['provider'] as const,
  registers: [register],
});

// ---------------------------------------------------------------------------
// Ledger metrics
// ---------------------------------------------------------------------------

export const ledgerWritesTotal = new client.Counter({
  name: 'ledger_writes_total',
  help: 'Total ledger writes',
  labelNames: ['status'] as const,
  registers: [register],
});

// ---------------------------------------------------------------------------
// Capability/alternatives metrics (T-0207, ZZ-03-07, 03-SPECIFICATION.md R-2 R2.4)
//
// Permanent measurement of fallback demand, replacing the one-off 2026-09-14 live count (Q2
// ruling-1: 13 timeouts / 12107 calls, 0.1%) that R-3's "10x that" threshold is judged against.
// `capability` is a small, human-declared, closed set (config/tool_provider_config.yaml) —
// bounded cardinality, not a §7 violation like agent_id/request_id would be. `tool_id` is
// additionally allowed on the lost-with-alternative counter only, and only for tools that
// already carry a declared capability (today ≈95 of ~1400) — still bounded, and needed to tell
// WHICH tool in a capability group is losing calls, not just that the group is.
// ---------------------------------------------------------------------------

export const apibaseCallAttemptedTotal = new client.Counter({
  name: 'apibase_call_attempted_total',
  help: 'Total calls attempted for a tool with a declared capability (denominator for fallback-demand measurement)',
  labelNames: ['capability'] as const,
  registers: [register],
});

export const apibaseCallLostWithAlternativeTotal = new client.Counter({
  name: 'apibase_call_lost_with_alternative_total',
  help: 'Total calls that failed (503/502/504) while a healthy same-capability, same-scope alternative existed',
  labelNames: ['capability', 'tool_id'] as const,
  registers: [register],
});

// ---------------------------------------------------------------------------
// MCP session metrics
// ---------------------------------------------------------------------------

export const mcpSessionsActive = new client.Gauge({
  name: 'mcp_sessions_active',
  help: 'Number of active MCP sessions',
  registers: [register],
});

/** T-0795: MCP JSON-RPC requests by transport surface and method (internal measurement). */
export const mcpRpcRequestsTotal = new client.Counter({
  name: 'mcp_rpc_requests_total',
  help: 'MCP JSON-RPC requests by surface and method',
  labelNames: ['surface', 'method'] as const, // surface: mcp | storefront | sse; method: initialize | tools_list | tools_call | other
  registers: [register],
});

/** T-0795: outcome of each registered-tool call, by payer class. */
export const mcpToolCallOutcomesTotal = new client.Counter({
  name: 'mcp_tool_call_outcomes_total',
  help: 'MCP tool call outcomes by payer class',
  labelNames: ['outcome', 'payer'] as const, // outcome: paid | payment_required | ok_unpaid | error; payer: internal | external | none
  registers: [register],
});

/** T-0795: ended MCP sessions by the furthest step reached and the payer class of the first paid call. */
export const mcpSessionsEndedTotal = new client.Counter({
  name: 'mcp_sessions_ended_total',
  help: 'Ended MCP sessions by furthest step reached',
  labelNames: ['surface', 'reached', 'payer'] as const, // reached: initialize | tools_list | tools_call | payment_required | paid
  registers: [register],
});

/** T-0837: sessions opened on /mcp and /sse by tools/list view (lean | shop | all), counted at session start. */
export const mcpSessionsByViewTotal = new client.Counter({
  name: 'mcp_sessions_by_view_total',
  help: 'MCP sessions opened on /mcp and /sse by tools/list view',
  labelNames: ['view'] as const,
  registers: [register],
});

/** Daily shop-provek-registry-sync: registry downloads that failed (stored values kept). */
export const provekRegistrySyncFailures = new client.Counter({
  name: 'provek_registry_sync_failures_total',
  help: 'Provek registry loads that failed in shop-provek-registry-sync',
  registers: [register],
});

/** T-0551: refund_ledger writes that failed (a missed debt; the writer logs refund_ledger_write_failed). */
export const refundLedgerWriteFailuresTotal = new client.Counter({
  name: 'refund_ledger_write_failures_total',
  help: 'refund_ledger inserts that failed (the debt was not recorded)',
  registers: [register],
});

/** T-0652: a settled Tempo call failed and had no refund row; the reconcile job booked it. */
export const mppRefundLedgerGapTotal = new client.Counter({
  name: 'mpp_refund_ledger_gap_total',
  help: 'MPP refund-owed rows booked by the settlement-side reconcile job (the writer missed them)',
  registers: [register],
});

/** T-0652: USDC.e reached the revenue wallet with no ledger row (a human decides). */
export const mppSettleUnmatchedTotal = new client.Counter({
  name: 'mpp_settle_unmatched_total',
  help: 'Tempo USDC.e transfers into the revenue wallet with no ledger row',
  registers: [register],
});

export const mppReconcileRpcErrorsTotal = new client.Counter({
  name: 'mpp_reconcile_rpc_errors_total',
  help: 'MPP reconcile runs whose chain side was skipped by an RPC failure',
  registers: [register],
});

export const mppReconcileLastRunTimestamp = new client.Gauge({
  name: 'mpp_reconcile_last_run_timestamp_seconds',
  help: 'Unix time of the last completed mpp-refund-reconcile run',
  registers: [register],
});

/** §14: share of active merchant storefronts the hourly probe reached (sample of 100 / active). */
export const storefrontProbeCoverage = new client.Gauge({
  name: 'storefront_probe_coverage',
  help: 'Fraction of active merchant storefronts covered by the last hourly probe (0..1)',
  registers: [register],
});

/** UC-22: 1 when the DB-IP Country Lite database is loaded in this process, 0 when it is missing. */
export const geoDbLoaded = new client.Gauge({
  name: 'geo_db_loaded',
  help: 'IP country database loaded for the UC-22 registration rule (1) or missing (0)',
  registers: [register],
});

// ---------------------------------------------------------------------------
// x402 self-hosted facilitator metrics (X402_FACILITATOR_MODE=local)
// ---------------------------------------------------------------------------

export const x402LocalSettleTotal = new client.Counter({
  name: 'x402_local_settle_total',
  help: 'Total x402 local-facilitator settle attempts',
  labelNames: ['result', 'kind'] as const, // result: 'success' | 'fallback' | 'error'; kind: 'tool' | 'order' | 'fee_split'
  registers: [register],
});

/** T-0658: settles whose outcome is unknown and held for the chain reconcile, by why. */
export const x402SettleUnknownTotal = new client.Counter({
  name: 'x402_settle_unknown_total',
  help: 'x402 settles recorded as pending (outcome unknown) instead of failed',
  labelNames: ['kind'] as const, // timeout | thrown_unknown | settlement_pending | verify_rpc_retry | verify_rpc_pending
  registers: [register],
});

export const x402LocalSettleDurationSeconds = new client.Histogram({
  name: 'x402_local_settle_duration_seconds',
  help: 'x402 local-facilitator settle duration in seconds, by outcome',
  // Sub-second buckets to capture future fire-and-forget optimization wins;
  // upper buckets to detect chain-finality slowdowns.
  buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
  labelNames: ['result', 'kind'] as const, // result: 'success' | 'fallback' | 'error'; kind: 'tool' | 'order' | 'fee_split'
  registers: [register],
});

/**
 * T-0552: which kind of settle is running, for the `kind` label of the local-facilitator latency
 * metrics. The resource server calls `settle()` without any hint, so the shop caller sets it here.
 */
export type SettleKind = 'tool' | 'order' | 'fee_split';
const settleKindStore = new AsyncLocalStorage<SettleKind>();
export const withSettleKind = <T>(kind: SettleKind, fn: () => T): T =>
  settleKindStore.run(kind, fn);
export const currentSettleKind = (): SettleKind => settleKindStore.getStore() ?? 'tool';

// The facilitator client records these two metrics without knowing what it settles: the `kind`
// label is injected here from the async context, so the facilitator code stays untouched.
const inc0 = x402LocalSettleTotal.inc.bind(x402LocalSettleTotal) as (l: object) => void;
(x402LocalSettleTotal as unknown as { inc: (l: object) => void }).inc = (l) =>
  inc0({ kind: currentSettleKind(), ...l });
const observe0 = x402LocalSettleDurationSeconds.observe.bind(x402LocalSettleDurationSeconds) as (
  l: object,
  v: number,
) => void;
(x402LocalSettleDurationSeconds as unknown as { observe: (l: object, v: number) => void }).observe =
  (l, v) => observe0({ kind: currentSettleKind(), ...l }, v);

/** T-0552: targeted authorizationState reads after a failed shop settle (S8). */
export const shopFailedAuthorizationChecksTotal = new client.Counter({
  name: 'shop_failed_authorization_checks_total',
  help: 'Outcome of the on-chain check of a failed shop settle: used (it landed), dead (expired unused), rpc_error',
  labelNames: ['outcome'] as const, // 'used' | 'dead' | 'rpc_error'
  registers: [register],
});

export const x402OperatorEthBalance = new client.Gauge({
  name: 'x402_operator_eth_balance',
  help: 'x402 operator wallet ETH balance on Base (units: ETH, not wei)',
  registers: [register],
});

export const x402OperatorLockWaitSeconds = new client.Histogram({
  name: 'x402_operator_lock_wait_seconds',
  help: 'Time spent waiting to acquire the per-operator settle lock',
  buckets: [0.001, 0.01, 0.1, 0.5, 1, 5, 30],
  registers: [register],
});

// ---------------------------------------------------------------------------
// T-0553 refund payout engine
// ---------------------------------------------------------------------------
export const refundLedgerOwedUsd = new client.Gauge({
  name: 'refund_ledger_owed_usd',
  help: 'USD owed to payers in refund_ledger (status owed)',
  labelNames: ['rail'] as const,
  registers: [register],
});
export const refundLedgerOwedRows = new client.Gauge({
  name: 'refund_ledger_owed_rows',
  help: 'refund_ledger rows by rail and status',
  labelNames: ['rail', 'status'] as const,
  registers: [register],
});
export const refundWalletBalanceUsd = new client.Gauge({
  name: 'refund_wallet_balance_usd',
  help: 'Stable-coin balance of the refund wallet per rail',
  labelNames: ['rail'] as const,
  registers: [register],
});
export const refundPayoutLastRunTimestamp = new client.Gauge({
  name: 'refund_payout_last_run_timestamp',
  help: 'Unix time of the last completed refund payout run',
  registers: [register],
});
export const refundPayoutsTotal = new client.Counter({
  name: 'refund_payouts_total',
  help: 'Refund payouts by rail and result (sent|failed|expired)',
  labelNames: ['rail', 'result'] as const,
  registers: [register],
});
export const refundPayoutFeeUsd = new client.Histogram({
  name: 'refund_payout_fee_usd',
  help: 'Live fee estimate of one refund payout, USD',
  labelNames: ['rail'] as const,
  buckets: [0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05, 0.1, 0.5],
  registers: [register],
});
export const refundAlertsTotal = new client.Counter({
  name: 'refund_alerts_total',
  help: 'Refund engine alerts by kind (refund_recipient_mismatch, refund_wallet_key_mismatch, ...)',
  labelNames: ['kind', 'rail'] as const,
  registers: [register],
});
