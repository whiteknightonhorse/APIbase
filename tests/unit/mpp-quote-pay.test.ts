/**
 * T-INT-10 MP1-MP9: MPP on POST|GET /api/v1/shop/quotes/:id/pay — one challenge per quote, the
 * `quote:<id>:paying` lock, F-5 charge parameters, Tempo payer/receipt, 0256 M1 on /mcp. Real
 * Postgres (TEST_DATABASE_URL, disposable). Mocked: mppx/server (spy on `charge`), the Redis
 * (lock + replay guard), viem (tx.from). Zero real charge/RPC.
 */
import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import { createQuote } from '../../src/shop/quote.service';
import { payQuote } from '../../src/shop/pay.service';
import { registerOrderTools } from '../../src/shop/tools/order.tools';
import { mppMiddleware, quoteMppChallengeHeader } from '../../src/middleware/mpp.middleware';
import { AppError } from '../../src/types/errors';
import type { ShopDeps } from '../../src/shop/merchant-lifecycle.service';
import { client, dbDescribe, migrate, mkMerchant } from './helpers/shop-db';

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
}));
jest.mock('../../src/services/moderation-ban.service', () => ({
  checkBan: jest.fn(async () => ({ banned: false, retryAfterSecs: 0 })),
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
jest.mock('../../src/shop/buyer', () => ({
  resolveBuyer: async () => ({ identity: 'agent:mcp' }),
}));
jest.mock('../../src/pipeline/stages/tool-status.stage', () => ({ getToolPriceUsd: () => 1 }));

// Redis: the quote lock + the replay guard. `redisDown` makes every call throw.
const kv = new Map<string, string>();
let redisDown = false;
const fakeRedis = {
  set: async (k: string, v: string, _ex: string, _ttl: number, nx: string) => {
    if (redisDown) throw new Error('redis down');
    if (nx === 'NX' && kv.has(k)) return null;
    kv.set(k, v);
    return 'OK';
  },
  del: async (k: string) => void kv.delete(k),
};
jest.mock('../../src/services/redis.service', () => ({
  ensureRedisConnected: async () => {
    if (redisDown) throw new Error('redis down');
    return fakeRedis;
  },
  getSharedRedis: () => ({}),
}));
jest.mock('../../src/services/payment-nonce.service', () => ({
  claimPaymentNonce: async (r: string, n: string) => {
    const k = `n:${r}:${n}`;
    if (kv.has(k)) return false;
    kv.set(k, '1');
    return true;
  },
}));

// mppx: `charge(params)` is the spy; the handler answers a challenge without a credential and a
// receipt with one. `gate` holds the credentialed call open so a second one can race it.
const mockCharge = jest.fn();
let handlerCalls = 0;
let challengeSeq = 0;
let gate: Promise<void> | undefined;
let chargeThrows = false;
const TX_HASH = `0x${'ab'.repeat(32)}`;
const TX_FROM = '0x00000000000000000000000000000000000a11ce';
jest.mock('mppx/server', () => ({
  Store: { redis: () => ({ update: () => undefined }) },
  Mppx: {
    create: () => ({
      charge: (params: unknown) => {
        mockCharge(params);
        return async (req: globalThis.Request) => {
          handlerCalls++;
          if (req.headers.get('authorization')) {
            await gate;
            if (chargeThrows) throw new Error('tempo rpc unreachable');
            return { status: 200, withReceipt: (r: globalThis.Response) => r };
          }
          const id = `ch-${++challengeSeq}`;
          const expires = new Date(Date.now() + 5 * 60_000).toISOString();
          return {
            status: 402,
            challenge: {
              headers: new Headers({
                'WWW-Authenticate': `Payment id="${id}", realm="r", method="tempo", expires="${expires}"`,
              }),
            },
          };
        };
      },
    }),
  },
  tempo: { charge: () => ({}), session: () => ({}) },
}));
jest.mock('viem/accounts', () => ({ privateKeyToAccount: () => ({}) }));
jest.mock('mppx', () => ({ Receipt: { fromResponse: () => ({ reference: TX_HASH }) } }));
jest.mock('viem', () => ({
  ...jest.requireActual('viem'),
  http: () => ({}),
  createPublicClient: () => ({ getTransaction: async () => ({ from: TX_FROM }) }),
}));
jest.mock('../../src/services/x402-server.service', () => ({
  getSharedResourceServer: () => ({ verifyPayment: jest.fn(), settlePayment: jest.fn() }),
}));
jest.mock('@x402/core/http', () => ({
  decodePaymentSignatureHeader: (h: string) => JSON.parse(h),
  encodePaymentRequiredHeader: () => 'x',
}));
jest.mock('@x402/core/schemas', () => ({
  parsePaymentPayload: (d: unknown) => ({ success: true, data: d }),
}));

type Row = Record<string, any>;
const E = process['env'];
const FEE_WALLET = '0x00000000000000000000000000000000000fee00';
const PAYOUT = '0x00000000000000000000000000000000000b0b0b';
const PAYOUT_TEMPO = '0x00000000000000000000000000000000000c0c0c';

dbDescribe('MPP on POST|GET /quotes/:id/pay', () => {
  const prisma = client();
  mockDb.c = prisma;
  const deps: ShopDeps = {
    db: prisma as never,
    transaction: (fn) => prisma.$transaction((tx) => fn(tx as never)),
    redis: { incr: async () => 1, expire: async () => 1 } as never,
  };
  let n = 0;
  const tag = () => `${Date.now().toString(36)}m${n++}`;

  beforeAll(() => migrate());
  afterAll(() => prisma.$disconnect());
  beforeEach(() => {
    Object.assign(E, {
      INTEGRATOR_FEE_ENABLED: 'true',
      INTEGRATOR_BASE_ORDERS_ENABLED: 'true',
      MPP_ENABLED: 'true',
      INTEGRATOR_FEE_WALLET: FEE_WALLET,
      PUBLIC_BASE_URL: 'https://apibase.pro',
    });
    kv.clear();
    redisDown = false;
    chargeThrows = false;
    gate = undefined;
    handlerCalls = 0;
    mockCharge.mockClear();
    jest.restoreAllMocks();
  });

  async function fixture(price = 5) {
    const m = await mkMerchant(prisma, tag());
    for (const doc_id of ['merchant-agreement', 'aup', 'dpa', 'refund-framework']) {
      const have = await prisma.$queryRawUnsafe<unknown[]>(
        `SELECT 1 FROM shop_legal_docs WHERE doc_id = $1`,
        doc_id,
      );
      if (have.length === 0) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO shop_legal_docs (doc_id, version, sha256, url, effective_from, body_md)
           VALUES ($1, 'int10', $2, $3, now() - interval '1 day', 'b')`,
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
      m,
    );
    await prisma.$executeRawUnsafe(
      `UPDATE shop_merchants SET status = 'active', payout_wallet_base = $2, payout_wallet_tempo = $3,
              created_at = now() - interval '90 days' WHERE merchant_id = $1::uuid`,
      m,
      PAYOUT,
      PAYOUT_TEMPO,
    );
    const sku = `sku-${tag()}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO shop_products (merchant_id, sku, title, price_usd, available, is_test, category, fulfillment_mode)
       VALUES ($1::uuid, $2, 'Thing', $3::numeric, NULL, false, 'books', 'instant')`,
      m,
      sku,
      price,
    );
    const b = { identity: `agent:${tag()}` };
    const quote = await createQuote(deps, m, b, { items: [{ sku, qty: 1 }] });
    return { m, b, quote };
  }
  const row = async (sql: string, ...v: unknown[]) =>
    (await prisma.$queryRawUnsafe<Row[]>(sql, ...v))[0];
  const url = (id: string) => `https://apibase.pro/api/v1/shop/quotes/${id}/pay`;
  const idOf = (h: string | null) => /\bid="([^"]+)"/.exec(h ?? '')?.[1];

  let credSeq = 0;
  const credential = () =>
    `Payment ${Buffer.from(JSON.stringify({ challenge: { id: `cred-${tag()}-${credSeq++}` } })).toString('base64')}`;

  interface Outcome {
    next: boolean;
    err?: unknown;
    status?: number;
    body?: any;
    req: Request;
    res: Response;
  }
  /** Run the real middleware against a quote-pay request; resolves once it decided. */
  function run(path: string, auth?: string, method = 'POST'): Promise<Outcome> {
    const req = {
      headers: auth ? { authorization: auth } : {},
      originalUrl: path,
      method,
      body: {},
      get: () => 'apibase.pro',
      requestId: 'r-10',
    } as unknown as Request;
    const res = Object.assign(new EventEmitter(), {
      status(c: number) {
        (this as any).code = c;
        return this;
      },
      json(b: unknown) {
        const o = this as any;
        o.sent = b;
        o.done?.({ next: false, status: o.code, body: b, req, res: o });
        return this;
      },
    }) as unknown as Response;
    return new Promise((resolve) => {
      (res as any).done = resolve;
      mppMiddleware(req, res, (err?: unknown) => resolve({ next: !err, err, req, res }));
    });
  }
  const quotePath = (f: Awaited<ReturnType<typeof fixture>>) =>
    `/api/v1/shop/quotes/${f.quote.quote_id}/pay`;
  const finish = (o: Outcome) => o.res.emit('close');

  it('MP1: two GETs -> the same challenge id; +6 min -> a new id, the same memo', async () => {
    const f = await fixture(5);
    const a = await quoteMppChallengeHeader(f.quote.quote_id, url(f.quote.quote_id));
    const b = await quoteMppChallengeHeader(f.quote.quote_id, url(f.quote.quote_id));
    expect(idOf(a)).toBeDefined();
    expect(b).toBe(a);
    expect(
      (
        await row(
          `SELECT mpp_challenge_id AS i FROM shop_quotes WHERE quote_id = $1::uuid`,
          f.quote.quote_id,
        )
      ).i,
    ).toBe(idOf(a));

    const later = Date.now() + 6 * 60_000;
    jest.spyOn(Date, 'now').mockReturnValue(later);
    const c = await quoteMppChallengeHeader(f.quote.quote_id, url(f.quote.quote_id));
    expect(idOf(c)).toBeDefined();
    expect(idOf(c)).not.toBe(idOf(a));
    const memos = mockCharge.mock.calls.map((x) => x[0].memo);
    expect(memos).toEqual([f.quote.quote_id, f.quote.quote_id]);
  });

  it('MP2: two parallel credentials on one quote -> charge once, the other 409 quote_already_paying', async () => {
    const f = await fixture(5);
    let open!: () => void;
    gate = new Promise<void>((r) => (open = r));
    const first = run(quotePath(f), credential());
    await new Promise((r) => setTimeout(r, 100));
    const second = await run(quotePath(f), credential());
    expect(second.status).toBe(409);
    expect(second.body.error_code).toBe('quote_already_paying');
    open();
    const o = await first;
    expect(o.next).toBe(true);
    expect(handlerCalls).toBe(1);
    expect(mockCharge).toHaveBeenCalledTimes(1);
    finish(o);
    await new Promise((r) => setTimeout(r, 20));
    expect(kv.has(`quote:${f.quote.quote_id}:paying`)).toBe(false);
  });

  it('MP3: Redis down -> 503, charge never called', async () => {
    const f = await fixture(5);
    redisDown = true;
    const o = await run(quotePath(f), credential());
    expect(o.err).toBeInstanceOf(AppError);
    expect((o.err as AppError).httpStatus).toBe(503);
    expect(mockCharge).not.toHaveBeenCalled();
  });

  it('MP4: fee off -> no `splits` key; fee on, $89 -> amount 89, splits [{fee wallet, 1.34}], recipient = payout_wallet_tempo, memo = quote_id', async () => {
    E['INTEGRATOR_FEE_ENABLED'] = 'false';
    const off = await fixture(89);
    const o1 = await run(quotePath(off), credential());
    expect(o1.next).toBe(true);
    const offParams = mockCharge.mock.calls[0][0];
    expect('splits' in offParams).toBe(false);
    expect(offParams).toMatchObject({
      amount: '89',
      recipient: PAYOUT_TEMPO,
      memo: off.quote.quote_id,
    });

    mockCharge.mockClear();
    E['INTEGRATOR_FEE_ENABLED'] = 'true';
    const on = await fixture(89);
    const o2 = await run(quotePath(on), credential());
    expect(o2.next).toBe(true);
    expect(mockCharge).toHaveBeenCalledWith({
      amount: '89',
      recipient: PAYOUT_TEMPO,
      memo: on.quote.quote_id,
      splits: [{ recipient: FEE_WALLET, amount: '1.34' }],
    });
  });

  it('MP5: POST /mcp + Authorization: Payment -> 400, charge never called (0256 M1)', async () => {
    const o = await run('/mcp', 'Payment x');
    expect(o.err).toBeInstanceOf(AppError);
    expect((o.err as AppError).httpStatus).toBe(400);
    expect(mockCharge).not.toHaveBeenCalled();
    expect(handlerCalls).toBe(0);
  });

  it('MP6: shop.order.pay on /mcp without X-Payment -> isError 402, pay.mpp.url is the REST url', async () => {
    const f = await fixture(5);
    const tools = new Map<string, (a: unknown) => Promise<any>>();
    registerOrderTools(
      { registerTool: (nm: string, _d: unknown, h: any) => tools.set(nm, h) } as never,
      'k',
      'rid',
      deps,
      { x402PaymentHeader: null } as never,
    );
    const r = await tools.get('shop.order.pay')!({ quote_id: f.quote.quote_id });
    expect(r.isError).toBe(true);
    const body = JSON.parse(r.content[0].text);
    expect(body.error).toBe('payment_required');
    expect(body.pay.mpp.url).toBe(url(f.quote.quote_id));
    expect(mockCharge).not.toHaveBeenCalled();
  });

  it('MP7: a valid credential -> PAID, shop_payments tempo/confirmed, payer = tx.from, tx_hash = receipt', async () => {
    const f = await fixture(5);
    const o = await run(quotePath(f), credential());
    expect(o.next).toBe(true);
    expect(o.req.mppPayment).toMatchObject({
      amount: '5',
      payer: TX_FROM,
      recipient: PAYOUT_TEMPO,
    });
    const r = await payQuote(deps, {
      quote_id: f.quote.quote_id,
      buyer: f.b,
      requestId: 'r',
      host: 'apibase.pro',
      mpp: o.req.mppPayment,
    });
    finish(o);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('paid');
    const p = await row(`SELECT * FROM shop_payments WHERE order_id = $1::uuid`, f.quote.order_id);
    expect(p).toMatchObject({
      rail: 'tempo',
      chain_status: 'confirmed',
      payer: TX_FROM,
      tx_hash: TX_HASH,
      pay_to: PAYOUT_TEMPO,
    });
    expect(p.nonce_or_challenge_id).toMatch(/^cred-/);
    const paid = await row(
      `SELECT count(*) AS c FROM shop_order_events WHERE order_id = $1::uuid AND to_state = 'PAID'`,
      f.quote.order_id,
    );
    expect(Number(paid.c)).toBe(1);
    const q = await row(
      `SELECT status FROM shop_quotes WHERE quote_id = $1::uuid`,
      f.quote.quote_id,
    );
    expect(q.status).toBe('paid');
  });

  it('MP8: a paid quote + a new credential -> 409 before charge', async () => {
    const f = await fixture(5);
    await prisma.$executeRawUnsafe(
      `UPDATE shop_quotes SET status = 'paid' WHERE quote_id = $1::uuid`,
      f.quote.quote_id,
    );
    const o = await run(quotePath(f), credential());
    expect(o.status).toBe(409);
    expect(o.body.error_code).toBe('quote_already_paying');
    expect(handlerCalls).toBe(0);
    expect(kv.has(`quote:${f.quote.quote_id}:paying`)).toBe(false);
  });

  it('MP9: charge throws (Tempo unreachable) -> 400, no order progress, lock released', async () => {
    const f = await fixture(5);
    chargeThrows = true;
    const o = await run(quotePath(f), credential());
    expect(o.err).toBeInstanceOf(AppError);
    expect((o.err as AppError).httpStatus).toBe(400);
    expect(
      (await row(`SELECT state FROM shop_orders WHERE order_id = $1::uuid`, f.quote.order_id))
        .state,
    ).toBe('QUOTED');
    expect(kv.has(`quote:${f.quote.quote_id}:paying`)).toBe(false);
  });
});
