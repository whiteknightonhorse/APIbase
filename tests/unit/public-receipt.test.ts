/**
 * A-GA-01: immutable public receipts (apibase-receipt/1) for billed on-chain calls.
 */
import express from 'express';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';

const mockInsertThrows = { on: false };
const mockExecute = jest.fn(async () => {
  if (mockInsertThrows.on) throw new Error('db down');
  return 1;
});
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../src/services/prisma.service', () => ({
  getPrisma: () => ({ $executeRawUnsafe: mockExecute, $queryRawUnsafe: jest.fn(async () => []) }),
}));
jest.mock('../../src/config/x402.config', () => ({
  getX402Config: () => ({
    network: 'eip155:8453',
    paymentAddress: '0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480',
  }),
}));
jest.mock('../../src/config/mpp.config', () => ({
  getMppConfig: () => ({
    chainId: 4217,
    walletAddress: '0x9E29FF84B0f3EDa9756262d2F950C435495BA8cC',
  }),
}));

import {
  RECEIPT_ALLOWED_KEYS,
  buildReceiptBody,
  canonicalJson,
  planReceipt,
  sha256Hex,
  usdToAtomic,
  writeReceiptSafe,
  type ReceiptStore,
} from '../../src/services/public-receipt.service';
import { createReceiptRouter } from '../../src/routes/receipt.router';
import { createPipelineContext, type PipelineContext } from '../../src/pipeline/types';
import { logger } from '../../src/config/logger';

const PAYER = '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01';
const TX = '0x' + 'ab'.repeat(32);

function billedX402(): PipelineContext {
  const ctx = createPipelineContext('req-1', 'POST', '/api/v1/tools/x/call', {}, {});
  ctx.toolId = 'weather.current';
  ctx.billingStatus = 'PAID';
  ctx.finalCost = 0.001;
  ctx.x402Paid = true;
  ctx.x402Payer = PAYER;
  ctx.x402SettleSucceeded = true;
  ctx.x402SettleTxHash = TX;
  return ctx;
}

function billedMpp(): PipelineContext {
  const ctx = createPipelineContext('req-2', 'POST', '/mcp', {}, {});
  ctx.toolId = 'weather.current';
  ctx.billingStatus = 'PAID';
  ctx.finalCost = 0.0025;
  ctx.mppPaid = true;
  ctx.mppPayer = PAYER;
  ctx.mppTxHash = TX;
  return ctx;
}

const NOW = new Date('2026-10-20T12:00:00.000Z');

describe('planReceipt (written only when billing succeeded)', () => {
  it('x402: builds a canonical receipt with exact fields', async () => {
    const plan = await planReceipt(billedX402(), '{"data":1}', NOW);
    expect(plan).not.toBeNull();
    const body = JSON.parse(plan!.body);
    expect(body).toEqual({
      schema: 'apibase-receipt/1',
      receipt_id: plan!.receiptId,
      issued_at: '2026-10-20T12:00:00.000Z',
      tool: 'weather.current',
      upstream_status: 200,
      response_sha256: sha256Hex('{"data":1}'),
      billed: true,
      rail: 'x402-base',
      chain_id: 8453,
      asset: 'USDC',
      amount_atomic: '1000',
      payer: PAYER.toLowerCase(),
      payee: '0x50ebda9da5dc19c302ca059d7b9e06e264936480',
      payment_tx: TX,
    });
    expect(plan!.receiptId).toMatch(/^[0-9a-f]{32}$/);
    expect(plan!.url).toBe(`https://apibase.pro/r/${plan!.receiptId}.json`);
  });

  it('mpp: rail, chain id and payee come from the Tempo config', async () => {
    const body = JSON.parse((await planReceipt(billedMpp(), 'x', NOW))!.body);
    expect(body.rail).toBe('mpp-tempo');
    expect(body.chain_id).toBe(4217);
    expect(body.amount_atomic).toBe('2500');
    expect(body.payee).toBe('0x9e29ff84b0f3eda9756262d2f950c435495ba8cc');
  });

  it.each([
    ['unbilled (NOT_CHARGED)', (c: PipelineContext) => (c.billingStatus = 'NOT_CHARGED')],
    ['free', (c: PipelineContext) => (c.billingStatus = 'FREE')],
    ['billing status unset (failed call)', (c: PipelineContext) => (c.billingStatus = undefined)],
    ['x402 settle failed', (c: PipelineContext) => (c.x402SettleSucceeded = false)],
    ['x402 settle pending', (c: PipelineContext) => (c.x402SettleSucceeded = undefined)],
    ['no payment tx', (c: PipelineContext) => (c.x402SettleTxHash = undefined)],
    ['payer not an address', (c: PipelineContext) => (c.x402Payer = 'unknown')],
    ['zero amount', (c: PipelineContext) => (c.finalCost = 0)],
  ])('writes nothing when %s', async (_name, mutate) => {
    const ctx = billedX402();
    mutate(ctx);
    const store: ReceiptStore = { insert: jest.fn(), get: jest.fn() };
    const plan = await planReceipt(ctx, 'x', NOW);
    expect(plan).toBeNull();
    await writeReceiptSafe(plan, store);
    expect(store.insert).not.toHaveBeenCalled();
  });

  it('prepaid-balance call (no on-chain payment) gets no receipt', async () => {
    const ctx = billedX402();
    ctx.x402Paid = false;
    expect(await planReceipt(ctx, 'x', NOW)).toBeNull();
  });
});

describe('receipt body schema', () => {
  it('carries exactly the allowed keys and no forbidden field', async () => {
    for (const ctx of [billedX402(), billedMpp()]) {
      const body = JSON.parse((await planReceipt(ctx, 'x', NOW))!.body);
      expect(Object.keys(body).sort()).toEqual([...RECEIPT_ALLOWED_KEYS].sort());
    }
  });

  it('fails if a forbidden key sneaks into the body', () => {
    const body = buildReceiptBody(billedX402(), {
      receiptId: 'a'.repeat(32),
      issuedAt: NOW,
      responseText: 'x',
      x402Payee: '0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480',
      x402ChainId: 8453,
      mppPayee: '',
      mppChainId: 4217,
    });
    const tampered = { ...body, api_key: 'secret' };
    expect(
      Object.keys(tampered).every((k) => (RECEIPT_ALLOWED_KEYS as readonly string[]).includes(k)),
    ).toBe(false);
  });
});

describe('canonical JSON', () => {
  it('is byte-stable across two serialisations and key order', () => {
    const a = { b: 1, a: { d: 2, c: [3, { z: 1, y: 2 }] } };
    const b = { a: { c: [3, { y: 2, z: 1 }], d: 2 }, b: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(a));
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(canonicalJson(a)).toBe('{"a":{"c":[3,{"y":2,"z":1}],"d":2},"b":1}');
  });

  it('usdToAtomic handles numbers and decimal strings', () => {
    expect(usdToAtomic(0.001)).toBe('1000');
    expect(usdToAtomic('0.0025')).toBe('2500');
    expect(usdToAtomic(0)).toBeNull();
    expect(usdToAtomic('abc')).toBeNull();
  });
});

describe('write step cannot raise into the response path', () => {
  it('logs and resolves when the store throws', async () => {
    const plan = await planReceipt(billedX402(), 'x', NOW);
    const store: ReceiptStore = {
      insert: jest.fn(async () => {
        throw new Error('boom');
      }),
      get: jest.fn(),
    };
    await expect(writeReceiptSafe(plan, store)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });

  it('REST: a failing receipt write leaves status and body unchanged and sets the header', async () => {
    jest.resetModules();
    jest.doMock('../../src/pipeline/pipeline', () => ({
      runPipeline: async (ctx: PipelineContext) => {
        Object.assign(ctx, billedX402(), { requestId: ctx.requestId });
        ctx.responseBody = { data: { t: 1 }, metadata: {} };
        ctx.responseStatus = 200;
        return { ok: true, value: ctx };
      },
    }));
    jest.doMock('../../src/services/idempotency.service', () => ({
      finalizePipelineIdempotency: async () => undefined,
    }));
    jest.doMock('../../src/middleware/x402.middleware', () => ({
      buildPaymentRequiredResponse: jest.fn(),
    }));
    jest.doMock('../../src/middleware/mpp.middleware', () => ({
      buildMppChallengeHeader: jest.fn(),
    }));
    mockInsertThrows.on = true;
    const { executeRouter } = await import('../../src/routes/execute.router');
    const app = express();
    app.use(express.json());
    app.use(executeRouter);
    const server = app.listen(0);
    try {
      const port = (server.address() as AddressInfo).port;
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/tools/weather.current/call`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      const text = await res.text();
      expect(res.status).toBe(200);
      expect(text).toBe('{"data":{"t":1},"metadata":{}}');
      const url = res.headers.get('x-apibase-receipt');
      expect(url).toMatch(/^https:\/\/apibase\.pro\/r\/[0-9a-f]{32}\.json$/);
      await new Promise((r) => setTimeout(r, 20));
      expect(mockExecute).toHaveBeenCalled();
    } finally {
      mockInsertThrows.on = false;
      server.close();
    }
  });
});

describe('GET /r/<id>.json', () => {
  const id = 'c'.repeat(32);
  const stored = canonicalJson({ schema: 'apibase-receipt/1', receipt_id: id });
  const store: ReceiptStore = {
    insert: jest.fn(),
    get: jest.fn(async (rid: string) => (rid === id ? stored : null)),
  };
  let server: ReturnType<express.Express['listen']>;
  let base: string;

  beforeAll(() => {
    const app = express();
    app.use(createReceiptRouter(store));
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    server.close();
  });

  it('serves the exact stored bytes with exact headers', async () => {
    const res = await fetch(`${base}/r/${id}.json`);
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(res.status).toBe(200);
    expect(sha256Hex(bytes)).toBe(sha256Hex(stored));
    expect(bytes.toString('utf8')).toBe(stored);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it.each(['d'.repeat(32) + '.json', 'nothex.json', `${id}`, `${id}.json.bak`, '..%2Fetc.json'])(
    '404 JSON shape for %s',
    async (file) => {
      const res = await fetch(`${base}/r/${file}`);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'no such receipt' });
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
    },
  );
});

describe('write-once: no update path exists in code', () => {
  it('no source file updates or deletes public_receipts', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
      });
    for (const f of walk(join(__dirname, '../../src'))) {
      const src = readFileSync(f, 'utf8');
      expect(src).not.toMatch(/UPDATE\s+"?public_receipts/i);
      expect(src).not.toMatch(/DELETE\s+FROM\s+"?public_receipts/i);
    }
  });
});
