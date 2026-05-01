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
// MCP session metrics
// ---------------------------------------------------------------------------

export const mcpSessionsActive = new client.Gauge({
  name: 'mcp_sessions_active',
  help: 'Number of active MCP sessions',
  registers: [register],
});

// ---------------------------------------------------------------------------
// x402 self-hosted facilitator metrics (X402_FACILITATOR_MODE=local)
// ---------------------------------------------------------------------------

export const x402LocalSettleTotal = new client.Counter({
  name: 'x402_local_settle_total',
  help: 'Total x402 local-facilitator settle attempts',
  labelNames: ['result'] as const, // 'success' | 'fallback' | 'error'
  registers: [register],
});

export const x402LocalSettleDurationSeconds = new client.Histogram({
  name: 'x402_local_settle_duration_seconds',
  help: 'x402 local-facilitator settle duration in seconds, by outcome',
  // Sub-second buckets to capture future fire-and-forget optimization wins;
  // upper buckets to detect chain-finality slowdowns.
  buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
  labelNames: ['result'] as const, // 'success' | 'fallback' | 'error'
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
