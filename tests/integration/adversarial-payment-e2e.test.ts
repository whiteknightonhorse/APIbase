/**
 * F1 closing requirement: an adversarial end-to-end sweep over all THREE real
 * entry points (REST /execute, REST /batch, MCP tool calls) — not another
 * stage-level unit test. escrow-payment-replay.test.ts and
 * escrow-x402-binding.test.ts already prove ESCROW's own logic in isolation;
 * this file proves the same guarantees survive through the actual production
 * code each entry point runs, with a call-counter on the (mocked) upstream
 * provider that MUST read exactly 0 for every adversarial case:
 *
 *   - no payment at all
 *   - the same signed payment replayed (two parallel duplicates)
 *   - wrong amount (facilitator value_mismatch)
 *   - wrong network (facilitator network_mismatch)
 *   - expired validBefore (facilitator authorization_expired)
 *
 * Real production code under test (NOT reimplemented here):
 *   - src/routes/execute.router.ts   — via its actual Express handler
 *   - src/services/batch.service.ts  — via the real runBatch()
 *   - src/mcp/tool-adapter.ts        — via the real registerTools()
 * All three converge on the real runPipeline() / 14 real stages. Only true
 * infra boundaries are mocked: Postgres (prisma), Redis (a real in-memory
 * fake backing the REAL cache/idempotency/payment-nonce services — so the
 * actual replay-guard and cache logic run, not a stub of them), the x402
 * facilitator, and the upstream provider adapter (the thing being counted).
 *
 * Scope boundary, confirmed by reading the real code (not assumed): batch
 * calls (BatchCallInput, src/adapters/platform/types.ts) carry NO payment
 * header field at all — batch is balance-only, by construction. So the
 * amount/network/expiry/replay-of-a-signed-payment scenarios do not apply to
 * batch; its adversarial coverage here is "no funds" and "duplicate call
 * inside one batch", the two adversarial shapes that actually exist for it.
 */

// ---------------------------------------------------------------------------
// Mocks — infra boundaries only. Every pipeline stage runs for real.
// ---------------------------------------------------------------------------

jest.mock('../../src/config/index', () => ({
  config: {
    X402_NETWORK: 'base',
    X402_PAYMENT_ADDRESS: '0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480',
    X402_FACILITATOR_URL: 'https://facilitator.example',
    X402_FACILITATOR_MODE: 'local',
    X402_OPERATOR_PRIVATE_KEY: '0x00',
    X402_BASE_RPC_URL: 'https://base.example',
    X402_BASE_SEPOLIA_RPC_URL: 'https://sepolia.example',
    X402_OPERATOR_MIN_ETH_BALANCE: 0.01,
    REDIS_URL: 'redis://unused.example',
  },
}));

jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// --- Auth: one fixed active/paid agent behind any Bearer key used below ---
const TEST_AGENT = { agent_id: 'agent-adversarial-1', tier: 'paid', status: 'active' };
jest.mock('../../src/services/prisma.service', () => ({
  getPrisma: () => ({
    agent: { findUnique: jest.fn().mockResolvedValue(TEST_AGENT) },
    outbox: { create: jest.fn().mockResolvedValue({ id: 1n }) },
  }),
}));

// --- Redis: a real in-memory fake (GET/SET EX/NX/DEL) backing the REAL
// cache.service / idempotency.service / payment-nonce.service, so the actual
// replay-guard and single-flight logic run against real code, not a stub of
// it. Cleared between tests so cache state never leaks across scenarios.
function createFakeRedis() {
  const store = new Map<string, { value: string; expiry: number }>();
  return {
    async get(key: string): Promise<string | null> {
      const e = store.get(key);
      if (!e) return null;
      if (e.expiry !== Infinity && e.expiry < Date.now()) {
        store.delete(key);
        return null;
      }
      return e.value;
    },
    async set(key: string, value: string, ...args: unknown[]): Promise<'OK' | null> {
      const now = Date.now();
      const existing = store.get(key);
      const alive =
        existing !== undefined && (existing.expiry === Infinity || existing.expiry > now);
      const nx = args.includes('NX');
      if (alive && nx) return null;
      const exIdx = args.indexOf('EX');
      const ttlSeconds = exIdx >= 0 ? Number(args[exIdx + 1]) : undefined;
      store.set(key, { value, expiry: ttlSeconds ? now + ttlSeconds * 1000 : Infinity });
      return 'OK';
    },
    async del(key: string): Promise<number> {
      return store.delete(key) ? 1 : 0;
    },
    async exists(key: string): Promise<number> {
      const e = store.get(key);
      if (!e) return 0;
      if (e.expiry !== Infinity && e.expiry < Date.now()) {
        store.delete(key);
        return 0;
      }
      return 1;
    },
    __reset() {
      store.clear();
    },
  };
}
const fakeRedis = createFakeRedis();
jest.mock('../../src/services/redis.service', () => ({
  ensureRedisConnected: async () => fakeRedis,
  getSharedRedis: () => fakeRedis,
}));

// --- Rate limiting is not what this suite tests; always allow. ---
jest.mock('../../src/services/rate-limit.service', () => ({
  checkRateLimit: jest
    .fn()
    .mockResolvedValue({ allowed: true, remaining: 99, limit: 100, retryAfterSecs: 0 }),
}));

// --- Balance escrow (BATCH's payment rail) ---
const mockReserve = jest.fn();
jest.mock('../../src/services/escrow.service', () => ({
  reserve: (...args: unknown[]) => mockReserve(...args),
  finalize: jest.fn().mockResolvedValue(1),
  refund: jest.fn().mockResolvedValue(1),
  InsufficientFundsError: class InsufficientFundsError extends Error {},
}));

// --- Ledger writes (real DB) — not under test here ---
jest.mock('../../src/services/ledger.service', () => ({
  writeDirectCharge: jest.fn().mockResolvedValue(0),
  writeFreeEntry: jest.fn().mockResolvedValue(undefined),
  writeSharedEntry: jest.fn().mockResolvedValue(undefined),
  writeX402Entry: jest.fn().mockResolvedValue(undefined),
  CACHE_HIT_COST_MULTIPLIER: 0.1,
}));

// --- x402 settle (post-success, best-effort) — not under test here ---
jest.mock('../../src/pipeline/stages/x402-settle', () => ({
  settleX402: jest.fn().mockResolvedValue(undefined),
  recordSettleFailure: jest.fn().mockResolvedValue(undefined),
}));

// --- MPP challenge-header builder used only on execute.router's 402 path ---
jest.mock('../../src/middleware/mpp.middleware', () => ({
  buildMppChallengeHeader: jest.fn().mockResolvedValue(null),
}));

// --- x402 payload decode: nonce + validBefore are encoded directly into the
// header string as "<nonce>::<validBefore>" so each test controls them
// without a real signature (same convention as escrow-payment-replay.test.ts:
// "the nonce is derived 1:1 from the raw header value").
const RECEIVER = '0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480';
jest.mock('@x402/core/http', () => ({
  decodePaymentSignatureHeader: jest.fn((header: string) => ({ header })),
}));
jest.mock('@x402/core/schemas', () => ({
  parsePaymentPayload: jest.fn((decoded: { header: string }) => {
    const [nonce, validBefore] = decoded.header.split('::');
    return {
      success: true,
      data: {
        accepted: {},
        payload: {
          authorization: {
            from: '0xPAYER',
            to: RECEIVER,
            value: '250000',
            validAfter: '0',
            validBefore,
            nonce,
          },
        },
      },
    };
  }),
}));

// --- The x402 facilitator verify call — controlled per test. ---
const mockVerify = jest.fn();
jest.mock('../../src/services/x402-server.service', () => ({
  getSharedResourceServer: () => ({ verifyPayment: mockVerify }),
}));

// --- The thing being counted: the upstream provider adapter. ---
const mockAdapterCall = jest.fn();
jest.mock('../../src/adapters/registry', () => ({
  resolveAdapter: jest.fn(() => ({ call: (...a: unknown[]) => mockAdapterCall(...a) })),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks) — real production code.
// ---------------------------------------------------------------------------

import { executeRouter } from '../../src/routes/execute.router';
import { runBatch } from '../../src/services/batch.service';
import { registerTools, type PaymentContext } from '../../src/mcp/tool-adapter';
import {
  __setToolCacheEntryForTest,
  __deleteToolCacheEntryForTest,
} from '../../src/pipeline/stages/tool-status.stage';

const TOOL_ID = 'telnyx.send_sms_premium';
const MCP_NAME = 'phone.telnyx.sms_premium'; // real mcpName for TOOL_ID (tool-definitions.ts)
const PRICE = 0.25;
const VALID_PARAMS = { to: '+15551234567', from: '+15557654321', text: 'hello' };
const API_KEY = 'ak_live_' + 'a'.repeat(32);

// escrow.service's InsufficientFundsError class, pulled off the mock factory
// above (2026-09-02 balance-rail fix) so tests can both throw it from
// mockReserve and instanceof-check it.
const { InsufficientFundsError: MockInsufficientFundsError } = jest.requireMock(
  '../../src/services/escrow.service',
) as { InsufficientFundsError: new (...a: unknown[]) => Error };

function futureEpoch(seconds = 60): number {
  return Math.floor(Date.now() / 1000) + seconds;
}
function pastEpoch(seconds = 60): number {
  return Math.floor(Date.now() / 1000) - seconds;
}

/** MPP credential header: `Payment <base64 JSON {challenge:{id, expires}}>` —
 * exactly what escrow.stage.ts's decodeMppChallenge() parses. */
function mppHeader(challengeId: string, expiresInSec = 60): string {
  const json = JSON.stringify({
    challenge: {
      id: challengeId,
      expires: new Date(Date.now() + expiresInSec * 1000).toISOString(),
    },
  });
  return `Payment ${Buffer.from(json).toString('base64')}`;
}

beforeAll(() => {
  __setToolCacheEntryForTest({
    tool_id: TOOL_ID,
    status: 'healthy',
    price_usd: PRICE,
    cache_ttl: 0,
    upstream_cost_usd: null,
  });
});
afterAll(() => {
  __deleteToolCacheEntryForTest(TOOL_ID);
});

beforeEach(() => {
  fakeRedis.__reset();
  mockAdapterCall.mockReset();
  mockAdapterCall.mockResolvedValue({
    status: 200,
    body: { ok: true },
    durationMs: 5,
    byteLength: 12,
  });
  mockVerify.mockReset();
  mockReserve.mockReset();
  // Default (2026-09-02 balance-rail fix): TEST_AGENT has no funded balance
  // unless a test says otherwise. Before the fix this branch was dead code
  // for every caller, so no test ever needed a default here; now that ESCROW
  // falls through to reserve() whenever no x402/MPP payment is presented,
  // every existing "no payment at all" test below reaches this mock too.
  // Rejecting by default keeps their outcome identical to before (clean
  // 402, provider never called) — real balance behavior is opted into
  // per-test via mockReserve.mockResolvedValue(...).
  mockReserve.mockRejectedValue(new MockInsufficientFundsError('agent-adversarial-1', PRICE));
});

// ---------------------------------------------------------------------------
// EXECUTE entry point — the real Express handler, invoked directly.
// ---------------------------------------------------------------------------

function fakeRes() {
  const res: {
    statusCode: number;
    _body: unknown;
    _headers: Record<string, string>;
    status: (c: number) => typeof res;
    json: (b: unknown) => typeof res;
    setHeader: (k: string, v: string) => void;
  } = {
    statusCode: 200,
    _body: undefined,
    _headers: {},
    status(c) {
      res.statusCode = c;
      return res;
    },
    json(b) {
      res._body = b;
      return res;
    },
    setHeader(k, v) {
      res._headers[k] = v;
    },
  };
  return res;
}

interface ExecuteCallOpts {
  requestId: string;
  x402?: { header: string; payer?: string };
  mpp?: { header: string; payer?: string };
  idempotencyKey?: string;
  params?: Record<string, unknown>;
}

async function callExecute(opts: ExecuteCallOpts): Promise<{ status: number; body: unknown }> {
  // Extract the real handler from the real Router — genuinely exercises
  // execute.router.ts, not a reimplementation of it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layer = (executeRouter as any).stack.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (l: any) => l.route && l.route.path === '/api/v1/tools/:toolId/call',
  );
  const handler = layer.route.stack[0].handle;

  const req = {
    headers: {
      authorization: `Bearer ${API_KEY}`,
      'x-request-id': opts.requestId,
    } as Record<string, string>,
    params: { toolId: TOOL_ID },
    body: opts.params ?? VALID_PARAMS,
    path: `/api/v1/tools/${TOOL_ID}/call`,
    originalUrl: `/api/v1/tools/${TOOL_ID}/call`,
    get: () => 'test.local',
    x402Payment: opts.x402
      ? {
          verified: true,
          payer: opts.x402.payer ?? 'pending',
          amount: '0',
          network: 'base',
          scheme: 'exact',
        }
      : undefined,
    mppPayment: opts.mpp
      ? {
          verified: true,
          payer: opts.mpp.payer ?? 'pending',
          amount: String(PRICE),
          txHash: '0xtest',
          method: 'tempo',
          header: opts.mpp.header,
        }
      : undefined,
  };
  if (opts.x402) req.headers['x-payment'] = opts.x402.header;
  if (opts.idempotencyKey) req.headers['x-idempotency-key'] = opts.idempotencyKey;

  const res = fakeRes();
  const next = (err?: unknown) => {
    if (err) throw err;
  };
  await handler(req, res, next);
  return { status: res.statusCode, body: res._body };
}

describe('EXECUTE entry point (/api/v1/tools/:toolId/call) — real router handler', () => {
  it('CONTROL: a genuinely valid x402 payment reaches the provider exactly once', async () => {
    mockVerify.mockResolvedValue({ isValid: true, payer: '0xPAYER' });
    const r = await callExecute({
      requestId: 'exec-control',
      x402: { header: `nonce-control::${futureEpoch()}` },
    });
    expect(r.status).toBe(200);
    expect(mockAdapterCall).toHaveBeenCalledTimes(1);
  });

  it('ADVERSARIAL: no payment at all → 402, provider never called', async () => {
    const r = await callExecute({ requestId: 'exec-no-pay' });
    expect(r.status).toBe(402);
    expect(mockAdapterCall).not.toHaveBeenCalled();
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('ADVERSARIAL: replayed nonce — two parallel identical signed payments yield exactly one 200 and one 402, provider called exactly once', async () => {
    mockVerify.mockResolvedValue({ isValid: true, payer: '0xPAYER' });
    const header = `nonce-replay-shared::${futureEpoch()}`;
    const [a, b] = await Promise.all([
      callExecute({ requestId: 'exec-replay-a', x402: { header } }),
      callExecute({ requestId: 'exec-replay-b', x402: { header } }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 402]);
    expect(mockAdapterCall).toHaveBeenCalledTimes(1);
  });

  it('ADVERSARIAL: wrong amount (facilitator value_mismatch) → 402, provider never called', async () => {
    mockVerify.mockResolvedValue({
      isValid: false,
      invalidReason: 'invalid_exact_evm_payload_authorization_value_mismatch',
    });
    const r = await callExecute({
      requestId: 'exec-wrong-amount',
      x402: { header: `nonce-wrong-amount::${futureEpoch()}` },
    });
    expect(r.status).toBe(402);
    expect(mockAdapterCall).not.toHaveBeenCalled();
  });

  it('ADVERSARIAL: wrong network (facilitator network_mismatch) → 402, provider never called', async () => {
    mockVerify.mockResolvedValue({ isValid: false, invalidReason: 'network_mismatch' });
    const r = await callExecute({
      requestId: 'exec-wrong-network',
      x402: { header: `nonce-wrong-network::${futureEpoch()}` },
    });
    expect(r.status).toBe(402);
    expect(mockAdapterCall).not.toHaveBeenCalled();
  });

  it('ADVERSARIAL: expired validBefore (facilitator authorization_expired) → 402, provider never called', async () => {
    mockVerify.mockResolvedValue({ isValid: false, invalidReason: 'authorization_expired' });
    const r = await callExecute({
      requestId: 'exec-expired',
      x402: { header: `nonce-expired::${pastEpoch()}` },
    });
    expect(r.status).toBe(402);
    expect(mockAdapterCall).not.toHaveBeenCalled();
  });

  it('ADVERSARIAL: MPP replay — two parallel identical MPP credentials yield exactly one success, provider called exactly once', async () => {
    const header = mppHeader('mpp-challenge-replay-exec');
    const [a, b] = await Promise.all([
      callExecute({ requestId: 'exec-mpp-replay-a', mpp: { header, payer: '0xMPP' } }),
      callExecute({ requestId: 'exec-mpp-replay-b', mpp: { header, payer: '0xMPP' } }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 402]);
    expect(mockAdapterCall).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// MCP entry point — the real registerTools(), invoked directly.
// ---------------------------------------------------------------------------

function makeFakeMcpServer() {
  const callbacks = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>();
  const server = {
    registerTool: (
      mcpName: string,
      _cfg: unknown,
      cb: (args: Record<string, unknown>) => Promise<unknown>,
    ) => {
      callbacks.set(mcpName, cb);
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { server: server as any, callbacks };
}

function fullPaymentCtx(overrides: Partial<PaymentContext> = {}): PaymentContext {
  return {
    x402Paid: false,
    x402Payer: null,
    x402PaymentHeader: null,
    mppPaid: false,
    mppPayer: null,
    mppMethod: null,
    mppPaymentHeader: null,
    mppTxHash: null,
    ...overrides,
  };
}

async function callMcpTool(
  requestId: string,
  paymentCtx: PaymentContext,
): Promise<{ isError: boolean; text: string }> {
  const { server, callbacks } = makeFakeMcpServer();
  registerTools(server, API_KEY, requestId, paymentCtx);
  const cb = callbacks.get(MCP_NAME);
  if (!cb) throw new Error(`MCP tool ${MCP_NAME} was not registered — check tool cache seed`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (await cb(VALID_PARAMS)) as any;
  return { isError: !!result.isError, text: result.content[0].text as string };
}

describe('MCP entry point (registerTools callback) — real tool-adapter code', () => {
  it('CONTROL: a genuinely valid MPP payment reaches the provider exactly once', async () => {
    const r = await callMcpTool(
      'mcp-control',
      fullPaymentCtx({
        mppPaid: true,
        mppPayer: '0xMCPPAYER',
        mppPaymentHeader: mppHeader('mcp-control-challenge'),
      }),
    );
    expect(r.isError).toBe(false);
    expect(mockAdapterCall).toHaveBeenCalledTimes(1);
  });

  it('ADVERSARIAL: no payment at all → error response, provider never called', async () => {
    const r = await callMcpTool('mcp-no-pay', fullPaymentCtx());
    expect(r.isError).toBe(true);
    expect(mockAdapterCall).not.toHaveBeenCalled();
  });

  it('ADVERSARIAL: MPP replay via MCP — two parallel identical credentials yield exactly one success, provider called exactly once', async () => {
    const header = mppHeader('mcp-replay-challenge');
    const [a, b] = await Promise.all([
      callMcpTool(
        'mcp-replay-a',
        fullPaymentCtx({ mppPaid: true, mppPayer: '0xMPP', mppPaymentHeader: header }),
      ),
      callMcpTool(
        'mcp-replay-b',
        fullPaymentCtx({ mppPaid: true, mppPayer: '0xMPP', mppPaymentHeader: header }),
      ),
    ]);
    const errors = [a.isError, b.isError].sort();
    expect(errors).toEqual([false, true]);
    expect(mockAdapterCall).toHaveBeenCalledTimes(1);
  });

  it('ADVERSARIAL: wrong amount via MCP (facilitator value_mismatch) → error, provider never called — proves binding is enforced on the MCP path too, not just REST', async () => {
    mockVerify.mockResolvedValue({
      isValid: false,
      invalidReason: 'invalid_exact_evm_payload_authorization_value_mismatch',
    });
    const r = await callMcpTool(
      'mcp-wrong-amount',
      fullPaymentCtx({ x402Paid: true, x402PaymentHeader: `mcp-wrong-amount::${futureEpoch()}` }),
    );
    expect(r.isError).toBe(true);
    expect(mockAdapterCall).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// BATCH entry point — the real runBatch(), invoked directly.
// Balance-only rail (BatchCallInput has no payment-header field at all — the
// only adversarial shapes that exist for batch are "no funds" and "duplicate
// call inside one batch"; amount/network/expiry/nonce-replay of a SIGNED
// payment do not apply here, there is nothing to sign).
// ---------------------------------------------------------------------------

describe('BATCH entry point (runBatch) — real batch.service code', () => {
  /**
   * FIXED 2026-09-02 (was a FINDING, reported-not-fixed, 2026-09-01 —
   * Fable's C-1 verdict): the root cause was never batch-specific.
   * escrow.stage.ts required ctx.x402Paid or ctx.mppPaid to be true for ANY
   * cache-miss paid-tool call, but the reserve()-from-balance branch below
   * that check was structurally unreachable for every entry point (whoever
   * reached it must already have returned earlier via the x402Paid/mppPaid
   * branches) — batch just had no other way to set either flag, so it was
   * the one caller that could ever exercise the dead branch. Fixed at the
   * one place all callers share (escrow.stage.ts's fund-source resolution);
   * batch inherits the balance rail for free, with zero batch-specific code.
   */
  it('a batch call to a priced tool with balance and no signed payment now succeeds on a cache MISS', async () => {
    mockReserve.mockResolvedValue({ executionId: 'exec-1', amount: PRICE, createdAt: new Date() });
    const result = await runBatch({
      authHeader: `Bearer ${API_KEY}`,
      parentRequestId: 'batch-balance-gap',
      calls: [{ tool_id: TOOL_ID, params: VALID_PARAMS }],
      maxParallel: 5,
    });
    expect(result.results[0].status).toBe('success');
    expect(result.results[0].cost_usd).toBe(PRICE);
    expect(mockReserve).toHaveBeenCalledWith(
      'agent-adversarial-1',
      TOOL_ID,
      PRICE,
      expect.any(String),
      undefined,
    );
    expect(mockAdapterCall).toHaveBeenCalledTimes(1);
  });

  it('ADVERSARIAL: no funds — reserve() is now reached (and correctly rejected) for every item, provider never called', async () => {
    mockReserve.mockRejectedValue(new MockInsufficientFundsError('agent-adversarial-1', PRICE));
    const result = await runBatch({
      authHeader: `Bearer ${API_KEY}`,
      parentRequestId: 'batch-no-funds',
      calls: [
        { tool_id: TOOL_ID, params: { ...VALID_PARAMS, to: '+15550000001' } },
        { tool_id: TOOL_ID, params: { ...VALID_PARAMS, to: '+15550000002' } },
      ],
      maxParallel: 5,
    });
    expect(result.results.every((r) => r.status === 'error')).toBe(true);
    expect(result.results.every((r) => /balance/i.test(r.error ?? ''))).toBe(true);
    expect(mockAdapterCall).not.toHaveBeenCalled();
    // Fixed 2026-09-02: reserve() is the balance rail's entry point now, so
    // an insufficient-balance batch item actually attempts it (and is
    // correctly turned away by it) instead of never reaching it at all.
    expect(mockReserve).toHaveBeenCalledTimes(2);
  });

  it('FIXED: item 1 has enough balance and succeeds, item 2 does not and fails independently — item 1 is unaffected (Fable ШАГ 1 test contract #3)', async () => {
    mockReserve
      .mockResolvedValueOnce({ executionId: 'exec-ok', amount: PRICE, createdAt: new Date() })
      .mockRejectedValueOnce(new MockInsufficientFundsError('agent-adversarial-1', PRICE));
    const result = await runBatch({
      authHeader: `Bearer ${API_KEY}`,
      parentRequestId: 'batch-partial',
      calls: [
        { tool_id: TOOL_ID, params: { ...VALID_PARAMS, to: '+15550000010' } },
        { tool_id: TOOL_ID, params: { ...VALID_PARAMS, to: '+15550000011' } },
      ],
      maxParallel: 1, // sequential — item 1's reserve() call is guaranteed to happen before item 2's
    });
    expect(result.results[0].status).toBe('success');
    expect(result.results[0].cost_usd).toBe(PRICE);
    expect(result.results[1].status).toBe('error');
    expect(result.results[1].error).toMatch(/balance/i);
    expect(mockAdapterCall).toHaveBeenCalledTimes(1);
  });

  /**
   * SECOND FINDING, hit while writing this suite: two batch calls with
   * IDENTICAL toolId+params, run concurrently (maxParallel >= 2), collide in
   * CACHE_OR_SINGLE_FLIGHT — the second becomes a waiter polling
   * waitForResult() for up to 25 real seconds. cache.stage.ts's waiter loop
   * polls the CACHE VALUE, not the lock; when the lock owner fails before
   * ever producing a cacheable response (as here — both hit the 402 above),
   * the waiter has no way to learn that early and must poll the FULL 25s
   * before promoting itself and retrying from scratch. That is a real
   * latency/availability gap for legitimate concurrent duplicate requests to
   * a failing tool (e.g. a client's own network-retry), not something to fix
   * inside this suite — flagged, not patched.
   */
  it('ADVERSARIAL: two duplicate calls sharing one idempotency_key inside a batch, processed sequentially (maxParallel:1, to stay clear of the single-flight finding above) — the second never reaches the provider', async () => {
    mockReserve.mockResolvedValue({
      executionId: 'exec-dup',
      amount: PRICE,
      createdAt: new Date(),
    });
    const result = await runBatch({
      authHeader: `Bearer ${API_KEY}`,
      parentRequestId: 'batch-dup',
      calls: [
        {
          tool_id: TOOL_ID,
          params: { ...VALID_PARAMS, to: '+15550000003' },
          idempotency_key: 'shared-key-1',
        },
        {
          tool_id: TOOL_ID,
          params: { ...VALID_PARAMS, to: '+15550000003' },
          idempotency_key: 'shared-key-1',
        },
      ],
      maxParallel: 1,
    });
    // Fixed 2026-09-02: item 1 now actually succeeds (reserve() funds it)
    // instead of both 402ing at ESCROW as before — but the point of this
    // test is still IDEMPOTENCY dedup, not payment: the second call must be
    // rejected as a duplicate of the first, never independently re-attempting
    // reserve() or the provider call.
    expect(result.results).toHaveLength(2);
    expect(result.results[1].error).toMatch(/in progress/i);
    expect(mockAdapterCall).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// NEW (2026-09-02) — Fable ШАГ 1 test contract: the balance fund-source
// branch in escrow.stage.ts, covered directly at the REST/MCP entry points
// (BATCH's own coverage is above — it needed zero new code, only the fix).
// Items (1) REST, (2) MCP, (3) batch partial success/failure (above),
// (4) CONTROL insufficient balance, (5) RACE, are each its own test below.
// Item (6) regression (x402/MPP byte-for-byte unchanged) is proven by every
// pre-existing EXECUTE/MCP describe block above staying green untouched —
// none of those branches were touched by this fix.
// ---------------------------------------------------------------------------

describe('BALANCE ESCROW — authenticated agent, no signed payment (Fable fix, 2026-09-02)', () => {
  it('(1) REST /execute: single call, sufficient balance, cache MISS, no x402/MPP → 200 with PAID billing and cost in response', async () => {
    mockReserve.mockResolvedValue({
      executionId: 'exec-rest-bal',
      amount: PRICE,
      createdAt: new Date(),
    });
    const r = await callExecute({ requestId: 'exec-balance-ok' });
    expect(r.status).toBe(200);
    const body = r.body as { metadata: { billing_status: string; cost_usd: number } };
    expect(body.metadata.billing_status).toBe('PAID');
    expect(body.metadata.cost_usd).toBe(PRICE);
    expect(mockReserve).toHaveBeenCalledTimes(1);
    expect(mockAdapterCall).toHaveBeenCalledTimes(1);
  });

  it('(2) MCP: the same fund-source resolution reaches the provider through the real registerTools() callback', async () => {
    mockReserve.mockResolvedValue({
      executionId: 'exec-mcp-bal',
      amount: PRICE,
      createdAt: new Date(),
    });
    const r = await callMcpTool('mcp-balance-ok', fullPaymentCtx());
    expect(r.isError).toBe(false);
    expect(mockReserve).toHaveBeenCalledTimes(1);
    expect(mockAdapterCall).toHaveBeenCalledTimes(1);
  });

  // (3) batch partial success/failure — see the BATCH describe block above
  // ("item 1 has enough balance and succeeds, item 2 does not...").

  it('(4) CONTROL: insufficient balance still 402s on REST /execute — proves the fix does not remove the rejection, only relocates its trigger', async () => {
    mockReserve.mockRejectedValue(new MockInsufficientFundsError('agent-adversarial-1', PRICE));
    const r = await callExecute({ requestId: 'exec-balance-insufficient' });
    expect(r.status).toBe(402);
    expect(mockAdapterCall).not.toHaveBeenCalled();
  });

  it('(5) RACE: two parallel REST calls (distinct params, so neither collides in CACHE_OR_SINGLE_FLIGHT — see the pre-existing BATCH "no funds" test for the same precaution), balance sufficient for exactly one → exactly one 200, one 402', async () => {
    mockReserve
      .mockResolvedValueOnce({
        executionId: 'exec-race-winner',
        amount: PRICE,
        createdAt: new Date(),
      })
      .mockRejectedValueOnce(new MockInsufficientFundsError('agent-adversarial-1', PRICE));
    const [a, b] = await Promise.all([
      callExecute({ requestId: 'exec-race-a', params: { ...VALID_PARAMS, to: '+15550000020' } }),
      callExecute({ requestId: 'exec-race-b', params: { ...VALID_PARAMS, to: '+15550000021' } }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 402]);
    expect(mockReserve).toHaveBeenCalledTimes(2);
    expect(mockAdapterCall).toHaveBeenCalledTimes(1);
    // This proves the STAGE correctly serializes on whatever reserve()
    // decides. The REAL atomic guarantee (`UPDATE accounts SET balance_usd
    // = balance_usd - $1 WHERE balance_usd >= $1`, escrow.service.ts,
    // deliberately untouched by this fix) can only be proven against a real
    // Postgres row lock — proven live against production as part of the
    // ШАГ 3 synthetic-probe pass (two parallel probes on one funded balance,
    // exactly one reserves), not mockable meaningfully at this level.
  });

  it('IDEMPOTENCY: a replayed key on the balance rail does not double-debit — the retry gets the identical cached response, reserve() is called only once', async () => {
    mockReserve.mockResolvedValue({
      executionId: 'exec-idem-bal',
      amount: PRICE,
      createdAt: new Date(),
    });
    const first = await callExecute({
      requestId: 'exec-idem-1',
      idempotencyKey: 'balance-replay-key-1',
    });
    const second = await callExecute({
      requestId: 'exec-idem-2',
      idempotencyKey: 'balance-replay-key-1',
    });
    expect(first.status).toBe(200);
    expect(mockAdapterCall).toHaveBeenCalledTimes(1);
    // The retry must not independently re-attempt the balance debit — it
    // gets IDEMPOTENCY's own cached replay of the first call's response
    // (same 200), never a fresh reserve() call.
    expect(mockReserve).toHaveBeenCalledTimes(1);
    expect(second.status).toBe(200);
  });

  it('BOUNDARY: zero and negative tool price never call reserve() — a free (or malformed-price) tool skips escrow entirely, unaffected by this fix', async () => {
    __setToolCacheEntryForTest({
      tool_id: 'zero-price.test-tool',
      status: 'healthy',
      price_usd: 0,
      cache_ttl: 0,
      upstream_cost_usd: null,
    });
    __setToolCacheEntryForTest({
      tool_id: 'negative-price.test-tool',
      status: 'healthy',
      price_usd: -5,
      cache_ttl: 0,
      upstream_cost_usd: null,
    });
    try {
      mockReserve.mockResolvedValue({
        executionId: 'should-not-happen',
        amount: 0,
        createdAt: new Date(),
      });

      const layer = (
        executeRouter as unknown as {
          stack: Array<{
            route?: {
              path: string;
              stack: Array<{
                handle: (req: unknown, res: unknown, next: (e?: unknown) => void) => Promise<void>;
              }>;
            };
          }>;
        }
      ).stack.find((l) => l.route && l.route.path === '/api/v1/tools/:toolId/call');
      const handler = layer!.route!.stack[0].handle;

      async function callTool(toolId: string, requestId: string) {
        const req = {
          headers: { authorization: `Bearer ${API_KEY}`, 'x-request-id': requestId } as Record<
            string,
            string
          >,
          params: { toolId },
          body: VALID_PARAMS,
          path: `/api/v1/tools/${toolId}/call`,
          originalUrl: `/api/v1/tools/${toolId}/call`,
          get: () => 'test.local',
        };
        const res = fakeRes();
        await handler(req, res, (e?: unknown) => {
          if (e) throw e;
        });
        return { status: res.statusCode, body: res._body };
      }

      const zero = await callTool('zero-price.test-tool', 'exec-zero-price');
      const negative = await callTool('negative-price.test-tool', 'exec-negative-price');

      expect(zero.status).toBe(200);
      expect(negative.status).toBe(200);
      expect(mockReserve).not.toHaveBeenCalled();
    } finally {
      __deleteToolCacheEntryForTest('zero-price.test-tool');
      __deleteToolCacheEntryForTest('negative-price.test-tool');
    }
  });
});
