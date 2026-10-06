/**
 * T-INT-20 A-1..A-14: wave-1 adversarial end-to-end sweep of the Integrator shop. Real Express
 * routers (merchant, order, storefront, check, /mcp + /mcp/m/:slug), the real x402/MPP middleware,
 * the real escrow/settle/delivery code and a real Postgres (TEST_DATABASE_URL, disposable; the
 * suite is skipped without it, like the other shop suites). Mocked rails only: facilitator
 * verify/settle, the replay-guard Redis, mppx charge, the Tempo RPC, the webhook receiver and DNS.
 * Zero real payments, zero real RPC.
 *
 * The demo merchant `apibase-demo` is seeded by the real scripts/shop/seed-demo-merchant.ts against
 * the in-process test instance with a throwaway wallet (signatures only, no funds).
 */
import { randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { toMicroUsdc } from '../../src/config/x402.config';
import { createMcpRouter } from '../../src/mcp/server';
import { mppMiddleware } from '../../src/middleware/mpp.middleware';
import { x402Middleware } from '../../src/middleware/x402.middleware';
import { errorHandlerMiddleware } from '../../src/middleware/error-handler.middleware';
import { processEvent, type ProcessorDeps } from '../../src/outbox/processor';
import { escrowQuotePayment } from '../../src/pipeline/stages/escrow.stage';
import { escrowFinalizeStage } from '../../src/pipeline/stages/escrow-finalize.stage';
import { ledgerWriteStage } from '../../src/pipeline/stages/ledger-write.stage';
import type { PipelineContext } from '../../src/pipeline/types';
import { encryptSecret } from '../../src/services/secret-crypto.service';
import { issueKey } from '../../src/shop/auth/merchant-key.service';
import { clearStorefrontCache } from '../../src/shop/merchant-mcp-server';
import type { ShopDeps } from '../../src/shop/merchant-lifecycle.service';
import { createCheckRouter } from '../../src/shop/routes/check.router';
import { createMerchantRouter } from '../../src/shop/routes/merchant.router';
import { createOrderRouter } from '../../src/shop/routes/order.router';
import { createStorefrontRouter } from '../../src/shop/routes/storefront.router';
import { registerMerchantTools } from '../../src/shop/tools/merchant.tools';
import { deliverDue, redeliver, type DeliveryDeps } from '../../src/shop/webhook/delivery.service';
import { setWebhook } from '../../src/shop/webhook/webhook.service';
import type { WebhookTransport } from '../../src/shop/webhook/transport';
import { prepare, submit, DEMO_SLUG, TEST_SKU } from '../../scripts/shop/seed-demo-merchant';
import { client, dbDescribe, migrate, mkMerchant } from '../unit/helpers/shop-db';

// ledger.service builds its own lazy PrismaClient from the default connection variable: point it at
// the disposable DB before the first write so no other database can receive these rows.
if (process.env['TEST_DATABASE_URL'])
  process.env['DATABASE_URL'] = process.env['TEST_DATABASE_URL'];

const mockDb: { c?: ReturnType<typeof client> } = {};
jest.mock('../../src/services/prisma.service', () => ({ getPrisma: () => mockDb.c }));
jest.mock('../../src/config/index', () => ({
  config: {
    ENCRYPTION_KEY: 'k'.repeat(40),
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
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  createRequestLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  resolveRequestId: () => 'r-e2e',
}));
jest.mock('../../src/services/moderation-ban.service', () => ({
  checkBan: jest.fn(async () => ({ banned: false, retryAfterSecs: 0 })),
  recordBlock: jest.fn(async () => undefined),
}));
jest.mock('../../src/config/mpp.config', () => ({
  getMppConfig: () => ({
    enabled: true,
    privateKey: '0x00',
    usdcAddress: '0x1',
    walletAddress: '0x2',
    secretKey: 's',
    realm: 'r',
    rpcUrl: 'http://rpc',
  }),
}));
jest.mock('../../src/pipeline/stages/tool-status.stage', () => ({
  getToolPriceUsd: () => 1,
  getActiveToolIds: () => new Set<string>(),
}));
jest.mock('../../src/pipeline/pipeline', () => ({ runPipeline: jest.fn() }));
jest.mock('../../src/pipeline/stages/x402-settle', () => ({ settleX402: jest.fn() }));

// Redis: the MPP quote lock only (the nonce store and the counters are injected through ShopDeps).
const kv = new Map<string, string>();
const fakeRedis = {
  set: async (k: string, v: string, _ex: string, _ttl: number, nx: string) => {
    if (nx === 'NX' && kv.has(k)) return null;
    kv.set(k, v);
    return 'OK';
  },
  del: async (k: string) => void kv.delete(k),
};
jest.mock('../../src/services/redis.service', () => ({
  ensureRedisConnected: async () => fakeRedis,
  getSharedRedis: () => ({}),
}));

// x402: the header IS the JSON payload; the replay guard is a Set; verify/settle are the spies.
jest.mock('@x402/core/http', () => ({
  decodePaymentSignatureHeader: (h: string) => JSON.parse(h),
  encodePaymentRequiredHeader: () => 'x',
}));
jest.mock('@x402/core/schemas', () => ({
  parsePaymentPayload: (d: unknown) => ({ success: true, data: d }),
}));
const claimed = new Set<string>();
const mockClaim = jest.fn(async (_rail: string, nonce: string) => {
  if (claimed.has(nonce)) return false;
  claimed.add(nonce);
  return true;
});
jest.mock('../../src/services/payment-nonce.service', () => ({
  claimPaymentNonce: (r: string, n: string) => mockClaim(r, n),
}));
const mockVerify = jest.fn();
const mockSettle = jest.fn();
jest.mock('../../src/services/x402-server.service', () => ({
  getSharedResourceServer: () => ({ verifyPayment: mockVerify, settlePayment: mockSettle }),
}));

// MPP: `charge(params)` is the spy; a credentialed call can be held open by `gate` so a second
// credential races it.
const mockCharge = jest.fn();
let handlerCalls = 0;
let gate: Promise<void> | undefined;
const TX_HASH = `0x${'ab'.repeat(32)}`;
const TX_FROM = '0x00000000000000000000000000000000000a11ce';
jest.mock('mppx/server', () => ({
  Store: { redis: () => ({ update: () => undefined }) },
  Mppx: {
    create: () => ({
      charge: (params: unknown) => {
        mockCharge(params);
        return async (req: globalThis.Request) => {
          if (req.headers.get('authorization')) {
            handlerCalls++; // credentialed calls only: a challenge GET settles nothing
            await gate;
            return { status: 200, withReceipt: (r: globalThis.Response) => r };
          }
          return {
            status: 402,
            challenge: {
              headers: new Headers({
                'WWW-Authenticate': `Payment id="ch-1", realm="r", method="tempo", expires="${new Date(Date.now() + 300_000).toISOString()}"`,
              }),
            },
          };
        };
      },
    }),
  },
  tempo: { charge: () => ({}), session: () => ({}) },
}));
jest.mock('viem/accounts', () => {
  const actual = jest.requireActual('viem/accounts');
  return {
    ...actual,
    // the MPP server account is a stub ('0x00'); every real test key goes to viem
    privateKeyToAccount: (k: string) => (k === '0x00' ? {} : actual.privateKeyToAccount(k)),
  };
});
jest.mock('mppx', () => ({ Receipt: { fromResponse: () => ({ reference: TX_HASH }) } }));
jest.mock('viem', () => ({
  ...jest.requireActual('viem'),
  http: () => ({}),
  createPublicClient: () => ({ getTransaction: async () => ({ from: TX_FROM }) }),
}));

type Row = Record<string, any>;
const E = process['env'];
const PLATFORM = '0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480';
const TEMPO_PLATFORM = '0x9E29FF84B0f3EDa9756262d2F950C435495BA8cC';
const PAYOUT = '0x00000000000000000000000000000000000b0b0b';
const PAYOUT_TEMPO = '0x00000000000000000000000000000000000c0c0c';
const FEE_WALLET = '0x00000000000000000000000000000000000fee00';
const PAYER = '0x00000000000000000000000000000000000a11ce';
const NETWORK = 'eip155:8453';
const KEY = 'k'.repeat(40);

dbDescribe('shop adversarial end-to-end (wave 1)', () => {
  const prisma = client();
  mockDb.c = prisma;

  // ---- injected seams: the nonce store, the rate counters, DNS and the webhook receiver ----
  const nonces = new Map<string, string>();
  const counters = new Map<string, number>();
  type Responder = (headers: Record<string, string>) => { status: number; body?: string };
  let receiver: Responder = () => ({ status: 200, body: 'ok' });
  const received: Array<{ headers: Record<string, string>; body: string }> = [];
  const transport: WebhookTransport = async (r) => {
    received.push({ headers: r.headers as Record<string, string>, body: r.body });
    const a = receiver(r.headers as Record<string, string>);
    return { status: a.status, body: Buffer.from(a.body ?? '') };
  };
  const deps: ShopDeps & DeliveryDeps = {
    db: prisma as never,
    transaction: (fn) => prisma.$transaction((tx) => fn(tx as never)),
    redis: {
      set: async (k: string, v: string) => void nonces.set(k, v),
      getdel: async (k: string) => {
        const v = nonces.get(k) ?? null;
        nonces.delete(k);
        return v;
      },
      incr: async (k: string) => {
        counters.set(k, (counters.get(k) ?? 0) + 1);
        return counters.get(k)!;
      },
      expire: async () => 1,
    } as never,
    resolve: async () => ['93.184.216.34'],
    transport,
  };
  const procDeps: ProcessorDeps = {
    queryRaw: (sql, ...p) => prisma.$queryRawUnsafe(sql, ...p),
    executeRaw: (sql, ...p) => prisma.$executeRawUnsafe(sql, ...p),
    redis: () => {
      throw new Error('no redis');
    },
    log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  };

  // ---- the application: the production routers behind the production payment middleware ----
  let srv: Server;
  let base = '';
  beforeAll(async () => {
    migrate();
    await prisma.$executeRawUnsafe(
      `INSERT INTO tools (tool_id, name, provider, category, namespace, status_source, status_reason, status_changed_at)
       VALUES ('shop.order.pay', 'shop.order.pay', 'shop', 'shop', 'shop', 'manual', 'test fixture', now())
       ON CONFLICT DO NOTHING`,
    );
    const app = express();
    app.set('trust proxy', true);
    app.use((req, res, next) => {
      req.requestId = 'r-e2e';
      res.setHeader('x-request-id', 'r-e2e');
      next();
    });
    app.use(createStorefrontRouter({ db: deps.db, limit: 10_000 }));
    app.use(createCheckRouter({ deps, ttlMs: 0, limit: 10_000 }));
    app.use(express.json({ limit: '1mb' }));
    app.use(x402Middleware);
    app.use(mppMiddleware);
    app.use(createMcpRouter({ shopDeps: deps }));
    app.use(createMerchantRouter(deps));
    app.use(createOrderRouter(deps));
    app.use(errorHandlerMiddleware);
    srv = await new Promise<Server>((r) => {
      const s = app.listen(0, '127.0.0.1', () => r(s));
    });
    base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    // a leftover demo merchant of an earlier run on a reused database: renamed, never deleted
    await prisma.$executeRawUnsafe(
      `UPDATE shop_merchants SET slug = 'old-' || substr(merchant_id::text, 1, 8) || '-demo',
              wallet_address = 'old-' || merchant_id::text WHERE slug = $1`,
      DEMO_SLUG,
    );
  });
  afterAll(async () => {
    srv.closeAllConnections();
    await new Promise((r) => srv.close(r));
    await prisma.$disconnect();
  });

  let n = 0;
  const tag = () => `${Date.now().toString(36)}e${n++}`;
  const ip = () =>
    `10.${n % 250}.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
  beforeEach(() => {
    Object.assign(E, {
      INTEGRATOR_FEE_ENABLED: 'false',
      INTEGRATOR_BASE_ORDERS_ENABLED: 'true',
      MPP_ENABLED: 'true',
      INTEGRATOR_TEST_SKU_DAILY_CAP: '3',
      INTEGRATOR_FEE_WALLET: FEE_WALLET,
      PUBLIC_BASE_URL: 'https://apibase.pro',
    });
    mockVerify.mockReset().mockImplementation(async (p: any) => ({
      isValid: true,
      payer: p.payload.authorization.from,
    }));
    mockSettle.mockReset().mockResolvedValue({ success: true, transaction: '0xabc' });
    mockClaim.mockClear();
    claimed.clear();
    kv.clear();
    gate = undefined;
    handlerCalls = 0;
    mockCharge.mockClear();
    received.length = 0;
    receiver = () => ({ status: 200, body: 'ok' });
    clearStorefrontCache();
  });

  // ---- fixtures ----
  const row = async (sql: string, ...v: unknown[]) =>
    (await prisma.$queryRawUnsafe<Row[]>(sql, ...v))[0];
  const rows = (sql: string, ...v: unknown[]) => prisma.$queryRawUnsafe<Row[]>(sql, ...v);
  const count = async (sql: string, ...v: unknown[]) => Number((await row(sql, ...v)).c);

  async function activate(merchant_id: string) {
    for (const doc_id of ['merchant-agreement', 'aup', 'dpa', 'refund-framework']) {
      const have = await rows(`SELECT 1 FROM shop_legal_docs WHERE doc_id = $1`, doc_id);
      if (have.length === 0) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO shop_legal_docs (doc_id, version, sha256, url, effective_from, body_md)
           VALUES ($1, 'int20', $2, $3, now() - interval '1 day', 'b')`,
          doc_id,
          doc_id.padEnd(64, '0'),
          `/legal/${doc_id}`,
        );
      }
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO shop_acceptances (merchant_id, doc_id, version, sha256, method, signer, signature, message)
       SELECT DISTINCT ON (doc_id) $1::uuid, doc_id, version, sha256, 'wallet_signature', 's', 'sig', 'm'
         FROM shop_legal_docs WHERE doc_id IN ('merchant-agreement','aup','dpa','refund-framework')
        ORDER BY doc_id, effective_from DESC`,
      merchant_id,
    );
    await prisma.$executeRawUnsafe(
      `UPDATE shop_merchants SET status = 'active', payout_wallet_base = $2, payout_wallet_tempo = $3,
              created_at = now() - interval '90 days' WHERE merchant_id = $1::uuid`,
      merchant_id,
      PAYOUT,
      PAYOUT_TEMPO,
    );
  }
  async function product(
    merchant_id: string,
    price: number,
    o: { test?: boolean; stock?: number | null; mode?: string; payload?: string } = {},
  ) {
    const sku = o.test ? TEST_SKU : `sku-${tag()}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO shop_products (merchant_id, sku, title, price_usd, available, is_test, category,
                                  fulfillment_mode, fulfillment_payload_encrypted)
       VALUES ($1::uuid, $2, 'Thing', $3::numeric, $4::int, $5, 'books', $6, $7)`,
      merchant_id,
      sku,
      price,
      o.stock === undefined ? null : o.stock,
      o.test ?? false,
      o.mode ?? 'instant',
      o.payload === undefined ? 'the-secret-code' : encryptSecret(o.payload, KEY),
    );
    return sku;
  }
  async function shop(
    o: { price?: number; stock?: number | null; test?: boolean; mode?: string } = {},
  ) {
    const m = await mkMerchant(prisma, tag());
    await activate(m);
    const sku = await product(m, o.price ?? 5, {
      stock: o.stock,
      test: o.test,
      mode: o.mode,
      payload: o.mode === 'merchant' ? undefined : 'the-secret-code',
    });
    const slug = (await row(`SELECT slug FROM shop_merchants WHERE merchant_id = $1::uuid`, m))
      .slug;
    return { m, sku, slug };
  }

  // ---- HTTP helpers ----
  async function http(
    method: string,
    path: string,
    o: { headers?: Record<string, string>; body?: unknown; key?: string } = {},
  ) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(o.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(o.key ? { authorization: `Bearer ${o.key}` } : {}),
        ...o.headers,
      },
      body: o.body === undefined ? undefined : JSON.stringify(o.body),
    });
    const text = await res.text();
    let body: Row = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text };
    }
    return { status: res.status, body, headers: res.headers };
  }
  const header = (o: { value: string; to?: string; nonce?: string; from?: string }) =>
    JSON.stringify({
      accepted: { network: NETWORK },
      payload: {
        authorization: {
          from: o.from ?? PAYER,
          to: o.to ?? PAYOUT,
          value: o.value,
          validAfter: '0',
          validBefore: String(Math.floor(Date.now() / 1000) + 600),
          nonce: o.nonce ?? `0x${randomBytes(32).toString('hex')}`,
        },
      },
    });
  type Quote = { quote_id: string; order_id: string; total_usd: number } & Row;
  async function quote(
    slug: string,
    sku: string,
    who = ip(),
  ): Promise<{ status: number; body: Quote; who: string }> {
    const r = await http('POST', '/api/v1/shop/quotes', {
      headers: { 'x-forwarded-for': who },
      body: { merchant: slug, items: [{ sku, qty: 1 }] },
    });
    return { status: r.status, body: r.body as Quote, who };
  }
  const payRest = (
    q: { body: Quote; who: string },
    h?: string,
    headers: Record<string, string> = {},
  ) =>
    http('POST', `/api/v1/shop/quotes/${q.body.quote_id}/pay`, {
      headers: { 'x-forwarded-for': q.who, ...(h ? { 'x-payment': h } : {}), ...headers },
      body: {},
    });
  const orderState = async (order_id: string) =>
    (await row(`SELECT state FROM shop_orders WHERE order_id = $1::uuid`, order_id))
      .state as string;
  const states = async (order_id: string) =>
    (
      await rows(
        `SELECT to_state FROM shop_order_events WHERE order_id = $1::uuid ORDER BY seq`,
        order_id,
      )
    ).map((r) => r.to_state as string);
  const payments = (order_id: string) =>
    count(`SELECT count(*) AS c FROM shop_payments WHERE order_id = $1::uuid`, order_id);

  // =========================================================================================
  it('A-1: the same X-Payment replayed on a second quote -> 402, one settle, one delivery', async () => {
    const s = await shop({ price: 5 });
    const q1 = await quote(s.slug, s.sku);
    const q2 = await quote(s.slug, s.sku, q1.who);
    const h = header({ value: toMicroUsdc(5) });
    const first = await payRest(q1, h);
    expect(first.status).toBe(200);
    expect(first.body.order.fulfillment).toBe('the-secret-code');
    const replay = await payRest(q2, h);
    expect(replay.status).toBe(402);
    // refused by the replay guard itself (the nonce claim), not by a later uniqueness backstop
    expect(replay.body.message).toBe('This payment was already used.');
    expect(mockSettle).toHaveBeenCalledTimes(1);
    expect(await payments(q2.body.order_id)).toBe(0);
    expect(await orderState(q2.body.order_id)).toBe('QUOTED');
    const again = await payRest(q1, h);
    expect(again.status).toBe(402);
    expect(await payments(q1.body.order_id)).toBe(1);
    expect(
      await count(
        `SELECT count(*) AS c FROM shop_order_events WHERE order_id = $1::uuid AND to_state = 'FULFILLED'`,
        q1.body.order_id,
      ),
    ).toBe(1);
  });

  it('A-2: $1 authorization on a $5 quote -> 402 payment_amount_mismatch, no payment, no claim', async () => {
    const s = await shop({ price: 5 });
    const q = await quote(s.slug, s.sku);
    const r = await payRest(q, header({ value: toMicroUsdc(1) }));
    expect(r.status).toBe(402);
    expect(r.body.error).toBe('payment_amount_mismatch');
    expect(mockClaim).not.toHaveBeenCalled();
    expect(mockSettle).not.toHaveBeenCalled();
    expect(await payments(q.body.order_id)).toBe(0);
    expect(await orderState(q.body.order_id)).toBe('QUOTED');
    expect(
      await count(
        `SELECT count(*) AS c FROM shop_order_events WHERE order_id = $1::uuid AND to_state = 'PAID'`,
        q.body.order_id,
      ),
    ).toBe(0);
  });

  it('A-3: two agents race for the last unit -> exactly one quote, the other 409 out_of_stock', async () => {
    const s = await shop({ price: 5, stock: 1 });
    const [a, b] = await Promise.all([quote(s.slug, s.sku), quote(s.slug, s.sku)]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const loser = a.status === 409 ? a : b;
    const winner = a.status === 409 ? b : a;
    expect(loser.body.error_code).toBe('out_of_stock');
    const stock = await row(
      `SELECT available, reserved FROM shop_products WHERE merchant_id = $1::uuid AND sku = $2`,
      s.m,
      s.sku,
    );
    expect([stock.available, stock.reserved]).toEqual([1, 1]);
    const paid = await payRest(winner, header({ value: toMicroUsdc(5) }));
    expect(paid.status).toBe(200);
    expect(
      await count(
        `SELECT count(*) AS c FROM shop_orders WHERE merchant_id = $1::uuid AND state <> 'QUOTED'`,
        s.m,
      ),
    ).toBe(1);
    const after = await row(
      `SELECT available, reserved FROM shop_products WHERE merchant_id = $1::uuid AND sku = $2`,
      s.m,
      s.sku,
    );
    expect([after.available, after.reserved]).toEqual([0, 0]);
  });

  it('A-4: an expired quote -> 410 quote_expired with a fresh quote; a payment on it is refused unclaimed', async () => {
    const s = await shop({ price: 5 });
    const q = await quote(s.slug, s.sku);
    await prisma.$executeRawUnsafe(
      `UPDATE shop_quotes SET expires_at = now() - interval '1 minute' WHERE quote_id = $1::uuid`,
      q.body.quote_id,
    );
    const got = await http('GET', `/api/v1/shop/quotes/${q.body.quote_id}`, {
      headers: { 'x-forwarded-for': q.who },
    });
    expect(got.status).toBe(410);
    expect(got.body.error_code).toBe('quote_expired');
    expect(got.body.quote.quote_id).toBeTruthy();
    expect(got.body.quote.quote_id).not.toBe(q.body.quote_id);
    const q2 = await quote(s.slug, s.sku);
    await prisma.$executeRawUnsafe(
      `UPDATE shop_quotes SET expires_at = now() - interval '1 minute' WHERE quote_id = $1::uuid`,
      q2.body.quote_id,
    );
    const paid = await payRest(q2, header({ value: toMicroUsdc(5) }));
    expect(paid.status).toBe(410);
    expect(paid.body.error_code).toBe('quote_expired');
    expect(mockClaim).not.toHaveBeenCalled();
    expect(mockSettle).not.toHaveBeenCalled();
    expect(await payments(q2.body.order_id)).toBe(0);
  });

  it('A-5: settle success:false -> PAYMENT_FAILED, nothing delivered; paying the same quote again goes PAYING -> PAID', async () => {
    const s = await shop({ price: 5 });
    const q = await quote(s.slug, s.sku);
    mockSettle.mockResolvedValueOnce({ success: false, errorReason: 'transaction_failed' });
    const failed = await payRest(q, header({ value: toMicroUsdc(5) }));
    expect(failed.status).toBe(402);
    expect(await orderState(q.body.order_id)).toBe('PAYMENT_FAILED');
    const o = await row(
      `SELECT fulfillment_status, fulfillment_payload_enc FROM shop_orders WHERE order_id = $1::uuid`,
      q.body.order_id,
    );
    expect(o.fulfillment_payload_enc).toBeNull();
    expect(o.fulfillment_status).not.toBe('fulfilled');
    expect(failed.body.order?.fulfillment).toBeUndefined();
    expect(
      (await row(`SELECT status FROM shop_quotes WHERE quote_id = $1::uuid`, q.body.quote_id))
        .status,
    ).toBe('open');

    const retry = await payRest(q, header({ value: toMicroUsdc(5) }));
    expect(retry.status).toBe(200);
    expect(retry.body.order.order_id).toBe(q.body.order_id);
    expect(retry.body.order.fulfillment).toBe('the-secret-code');
    expect(await states(q.body.order_id)).toEqual([
      'QUOTED',
      'PAYING',
      'PAYMENT_FAILED',
      'PAYING',
      'PAID',
      'CONFIRMED',
      'FULFILLED',
    ]);
    expect(
      await count(
        `SELECT count(*) AS c FROM shop_orders WHERE quote_id = $1::uuid`,
        q.body.quote_id,
      ),
    ).toBe(1);
    expect(
      await count(
        `SELECT count(*) AS c FROM shop_payments WHERE order_id = $1::uuid AND chain_status = 'confirmed'`,
        q.body.order_id,
      ),
    ).toBe(1);
  });

  it('A-6: two MPP credentials at once -> charge once, the other 409 quote_already_paying', async () => {
    const s = await shop({ price: 5 });
    const q = await quote(s.slug, s.sku);
    const cred = () =>
      `Payment ${Buffer.from(JSON.stringify({ challenge: { id: `cred-${randomUUID()}` } })).toString('base64')}`;
    let open!: () => void;
    gate = new Promise<void>((r) => (open = r));
    const pay = (c: string) =>
      http('POST', `/api/v1/shop/quotes/${q.body.quote_id}/pay`, {
        headers: { 'x-forwarded-for': q.who, authorization: c },
        body: {},
      });
    const first = pay(cred());
    await new Promise((r) => setTimeout(r, 200));
    // without the lock the second credential would wait on the held charge: never let it hang
    const secondCall = pay(cred());
    const second = await Promise.race([
      secondCall,
      new Promise<'hung'>((r) => setTimeout(() => r('hung'), 2000)),
    ]);
    open();
    expect(second).not.toBe('hung');
    if (second === 'hung') return;
    expect(second.status).toBe(409);
    expect(second.body.error_code).toBe('quote_already_paying');
    const done = await first;
    expect(done.status).toBe(200);
    expect(done.body.status).toBe('paid');
    expect(handlerCalls).toBe(1);
    expect(mockCharge).toHaveBeenCalledTimes(1);
    expect(await payments(q.body.order_id)).toBe(1);
    const p = await row(
      `SELECT rail, pay_to, chain_status FROM shop_payments WHERE order_id = $1::uuid`,
      q.body.order_id,
    );
    expect(p).toMatchObject({ rail: 'tempo', pay_to: PAYOUT_TEMPO, chain_status: 'confirmed' });
    // a third credential on the paid quote is refused before charge
    const late = await pay(cred());
    expect(late.status).toBe(409);
    expect(mockCharge).toHaveBeenCalledTimes(1);
  });

  it('A-7: webhook 500 twice -> retries, then 200 {fulfillment} -> one fulfillment; a redelivery keeps the Delivery-Id and is ignored', async () => {
    const s = await shop({ price: 5, mode: 'merchant' });
    const ep = await setWebhook(deps, s.m, {
      url: 'https://hook.example/hook',
      events: ['order.paid'],
    });
    expect(ep.secret).toMatch(/^whsec_/);
    const q = await quote(s.slug, s.sku);
    const paid = await payRest(q, header({ value: toMicroUsdc(5) }));
    expect(paid.status).toBe(200);
    expect(await orderState(q.body.order_id)).toBe('PAID');
    const ob = await row(
      `SELECT id, created_at, event_type, payload FROM outbox
        WHERE event_type = 'shop.order.paid' AND payload->>'order_id' = $1`,
      q.body.order_id,
    );
    expect(
      await processEvent(
        {
          id: BigInt(ob.id),
          created_at: ob.created_at,
          event_type: ob.event_type,
          payload: ob.payload,
        },
        procDeps,
      ),
    ).toBe(true);

    let call = 0;
    receiver = () => {
      call++;
      return call <= 2
        ? { status: 500, body: 'boom' }
        : { status: 200, body: JSON.stringify({ fulfillment: 'KEY-FIRST' }) };
    };
    const t0 = Date.now();
    expect(await deliverDue(deps, { limit: 100, nowMs: t0 + 1_000 })).toBe(1);
    expect(await orderState(q.body.order_id)).toBe('PAID');
    expect(await deliverDue(deps, { limit: 100, nowMs: t0 + 120_000 })).toBe(1);
    expect(await orderState(q.body.order_id)).toBe('PAID');
    expect(await deliverDue(deps, { limit: 100, nowMs: t0 + 900_000 })).toBe(1);
    expect(await orderState(q.body.order_id)).toBe('FULFILLED');
    const ds = await rows(
      `SELECT delivery_id, attempt, status, status_code, fulfillment_accepted FROM shop_webhook_deliveries
        WHERE endpoint_id = $1::uuid ORDER BY attempt`,
      ep.endpoint_id,
    );
    expect(ds.map((d) => [d.attempt, d.status, d.status_code])).toEqual([
      [1, 'retry', 500],
      [2, 'retry', 500],
      [3, 'delivered', 200],
    ]);
    expect(ds[2].fulfillment_accepted).toBe(true);
    const ids = new Set(received.map((r) => r.headers['X-APIbase-Delivery-Id']));
    expect(received).toHaveLength(3);
    expect(ids.size).toBe(1);

    // the same event delivered again with a different answer: same Delivery-Id, second fulfillment ignored
    receiver = () => ({ status: 200, body: JSON.stringify({ fulfillment: 'KEY-SECOND' }) });
    expect(await redeliver(deps, ds[2].delivery_id, Date.now())).toBe(true);
    expect(await deliverDue(deps, { limit: 100, nowMs: Date.now() + 1_000 })).toBe(1);
    expect(received).toHaveLength(4);
    expect(received[3].headers['X-APIbase-Delivery-Id']).toBe([...ids][0]);
    const last = await row(
      `SELECT fulfillment_accepted FROM shop_webhook_deliveries WHERE endpoint_id = $1::uuid ORDER BY attempt DESC LIMIT 1`,
      ep.endpoint_id,
    );
    expect(last.fulfillment_accepted).toBe(false);
    const view = await http('GET', `/api/v1/shop/orders/${q.body.order_id}`, {
      headers: { 'x-forwarded-for': q.who },
    });
    expect(view.body.fulfillment).toBe('KEY-FIRST');
    expect(
      await count(
        `SELECT count(*) AS c FROM shop_order_events WHERE order_id = $1::uuid AND to_state = 'FULFILLED'`,
        q.body.order_id,
      ),
    ).toBe(1);
  });

  it('A-8: cross-tenant -> a key of A cannot reach orders of B; /mcp/m/A cannot quote a sku of B', async () => {
    const a = await shop({ price: 5 });
    const b = await shop({ price: 5 });
    const keyA = await deps.transaction((tx) => issueKey(tx, a.m));
    const qb = await quote(b.slug, b.sku);
    expect((await payRest(qb, header({ value: toMicroUsdc(5) }))).status).toBe(200);
    const orderB = qb.body.order_id;

    const confirm = await http('POST', `/api/v1/shop/merchants/me/orders/${orderB}/confirm`, {
      key: keyA,
      body: {},
    });
    expect(confirm.status).toBe(404);
    const doc = await http('POST', `/api/v1/shop/merchants/me/orders/${orderB}/document`, {
      key: keyA,
      body: { url: 'https://evil.example/x' },
    });
    expect(doc.status).toBe(404);
    const list = await http('GET', '/api/v1/shop/merchants/me/orders', { key: keyA });
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).not.toContain(orderB);

    // the storefront of A with the sku of B
    const t = new StreamableHTTPClientTransport(new URL(`${base}/mcp/m/${a.slug}`));
    const c = new Client({ name: 'attacker', version: '1' });
    await c.connect(t);
    const r: any = await c.callTool({
      name: 'shop.order.quote',
      arguments: { items: [{ sku: b.sku, qty: 1 }] },
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content[0].text).error_code).toBe('not_found');
    // a `merchant` argument naming B is dropped: the storefront stays bound to A
    const r2: any = await c.callTool({
      name: 'shop.order.quote',
      arguments: { merchant: b.slug, items: [{ sku: b.sku, qty: 1 }] },
    });
    expect(r2.isError).toBe(true);
    expect(
      await count(`SELECT count(*) AS c FROM shop_orders WHERE merchant_id = $1::uuid`, b.m),
    ).toBe(1);
    await c.close();
  });

  // ---- the demo merchant: seeded by the real script against this instance ----
  let demo: { wallet: string; merchant_id: string; api_key: string } | undefined;
  const wallet = privateKeyToAccount(generatePrivateKey());

  it('A-9 (UC-10): nonce -> register -> accept_terms -> catalog -> webhook -> check = connected, payment_verified=false; a paid test SKU flips it', async () => {
    const before = await count(`SELECT count(*) AS c FROM shop_merchants`);
    const prep = await prepare({ wallet: wallet.address, baseUrl: base });
    expect(await count(`SELECT count(*) AS c FROM shop_merchants`)).toBe(before);
    expect(prep.messages.register).toContain('Purpose: register');
    expect(prep.messages.accept_terms).toContain('I accept APIbase documents:');
    const sign = (message: string) => wallet.signMessage({ message });
    const r = await submit({
      baseUrl: base,
      signatures: {
        wallet: wallet.address,
        register: {
          message: prep.messages.register,
          signature: await sign(prep.messages.register),
        },
        accept_terms: {
          message: prep.messages.accept_terms,
          signature: await sign(prep.messages.accept_terms),
        },
        encryption_key: { signature: await sign(prep.messages.encryption_key) },
      },
      payoutBase: PAYOUT,
      payoutTempo: PAYOUT_TEMPO,
      webhookUrl: 'https://hook.example/demo',
    });
    expect(r.slug).toBe(DEMO_SLUG);
    expect(r.api_key).toMatch(/^mk_live_/);
    expect(r.webhook_secret).toMatch(/^whsec_/);
    expect(r.check.status).toBe('connected');
    expect(r.check.payment_verified).toBe(false);
    demo = { wallet: wallet.address, merchant_id: r.merchant_id, api_key: r.api_key };

    const items = await rows(
      `SELECT sku, price_usd::float8 AS price, is_test, fulfillment_mode, refund_window_days
         FROM shop_products WHERE merchant_id = $1::uuid ORDER BY price_usd, sku`,
      r.merchant_id,
    );
    expect(
      items.map((i) => [i.sku, i.price, i.is_test, i.fulfillment_mode, i.refund_window_days]),
    ).toEqual([
      [TEST_SKU, 0.01, true, 'instant', 14],
      ['demo-guide', 1, false, 'instant', 14],
      ['demo-tour', 1, false, 'instant', 14],
      ['demo-bundle', 5, false, 'instant', 14],
    ]);
    const m = await row(
      `SELECT slug, category, payout_wallet_base, payout_wallet_tempo, status FROM shop_merchants WHERE merchant_id = $1::uuid`,
      r.merchant_id,
    );
    expect(m).toMatchObject({
      slug: 'apibase-demo',
      category: 'digital-goods',
      payout_wallet_base: PAYOUT,
      payout_wallet_tempo: PAYOUT_TEMPO,
      status: 'active',
    });

    // a second submit with the spent nonces is refused (single use)
    await expect(
      submit({
        baseUrl: base,
        signatures: {
          wallet: wallet.address,
          register: {
            message: prep.messages.register,
            signature: await sign(prep.messages.register),
          },
          accept_terms: {
            message: prep.messages.accept_terms,
            signature: await sign(prep.messages.accept_terms),
          },
          encryption_key: { signature: await sign(prep.messages.encryption_key) },
        },
        payoutBase: PAYOUT,
        payoutTempo: PAYOUT_TEMPO,
      }),
    ).rejects.toThrow(/register failed/);

    // the merchant's own agent pays the test SKU (mocked rail)
    const q = await quote(DEMO_SLUG, TEST_SKU);
    expect(q.status).toBe(201);
    expect(q.body.total_usd).toBe(0.01);
    const paid = await payRest(q, header({ value: toMicroUsdc(0.01) }));
    expect(paid.status).toBe(200);
    expect(paid.body.order.fulfillment).toBe('test ok');
    const check = await http('GET', '/api/v1/shop/merchants/me/check', { key: r.api_key });
    expect(check.body.status).toBe('connected');
    expect(check.body.payment_verified).toBe(true);
    const pub = await http('GET', `/integrator/check/${DEMO_SLUG}`);
    expect(pub.body.payment_verified).toBe(true);
  });

  it('A-10 (UC-1): discover -> initialize -> tools/list (8) -> quote -> pay -> get in <= 6 tool calls and < 60 s; paid to the seller payout', async () => {
    expect(demo).toBeDefined();
    const t0 = Date.now();
    const shopInfo = await http('GET', `/api/v1/shop/shops/${DEMO_SLUG}`);
    expect(shopInfo.status).toBe(200);
    let xPayment = '';
    const t = new StreamableHTTPClientTransport(new URL(`${base}/mcp/m/${DEMO_SLUG}`), {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (xPayment) h.set('x-payment', xPayment);
        return fetch(input, { ...init, headers: h });
      },
    });
    const c = new Client({ name: 'uc1-agent', version: '1' });
    await c.connect(t);
    const tools = (await c.listTools()).tools.map((x) => x.name);
    expect(tools).toHaveLength(8);
    let calls = 0;
    const call = async (name: string, args: Row) => {
      calls++;
      const r: any = await c.callTool({ name, arguments: args });
      return { isError: !!r.isError, body: JSON.parse(r.content[0].text) as Row };
    };
    const quoted = await call('shop.order.quote', { items: [{ sku: 'demo-guide', qty: 1 }] });
    expect(quoted.isError).toBe(false);
    expect(quoted.body.total_usd).toBe(1);
    expect(quoted.body.pay.x402.payTo).toBe(PAYOUT);
    xPayment = header({ value: toMicroUsdc(1), to: quoted.body.pay.x402.payTo });
    const paid = await call('shop.order.pay', { quote_id: quoted.body.quote_id });
    xPayment = '';
    expect(paid.isError).toBe(false);
    expect(paid.body.status).toBe('paid');
    expect(paid.body.order.fulfillment).toContain('APIbase agent commerce guide');
    const got = await call('shop.order.get', { order_id: quoted.body.order_id });
    expect(got.body.fulfillment).toBe(paid.body.order.fulfillment);
    expect(calls).toBeLessThanOrEqual(6);
    expect(Date.now() - t0).toBeLessThan(60_000);
    expect(
      await count(
        `SELECT count(*) AS c FROM shop_order_events WHERE order_id = $1::uuid AND to_state = 'FULFILLED'`,
        quoted.body.order_id,
      ),
    ).toBe(1);
    const p = await row(
      `SELECT pay_to FROM shop_payments WHERE order_id = $1::uuid`,
      quoted.body.order_id,
    );
    expect(p.pay_to).toBe(PAYOUT);
    await c.close();
  });

  it('A-11: the 4th paid test-SKU order of a day -> 429 test_sku_daily_cap before verify', async () => {
    const s = await shop({ price: 0.01, test: true });
    const qs = [] as Awaited<ReturnType<typeof quote>>[];
    for (let i = 0; i < 4; i++) {
      const q = await quote(s.slug, TEST_SKU);
      expect(q.status).toBe(201);
      qs.push(q);
    }
    for (const q of qs.slice(0, 3)) {
      expect((await payRest(q, header({ value: toMicroUsdc(0.01) }))).status).toBe(200);
    }
    mockVerify.mockClear();
    const fourth = await payRest(qs[3], header({ value: toMicroUsdc(0.01) }));
    expect(fourth.status).toBe(429);
    expect(fourth.body.error_code).toBe('test_sku_daily_cap');
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockSettle).toHaveBeenCalledTimes(3);
    expect(await orderState(qs[3].body.order_id)).toBe('QUOTED');
  });

  it('A-12: Authorization: Payment on /mcp -> 400, charge never called; pay.mpp.url is the REST route', async () => {
    const res = await http('POST', '/mcp', {
      headers: { authorization: 'Payment eA==', accept: 'application/json, text/event-stream' },
      body: { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    });
    expect(res.status).toBe(400);
    expect(mockCharge).not.toHaveBeenCalled();
    expect(handlerCalls).toBe(0);

    const s = await shop({ price: 5 });
    const q = await quote(s.slug, s.sku);
    const ch = await http('GET', `/api/v1/shop/quotes/${q.body.quote_id}/pay`, {
      headers: { 'x-forwarded-for': q.who },
    });
    expect(ch.status).toBe(402);
    expect(ch.body.pay.mpp.url).toBe(
      `https://apibase.pro/api/v1/shop/quotes/${q.body.quote_id}/pay`,
    );
    // the same answer through the tool on a storefront: no payment -> isError carrying pay.mpp.url
    const c = new Client({ name: 'a12', version: '1' });
    await c.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp/m/${s.slug}`)));
    const r: any = await c.callTool({
      name: 'shop.order.pay',
      arguments: { quote_id: q.body.quote_id },
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content[0].text).pay.mpp.url).toBe(ch.body.pay.mpp.url);
    await c.close();
    expect(handlerCalls).toBe(0);
  });

  it('A-14: shop.merchant.deactivate -> /mcp/m/apibase-demo answers 410', async () => {
    expect(demo).toBeDefined();
    const before = await http('POST', `/mcp/m/${DEMO_SLUG}`, {
      headers: { accept: 'application/json, text/event-stream' },
      body: {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 't', version: '1' },
        },
      },
    });
    expect(before.status).toBe(200);
    const srvTools = new McpServer({ name: 't', version: '0' });
    registerMerchantTools(srvTools, demo!.api_key, 'req-a14', deps);
    const c = new Client({ name: 'merchant', version: '0' });
    const [t1, t2] = InMemoryTransport.createLinkedPair();
    await Promise.all([srvTools.connect(t1), c.connect(t2)]);
    const r: any = await c.callTool({ name: 'shop.merchant.deactivate', arguments: {} });
    expect(r.isError).toBeFalsy();
    clearStorefrontCache(DEMO_SLUG); // the descriptor cache otherwise lives 30 s (STOREFRONT_TTL_MS)
    const after = await http('POST', `/mcp/m/${DEMO_SLUG}`, {
      headers: { accept: 'application/json, text/event-stream' },
      body: {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 't', version: '1' },
        },
      },
    });
    expect(after.status).toBe(410);
    expect(after.body.error).toBe('merchant_unavailable');
    const quoteAfter = await quote(DEMO_SLUG, 'demo-guide');
    expect(quoteAfter.status).toBe(410);
  });

  it('A-13: no payment of the whole run pays the platform, Tempo or fee wallet; execution_ledger cost_usd = the fee', async () => {
    // a $89 order with the integrator fee on, paid by x402 and finished through the ledger stages
    E['INTEGRATOR_FEE_ENABLED'] = 'true';
    const s = await shop({ price: 89 });
    const q = await quote(s.slug, s.sku);
    const agentId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO agents (agent_id, api_key_hash) VALUES ($1::uuid, $2)`,
      agentId,
      agentId.replace(/-/g, '').padEnd(64, '0'),
    );
    const ctx = {
      requestId: `r-${tag()}`,
      method: 'POST',
      path: `/api/v1/shop/quotes/${q.body.quote_id}/pay`,
      toolId: 'shop.order.pay',
      agentId,
      body: { quote_id: q.body.quote_id },
      headers: {},
      x402Paid: true,
      x402PaymentHeader: header({ value: toMicroUsdc(89) }),
    } as unknown as PipelineContext;
    expect((await escrowQuotePayment(deps, ctx)).ok).toBe(true);
    expect(ctx.quoteFeeUsd).toBe(1.34);
    ctx.providerCalled = true;
    ctx.providerResponse = { status: 'paid' } as never;
    ctx.executionId = randomUUID();
    expect((await escrowFinalizeStage.execute(ctx)).ok).toBe(true);
    expect((await ledgerWriteStage.execute(ctx)).ok).toBe(true);
    const ledger = await row(
      `SELECT tool_id, cost_usd::text AS cost_usd FROM execution_ledger WHERE execution_id = $1::uuid`,
      ctx.executionId,
    );
    expect(ledger).toEqual({ tool_id: 'shop.order.pay', cost_usd: '1.34000000' });

    const bad = await count(
      `SELECT count(*) AS c FROM shop_payments WHERE lower(pay_to) IN ($1, $2, $3)`,
      PLATFORM.toLowerCase(),
      TEMPO_PLATFORM.toLowerCase(),
      FEE_WALLET.toLowerCase(),
    );
    expect(bad).toBe(0);
    expect(
      await count(
        `SELECT count(*) AS c FROM shop_payments WHERE pay_to IN ($1, $2)`,
        PAYOUT,
        PAYOUT_TEMPO,
      ),
    ).toBeGreaterThan(0);
  });

  it('seed script hygiene: no direct SQL, English only', () => {
    const src = require('node:fs').readFileSync(
      require('node:path').join(__dirname, '../../scripts/shop/seed-demo-merchant.ts'),
      'utf8',
    ) as string;
    expect(src).not.toMatch(/\$queryRaw|\$executeRaw|@prisma\/client|from 'pg'/);
    expect(src).not.toMatch(new RegExp('[\\u0400-\\u04FF]'));
  });
});
