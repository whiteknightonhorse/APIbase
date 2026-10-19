/**
 * T-0431 SR1-SR7: the `?intent=subscription` branch of POST|GET /api/v1/shop/quotes/:id/pay in
 * mpp.middleware. Real Postgres (TEST_DATABASE_URL, disposable). Mocked: mppx/server (spies on
 * `tempo.subscription` and the per-quote `subscription(params)` handler), Redis (quote lock +
 * replay guard), viem (tx.from). The real mppx challenge is covered by
 * mpp-subscription-real-mppx.test.ts. Zero real charge/RPC.
 */
import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import { createQuote } from '../../src/shop/quote.service';
import {
  mppMiddleware,
  quoteMppChallengeHeader,
  quoteMppSubscriptionChallengeHeader,
} from '../../src/middleware/mpp.middleware';
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
    secretKey: 's'.repeat(32),
    realm: 'r',
    rpcUrl: 'http://rpc',
  }),
}));
jest.mock('../../src/pipeline/stages/tool-status.stage', () => ({ getToolPriceUsd: () => 1 }));

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

const mockCharge = jest.fn();
const mockSubscription = jest.fn();
const mockTempoSubscription = jest.fn();
let subCalls = 0;
let challengeSeq = 0;
const TX_HASH = `0x${'cd'.repeat(32)}`;
const TX_FROM = '0x00000000000000000000000000000000000a11ce';
jest.mock('mppx/server', () => ({
  Store: { redis: () => ({ update: () => undefined }) },
  Mppx: {
    create: () => ({
      charge: (params: unknown) => {
        mockCharge(params);
        return async (req: globalThis.Request) =>
          req.headers.get('authorization')
            ? { status: 200, withReceipt: (r: globalThis.Response) => r }
            : {
                status: 402,
                challenge: {
                  headers: new Headers({
                    'WWW-Authenticate':
                      'Payment id="ch-1", realm="r", method="tempo", intent="charge"',
                  }),
                },
              };
      },
      subscription: (params: unknown) => {
        mockSubscription(params);
        return async (req: globalThis.Request) => {
          subCalls++;
          if (req.headers.get('authorization')) {
            return { status: 200, withReceipt: (r: globalThis.Response) => r };
          }
          const id = `sub-ch-${++challengeSeq}`;
          return {
            status: 402,
            challenge: {
              headers: new Headers({
                'WWW-Authenticate': `Payment id="${id}", realm="r", method="tempo", intent="subscription"`,
              }),
            },
          };
        };
      },
    }),
  },
  tempo: Object.assign(() => ({}), {
    charge: () => ({}),
    subscription: (p: unknown) => {
      mockTempoSubscription(p);
      return [{}];
    },
    renewSubscription: async () => null,
  }),
}));
jest.mock('viem/accounts', () => ({ privateKeyToAccount: () => ({}) }));
jest.mock('mppx', () => ({ Receipt: { fromResponse: () => ({ reference: TX_HASH }) } }));
jest.mock('viem', () => ({
  ...jest.requireActual('viem'),
  http: () => ({}),
  createPublicClient: () => ({ getTransaction: async () => ({ from: TX_FROM }) }),
}));

type Row = Record<string, any>;
const E = process['env'];
const FEE_WALLET = '0x00000000000000000000000000000000000fee00';
const PAYOUT = '0x00000000000000000000000000000000000b0b0b';
const PAYOUT_TEMPO = '0x00000000000000000000000000000000000c0c0c';

dbDescribe('MPP subscription intent on /quotes/:id/pay (T-0431)', () => {
  const prisma = client();
  mockDb.c = prisma;
  const deps: ShopDeps = {
    db: prisma as never,
    transaction: (fn) => prisma.$transaction((tx) => fn(tx as never)),
    redis: { incr: async () => 1, expire: async () => 1 } as never,
  };
  let n = 0;
  const tag = () => `${Date.now().toString(36)}r${n++}`;

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
    subCalls = 0;
    mockCharge.mockClear();
    mockSubscription.mockClear();
  });

  async function fixture(unit: 'day' | 'week' | 'month', price = 5) {
    const m = await mkMerchant(prisma, tag());
    for (const doc_id of ['merchant-agreement', 'aup', 'dpa', 'refund-framework']) {
      const have = await prisma.$queryRawUnsafe<unknown[]>(
        `SELECT 1 FROM shop_legal_docs WHERE doc_id = $1`,
        doc_id,
      );
      if (have.length === 0) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO shop_legal_docs (doc_id, version, sha256, url, effective_from, body_md)
           VALUES ($1, 't0431', $2, $3, now() - interval '1 day', 'b')`,
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
    const sku = `sub-${tag()}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO shop_products (moderation_status, merchant_id, sku, title, price_usd, available, is_test, category,
                                  fulfillment_mode, subscription)
       VALUES ('ok', $1::uuid, $2, 'Plan', $3::numeric, NULL, false, 'books', 'instant', $4::jsonb)`,
      m,
      sku,
      price,
      JSON.stringify({ period_unit: unit, period_count: 1, trial: 'none' }),
    );
    const quote = await createQuote(
      deps,
      m,
      { identity: `agent:${tag()}` },
      {
        items: [{ sku, qty: 1 }],
        subscribe: true,
      },
    );
    return { m, quote };
  }
  const row = async (sql: string, ...v: unknown[]) =>
    (await prisma.$queryRawUnsafe<Row[]>(sql, ...v))[0];
  const url = (id: string, q = '?intent=subscription') =>
    `https://apibase.pro/api/v1/shop/quotes/${id}/pay${q}`;
  const credential = () =>
    `Payment ${Buffer.from(JSON.stringify({ challenge: { id: `cred-${tag()}` } })).toString('base64')}`;

  function run(path: string, query: Record<string, unknown>, auth?: string) {
    const req = {
      headers: auth ? { authorization: auth } : {},
      originalUrl: path,
      query,
      method: 'POST',
      body: {},
      get: () => 'apibase.pro',
      requestId: 'r-sub',
    } as unknown as Request;
    const res = Object.assign(new EventEmitter(), {
      status(c: number) {
        (this as any).code = c;
        return this;
      },
      json(b: unknown) {
        const o = this as any;
        o.done?.({ next: false, status: o.code, body: b, req, res: o });
        return this;
      },
      setHeader: () => undefined,
    }) as unknown as Response;
    return new Promise<{
      next: boolean;
      err?: unknown;
      status?: number;
      req: Request;
      res: Response;
    }>((resolve) => {
      (res as any).done = resolve;
      mppMiddleware(req, res, (err?: unknown) => resolve({ next: !err, err, req, res }));
    });
  }

  it('SR1: a day plan quote gets a subscription challenge built from SERVER data only', async () => {
    const f = await fixture('day');
    const h = await quoteMppSubscriptionChallengeHeader(f.quote.quote_id, url(f.quote.quote_id));
    expect(h).toContain('intent="subscription"');
    expect(mockSubscription).toHaveBeenCalledTimes(1);
    const p = mockSubscription.mock.calls[0][0];
    expect(p).toMatchObject({
      amount: '5',
      periodCount: '1',
      periodUnit: 'day',
      recipient: PAYOUT_TEMPO,
      externalId: f.quote.quote_id,
    });
    expect('splits' in p).toBe(false);
    expect(Date.parse(p.subscriptionExpires) % 1000).toBe(0);
    expect(Date.parse(p.subscriptionExpires)).toBeGreaterThan(Date.now() + 300 * 86_400_000);
    // the mppx subscription method was registered once, with the single pinned currency and a store
    const reg = mockTempoSubscription.mock.calls[0][0];
    expect(reg).toMatchObject({ currencies: ['0x1'], requireCredential: true, feePayer: true });
    expect(typeof reg.resolve).toBe('function');
    expect(await reg.resolve({ input: new Request(url(f.quote.quote_id)) })).toEqual({
      key: `quote:${f.quote.quote_id}`,
    });
    expect(await reg.resolve({ input: new Request('https://apibase.pro/other') })).toBeNull();
  });

  it('SR2: a month plan has no subscription challenge', async () => {
    const f = await fixture('month', 50);
    expect(
      await quoteMppSubscriptionChallengeHeader(f.quote.quote_id, url(f.quote.quote_id)),
    ).toBeNull();
    expect(subCalls).toBe(0);
  });

  it('SR3: the activated hook writes the activation row the PAID transition links', async () => {
    const f = await fixture('week');
    await quoteMppSubscriptionChallengeHeader(f.quote.quote_id, url(f.quote.quote_id));
    const reg = mockTempoSubscription.mock.calls[0][0];
    await reg.hooks.activated({
      receipt: { reference: TX_HASH },
      subscription: {
        subscriptionId: 'mppx-sub-1',
        lookupKey: `quote:${f.quote.quote_id}`,
        recipient: PAYOUT_TEMPO,
        payer: { address: TX_FROM },
        accessKey: { accessKeyAddress: '0x00000000000000000000000000000000000ce001' },
        subscriptionExpires: new Date(Date.now() + 86_400_000).toISOString(),
      },
    });
    expect(
      await row(
        `SELECT mppx_subscription_id AS i, access_key, activation_tx, subscription_id
           FROM shop_subscription_mpp WHERE quote_id = $1::uuid`,
        f.quote.quote_id,
      ),
    ).toMatchObject({
      i: 'mppx-sub-1',
      access_key: '0x00000000000000000000000000000000000ce001',
      activation_tx: TX_HASH,
      subscription_id: null,
    });
  });

  it('SR4: a credential with ?intent=subscription is verified by the subscription handler, no splits, intent set', async () => {
    const f = await fixture('day');
    const path = `/api/v1/shop/quotes/${f.quote.quote_id}/pay?intent=subscription`;
    const o = await run(path, { intent: 'subscription' }, credential());
    expect(o.next).toBe(true);
    expect(mockCharge).not.toHaveBeenCalled();
    expect(subCalls).toBe(1);
    expect(o.req.mppPayment).toMatchObject({
      verified: true,
      intent: 'subscription',
      recipient: PAYOUT_TEMPO,
      splits: [],
      amount: '5',
      txHash: TX_HASH,
      payer: TX_FROM,
    });
    o.res.emit('close');
  });

  it('SR5: without the intent the ordinary charge path is untouched', async () => {
    const f = await fixture('day');
    const o = await run(`/api/v1/shop/quotes/${f.quote.quote_id}/pay`, {}, credential());
    expect(o.next).toBe(true);
    expect(mockCharge).toHaveBeenCalledTimes(1);
    expect(subCalls).toBe(0);
    expect(o.req.mppPayment?.intent).toBeUndefined();
    expect(o.req.mppPayment?.splits).toHaveLength(1);
    o.res.emit('close');
  });

  it('SR6: ?intent as an array or another value never selects the subscription path (CodeQL type-confusion rule)', async () => {
    const f = await fixture('day');
    const path = `/api/v1/shop/quotes/${f.quote.quote_id}/pay?intent=subscription&intent=x`;
    const o = await run(path, { intent: ['subscription', 'x'] }, credential());
    expect(o.next).toBe(true);
    expect(mockCharge).toHaveBeenCalledTimes(1);
    expect(subCalls).toBe(0);
    o.res.emit('close');
  });

  it('SR7: a month-plan quote with the intent is refused with 400 before any charge, the lock is released', async () => {
    const f = await fixture('month', 50);
    const path = `/api/v1/shop/quotes/${f.quote.quote_id}/pay?intent=subscription`;
    const o = await run(path, { intent: 'subscription' }, credential());
    expect(o.err).toBeInstanceOf(AppError);
    expect((o.err as AppError).httpStatus).toBe(400);
    expect(subCalls).toBe(0);
    expect(mockCharge).not.toHaveBeenCalled();
    expect(kv.has(`quote:${f.quote.quote_id}:paying`)).toBe(false);
  });

  it('SR8: the plain challenge of the same quote is unchanged (charge, not subscription)', async () => {
    const f = await fixture('day');
    const h = await quoteMppChallengeHeader(f.quote.quote_id, url(f.quote.quote_id, ''));
    expect(h).not.toBeNull();
    expect(mockCharge).toHaveBeenCalledTimes(1);
    expect(subCalls).toBe(0);
  });
});
