/**
 * T-0526: x402 dedup window + x-apibase-volatile canonical params + `_meta` idempotency key on /mcp.
 * Same verified payer + same cache key within DEDUP_WINDOW_SECONDS -> no nonce claim, no settle,
 * charged:false. Shop tools, other payers, expired windows, Redis trouble and MPP stay charged.
 */
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
  },
}));
jest.mock('../../src/services/escrow.service', () => ({
  reserve: jest.fn(),
  InsufficientFundsError: class InsufficientFundsError extends Error {},
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('@x402/core/http', () => ({
  decodePaymentSignatureHeader: jest.fn(() => ({ decoded: true })),
}));
jest.mock('@x402/core/schemas', () => ({
  parsePaymentPayload: jest.fn(() => ({
    success: true,
    data: {
      accepted: {},
      payload: {
        authorization: {
          from: '0xCLAIMED',
          to: '0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480',
          value: '250000',
          validAfter: '0',
          validBefore: String(Math.floor(Date.now() / 1000) + 60),
          nonce: '0xnonce-dedup-test',
        },
      },
    },
  })),
}));
const mockClaim = jest.fn().mockResolvedValue(true);
jest.mock('../../src/services/payment-nonce.service', () => ({
  claimPaymentNonce: (...a: unknown[]) => mockClaim(...a),
}));
const mockVerify = jest.fn();
jest.mock('../../src/services/x402-server.service', () => ({
  getSharedResourceServer: () => ({ verifyPayment: mockVerify }),
}));

// Fake Redis: Map store, records the TTL of every SET.
const store = new Map<string, string>();
const setCalls: Array<{ key: string; value: string; ttl: unknown }> = [];
let redisDown = false;
jest.mock('../../src/services/redis.service', () => ({
  ensureRedisConnected: async () => {
    if (redisDown) throw new Error('redis down');
    return {
      get: async (k: string) => store.get(k) ?? null,
      set: async (k: string, v: string, _ex: string, ttl: unknown) => {
        setCalls.push({ key: k, value: v, ttl });
        store.set(k, v);
        return 'OK';
      },
    };
  },
}));
const mockRun = jest.fn();
jest.mock('../../src/pipeline/pipeline', () => ({ runPipeline: (c: unknown) => mockRun(c) }));
const mockSettle = jest.fn().mockResolvedValue(undefined);
jest.mock('../../src/pipeline/stages/x402-settle', () => ({
  settleX402: (...a: unknown[]) => mockSettle(...a),
}));

import { escrowStage } from '../../src/pipeline/stages/escrow.stage';
import { escrowFinalizeStage } from '../../src/pipeline/stages/escrow-finalize.stage';
import {
  DEDUP_WINDOW_SECONDS,
  dedupKey,
  recordDedupAfterCharge,
  resetDedupWarning,
  canonicalParams,
  generateCacheKey,
  VOLATILE_KEYWORD,
} from '../../src/services/cache.service';
import { zodToJsonSchema, markVolatile } from '../../src/utils/zod-to-json-schema';
import { z } from 'zod';
import type { PipelineContext } from '../../src/pipeline/types';
import { registerTools } from '../../src/mcp/tool-adapter';
import { TOOL_DEFINITIONS } from '../../src/mcp/tool-definitions';

const CACHE_KEY = 'cache:weather.current:abc';
const PAYER = '0xPayerOne';

function ctx(over: Partial<PipelineContext> = {}): PipelineContext {
  return {
    requestId: 'req-1',
    toolId: 'weather.current',
    toolPrice: 0.25,
    toolCacheTtl: 300,
    cacheHit: true,
    cacheKey: CACHE_KEY,
    x402Paid: true,
    x402PaymentHeader: 'header-abc',
    ...over,
  } as unknown as PipelineContext;
}

beforeEach(() => {
  store.clear();
  setCalls.length = 0;
  redisDown = false;
  mockVerify.mockReset();
  mockVerify.mockResolvedValue({ isValid: true, payer: PAYER });
  mockClaim.mockClear();
  mockSettle.mockClear();
  resetDedupWarning();
});

describe('x402 dedup window (T-0526)', () => {
  it('window constant is 120 s', () => {
    expect(DEDUP_WINDOW_SECONDS).toBe(120);
  });

  it('a charged call sets dedup:x402:{payer}:{cacheKey} with EX 120 and the receipt id', async () => {
    const c = ctx({
      billingStatus: 'PAID',
      x402SettleSucceeded: true,
      x402Payer: PAYER,
      cacheHit: false,
    });
    await recordDedupAfterCharge(c, 'rcpt_1');
    expect(setCalls).toEqual([{ key: dedupKey(PAYER, CACHE_KEY), value: 'rcpt_1', ttl: 120 }]);
    expect(setCalls[0].key).toBe(`dedup:x402:${PAYER.toLowerCase()}:${CACHE_KEY}`);
  });

  it('settlement_pending also opens the window; no receipt stores "-"', async () => {
    await recordDedupAfterCharge(
      ctx({ billingStatus: 'PAID', x402SettleState: 'pending', x402Payer: PAYER }),
    );
    expect(setCalls[0].value).toBe('-');
  });

  it('writes nothing for failed settle, non-cacheable tools, shop tools, MPP or balance', async () => {
    const base = { billingStatus: 'PAID', x402SettleSucceeded: true, x402Payer: PAYER };
    await recordDedupAfterCharge(ctx({ ...base, x402SettleSucceeded: false }));
    await recordDedupAfterCharge(ctx({ ...base, toolCacheTtl: 0 }));
    await recordDedupAfterCharge(ctx({ ...base, toolId: 'shop.quote' }));
    await recordDedupAfterCharge(ctx({ ...base, x402Paid: false, mppPaid: true }));
    await recordDedupAfterCharge(ctx({ ...base, x402Paid: false }));
    await recordDedupAfterCharge(ctx({ ...base, dedupHit: { receiptId: 'r' } }));
    expect(setCalls).toHaveLength(0);
  });

  it('second identical call by the same payer: no nonce claim, no settle, charged:false, original receipt', async () => {
    store.set(dedupKey(PAYER, CACHE_KEY), 'rcpt_orig');
    const c = ctx();
    const res = await escrowStage.execute(c);
    expect(res.ok).toBe(true);
    expect(c.dedupHit).toEqual({ receiptId: 'rcpt_orig' });
    expect(c.charged).toBe(false);
    expect(mockClaim).not.toHaveBeenCalled();

    const fin = await escrowFinalizeStage.execute(c);
    expect(fin.ok).toBe(true);
    expect(mockSettle).not.toHaveBeenCalled();
    expect(c.billingStatus).toBe('NOT_CHARGED');
    expect(c.notChargedReason).toBe('dedup_hit');
    expect(c.finalCost).toBe(0);
  });

  it('uses the facilitator-verified payer, never authorization.from', async () => {
    // Entry exists for the CLAIMED wallet only; verified payer differs -> charged.
    store.set(dedupKey('0xCLAIMED', CACHE_KEY), 'rcpt_orig');
    const c = ctx();
    await escrowStage.execute(c);
    expect(c.dedupHit).toBeUndefined();
    expect(mockClaim).toHaveBeenCalledTimes(1);
  });

  it('a payload whose authorization.from matches a recent payer but fails verify is rejected, not served', async () => {
    store.set(dedupKey('0xCLAIMED', CACHE_KEY), 'rcpt_orig');
    mockVerify.mockResolvedValue({ isValid: false, invalidReason: 'invalid_signature' });
    const c = ctx();
    const res = await escrowStage.execute(c);
    expect(res.ok).toBe(false);
    expect(c.dedupHit).toBeUndefined();
  });

  it('different payer, same arguments: charged', async () => {
    store.set(dedupKey('0xSomeoneElse', CACHE_KEY), 'rcpt_orig');
    const c = ctx();
    await escrowStage.execute(c);
    expect(c.dedupHit).toBeUndefined();
    expect(mockClaim).toHaveBeenCalledTimes(1);
  });

  it('shop.quote is never dedup-ed', async () => {
    store.set(dedupKey(PAYER, CACHE_KEY), 'rcpt_orig');
    const c = ctx({ toolId: 'shop.quote' });
    await escrowStage.execute(c);
    expect(c.dedupHit).toBeUndefined();
  });

  it('window expired (no key): charged', async () => {
    const c = ctx();
    await escrowStage.execute(c);
    expect(c.dedupHit).toBeUndefined();
    expect(mockClaim).toHaveBeenCalledTimes(1);
  });

  it('cache miss: charged even with a key present', async () => {
    store.set(dedupKey(PAYER, CACHE_KEY), 'rcpt_orig');
    const c = ctx({ cacheHit: false });
    await escrowStage.execute(c);
    expect(c.dedupHit).toBeUndefined();
  });

  it('Redis down: charged', async () => {
    redisDown = true;
    const c = ctx();
    const res = await escrowStage.execute(c);
    expect(res.ok).toBe(true);
    expect(c.dedupHit).toBeUndefined();
    expect(mockClaim).toHaveBeenCalledTimes(1);
  });

  it('MPP: a repeated call stays charged and no dedup key is written', async () => {
    store.set(dedupKey(PAYER, CACHE_KEY), 'rcpt_orig');
    const c = ctx({
      x402Paid: false,
      mppPaid: true,
      mppPayer: PAYER,
      billingStatus: 'PAID',
    });
    await escrowFinalizeStage.execute(c);
    expect(c.dedupHit).toBeUndefined();
    expect(c.billingStatus).toBe('PAID');
    await recordDedupAfterCharge(c, 'r');
    expect(setCalls).toHaveLength(0);
  });
});

describe('canonicalParams / x-apibase-volatile (T-0526)', () => {
  const schemas = new Map<string, Record<string, unknown>>([
    [
      'fixture.volatile',
      {
        type: 'object',
        properties: {
          city: { type: 'string' },
          request_id: { type: 'string', [VOLATILE_KEYWORD]: true },
          stamp: { type: 'string', [VOLATILE_KEYWORD]: false },
        },
      },
    ],
    ['fixture.plain', { type: 'object', properties: { city: { type: 'string' } } }],
  ]);

  it('drops only annotated properties', () => {
    expect(
      canonicalParams('fixture.volatile', { city: 'Oslo', request_id: 'x', stamp: 's' }, schemas),
    ).toEqual({ city: 'Oslo', stamp: 's' });
  });

  it('a tool without annotation is returned untouched', () => {
    const p = { city: 'Oslo', request_id: 'x' };
    expect(canonicalParams('fixture.plain', p, schemas)).toBe(p);
    expect(canonicalParams('no.such.tool', p, schemas)).toBe(p);
  });

  it('un-annotated tool keys equal the pre-T-0526 key', () => {
    const p = { b: 1, a: 2 };
    expect(generateCacheKey('fixture.never.registered', p)).toBe(
      generateCacheKey('fixture.never.registered', { a: 2, b: 1 }),
    );
  });

  it('zod-to-json-schema carries the keyword via markVolatile (also through optional)', () => {
    const js = zodToJsonSchema(
      z.object({
        city: z.string(),
        rid: markVolatile(z.string()).optional(),
        rid2: markVolatile(z.string().optional()),
      }),
    ) as { properties: Record<string, Record<string, unknown>> };
    expect(js.properties.city[VOLATILE_KEYWORD]).toBeUndefined();
    expect(js.properties.rid[VOLATILE_KEYWORD]).toBe(true);
    expect(js.properties.rid2[VOLATILE_KEYWORD]).toBe(true);
  });
});

const def = TOOL_DEFINITIONS[0];

async function call(meta?: Record<string, unknown>) {
  const cbs = new Map<string, (a: unknown, e?: unknown) => Promise<unknown>>();
  registerTools(
    { registerTool: (n: string, _c: unknown, cb: never) => cbs.set(n, cb) } as never,
    'apb_key',
    'req-1',
  );
  const cb = cbs.get(def.mcpName || def.toolId);
  if (!cb) throw new Error('tool not registered');
  return (await cb({}, meta ? { _meta: meta } : undefined)) as Record<string, unknown>;
}

describe('/mcp idempotency key (T-0526)', () => {
  beforeEach(() => mockRun.mockReset());

  it('a 17-char key lands in ctx.headers', async () => {
    mockRun.mockResolvedValue({ ok: true, value: { responseBody: { a: 1 } } });
    await call({ 'apibase/idempotency_key': 'k'.repeat(17) });
    expect(mockRun.mock.calls[0][0].headers['x-idempotency-key']).toBe('k'.repeat(17));
  });

  it('a 5-char key and a non-string are ignored', async () => {
    mockRun.mockResolvedValue({ ok: true, value: { responseBody: { a: 1 } } });
    await call({ 'apibase/idempotency_key': 'short' });
    await call({ 'apibase/idempotency_key': 12345678901234567 });
    await call({ 'apibase/idempotency_key': 'k'.repeat(129) });
    for (const c of mockRun.mock.calls) expect(c[0].headers['x-idempotency-key']).toBeUndefined();
  });

  it('dedup hit -> _meta apibase/charged false + original receipt url', async () => {
    mockRun.mockResolvedValue({
      ok: true,
      value: { responseBody: { a: 1 }, dedupHit: { receiptId: 'rcpt_orig' } },
    });
    const r = await call();
    const m = r._meta as Record<string, unknown>;
    expect(m['apibase/charged']).toBe(false);
    expect(String(m['apibase/receipt_url'])).toContain('rcpt_orig');
  });

  it('charged call adds no charged key', async () => {
    mockRun.mockResolvedValue({ ok: true, value: { responseBody: { a: 1 } } });
    const r = await call();
    expect((r._meta as Record<string, unknown> | undefined)?.['apibase/charged']).toBeUndefined();
  });
});
