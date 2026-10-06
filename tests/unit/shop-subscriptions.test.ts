/**
 * T-INT-41 SB1-SB10 (UC-9 / F-8): subscriptions renewed by the buyer's agent with an explicit
 * payment, on both rails. Real Postgres (TEST_DATABASE_URL, DISPOSABLE), real x402 header
 * decode/parse, real LocalFacilitatorClient-less escrow path. Mocked boundaries: facilitator
 * verify/settle, the replay-guard Redis, the operator signer. Time is the injected `deps.now`.
 * (SB8 Tempo, `splits` in the charge, is MP4b in mpp-quote-pay.test.ts.)
 */
import { decodeFunctionData, parseAbi } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { toMicroUsdc } from '../../src/config/x402.config';
import { payQuote } from '../../src/shop/pay.service';
import { createQuote } from '../../src/shop/quote.service';
import { getOrderView } from '../../src/shop/order-payment.service';
import {
  buildFeeSplitXPayment,
  type FeeSplitChallenge,
} from '../../scripts/shop/examples/x402-fee-split-client';
import {
  cancelSubscription,
  getSubscription,
  listMerchantSubscriptions,
  merchantCancelSubscription,
  runSubscriptionSweep,
} from '../../src/shop/subscription.service';
import { applySubscriptionPayment } from '../../src/shop/subscription-core';
import { CatalogItemSchema } from '../../src/shop/catalog.service';
import { HANDLED_EVENT_TYPES } from '../../src/outbox/processor';
import { shopToolDefinitions } from '../../src/shop/tool-definitions';
import { getMerchantStats } from '../../src/shop/stats.service';
import type { ShopDeps } from '../../src/shop/merchant-lifecycle.service';
import { client, dbDescribe, migrate, mkMerchant } from './helpers/shop-db';

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
// Replay guard + its Redis: one shared key set, so a rollback (`del`) is observable ("Redis empty").
const claimed = new Set<string>();
const mockClaim = jest.fn(async (_rail: string, nonce: string) => {
  if (claimed.has(nonce)) return false;
  claimed.add(nonce);
  return true;
});
jest.mock('../../src/services/payment-nonce.service', () => ({
  claimPaymentNonce: (r: string, n: string) => mockClaim(r, n),
}));
jest.mock('../../src/services/redis.service', () => ({
  ensureRedisConnected: async () => ({
    del: async (...keys: string[]) => {
      for (const k of keys) claimed.delete(k.replace('payment-nonce:x402:', ''));
      return keys.length;
    },
  }),
}));
const mockVerify = jest.fn();
const mockSettle = jest.fn();
jest.mock('../../src/services/x402-server.service', () => ({
  getSharedResourceServer: () => ({ verifyPayment: mockVerify, settlePayment: mockSettle }),
}));
// Operator signer: the only thing that would touch the chain.
const MULTICALL3 = '0xca11bde05977b3631167028862be2a173976ca11';
const mockWrite = jest.fn();
const mockReceipt = jest.fn();
jest.mock('../../src/payments/operator-signer', () => ({
  getOperatorWallet: () => ({
    address: '0x00000000000000000000000000000000000000a0',
    signer: {
      chain: { contracts: { multicall3: { address: MULTICALL3 } } },
      writeContract: (a: unknown) => mockWrite(a),
      waitForTransactionReceipt: (a: unknown) => mockReceipt(a),
    },
  }),
}));
jest.mock('../../src/payments/operator-lock', () => ({
  withOperatorLock: (_addr: string, fn: () => Promise<unknown>) => fn(),
}));

type Row = Record<string, any>;
const E = process['env'];
const PLATFORM = '0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480';
const PAYOUT = '0x00000000000000000000000000000000000b0b0b';
const FEE_WALLET = '0x00000000000000000000000000000000000fee00';
const FEE_WALLET_BASE = '0x00000000000000000000000000000000000fee0b';
const TEMPO = '0x9E29FF84B0f3EDa9756262d2F950C435495BA8cC';
const TX = `0x${'ab'.repeat(32)}`;
const usdcAbi = parseAbi([
  'function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)',
]);

const WEEK_MS = 7 * 86_400_000;
const HOUR_MS = 3_600_000;

dbDescribe('subscriptions: agent-renewed on both rails', () => {
  const prisma = client();
  let clock = Date.now();
  const deps: ShopDeps = {
    db: prisma as never,
    transaction: (fn) => prisma.$transaction((tx) => fn(tx as never)),
    redis: { incr: async () => 1, expire: async () => 1 } as never,
    now: () => clock,
  };
  let n = 0;
  const tag = () => `${Date.now().toString(36)}u${n++}`;
  const buyer = () => ({ identity: `agent:${tag()}` });
  const account = privateKeyToAccount(generatePrivateKey());

  beforeAll(() => migrate());
  afterAll(() => prisma.$disconnect());
  beforeEach(() => {
    clock = Date.now();
    Object.assign(E, {
      INTEGRATOR_FEE_ENABLED: 'false',
      INTEGRATOR_BASE_ORDERS_ENABLED: 'true',
      MPP_ENABLED: 'true',
      INTEGRATOR_TEST_SKU_DAILY_CAP: '30',
      INTEGRATOR_FEE_WALLET: FEE_WALLET,
      INTEGRATOR_FEE_WALLET_BASE: FEE_WALLET_BASE,
      PUBLIC_BASE_URL: 'https://apibase.pro',
    });
    mockVerify.mockReset().mockImplementation(async (p: any) => ({
      isValid: true,
      payer: p.payload.authorization.from,
    }));
    mockSettle.mockReset().mockResolvedValue({ success: true, transaction: TX });
    mockWrite.mockReset().mockResolvedValue(TX);
    mockReceipt.mockReset().mockResolvedValue({ status: 'success' });
    mockClaim.mockClear();
    claimed.clear();
  });

  async function activate(merchant_id: string) {
    for (const doc_id of ['merchant-agreement', 'aup', 'dpa', 'refund-framework']) {
      const have = await prisma.$queryRawUnsafe<unknown[]>(
        `SELECT 1 FROM shop_legal_docs WHERE doc_id = $1`,
        doc_id,
      );
      if (have.length === 0) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO shop_legal_docs (doc_id, version, sha256, url, effective_from, body_md)
           VALUES ($1, 'int41', $2, $3, now() - interval '1 day', 'b')`,
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
      `UPDATE shop_merchants SET status = 'active', payout_wallet_base = $2,
              created_at = now() - interval '90 days' WHERE merchant_id = $1::uuid`,
      merchant_id,
      PAYOUT,
    );
  }
  const row = async (sql: string, ...v: unknown[]) =>
    (await prisma.$queryRawUnsafe<Row[]>(sql, ...v))[0];
  const rows = (sql: string, ...v: unknown[]) => prisma.$queryRawUnsafe<Row[]>(sql, ...v);
  const count = async (sql: string, ...v: unknown[]) => Number((await row(sql, ...v)).c);

  /** A merchant with a subscription item (weekly, $5) and a plain item. */
  async function shop(o: { price?: number; max_periods?: number; unit?: string } = {}) {
    const m = await mkMerchant(prisma, tag());
    await activate(m);
    const sku = `sub-${tag()}`;
    const plain = `plain-${tag()}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO shop_products (merchant_id, sku, title, price_usd, available, is_test, category,
                                  fulfillment_mode, subscription)
       VALUES ($1::uuid, $2, 'Plan', $3::numeric, NULL, false, 'books', 'instant', $4::jsonb),
              ($1::uuid, $5, 'Plain', 5, NULL, false, 'books', 'instant', NULL)`,
      m,
      sku,
      o.price ?? 5,
      JSON.stringify({
        period_unit: o.unit ?? 'week',
        period_count: 1,
        trial: 'none',
        ...(o.max_periods ? { max_periods: o.max_periods } : {}),
      }),
      plain,
    );
    return { m, sku, plain };
  }
  type Shop = Awaited<ReturnType<typeof shop>>;

  const encode = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64');
  const payX = (quote_id: string, who: { identity: string }, h?: string) =>
    payQuote(deps, {
      quote_id,
      x402PaymentHeader: h,
      buyer: who,
      requestId: 'r-1',
      host: 'apibase.pro',
    });
  /** Pays a quote with one authorization (no fee leg unless the challenge asks and `split`). */
  async function payQuoteId(quote_id: string, who: { identity: string }, split = false) {
    const c = (await payX(quote_id, who)).body as unknown as FeeSplitChallenge &
      Record<string, any>;
    const use = split
      ? c
      : (() => {
          const single = { ...c, accepts: [{ ...c.accepts[0], extra: { ...c.accepts[0].extra } }] };
          delete (single.accepts[0].extra as any).fee_split;
          return single;
        })();
    return payX(quote_id, who, await buildFeeSplitXPayment(account, use));
  }

  /** Subscribes (period 1 paid at the current clock) and returns the subscription row. */
  async function subscribed(s: Shop, who = buyer()) {
    const q = await createQuote(deps, s.m, who, {
      items: [{ sku: s.sku, qty: 1 }],
      subscribe: true,
    });
    const r = await payQuoteId(q.quote_id, who);
    expect(r.status).toBe(200);
    const sub = await row(`SELECT * FROM shop_subscriptions WHERE merchant_id = $1::uuid`, s.m);
    return { who, q, sub, id: sub.subscription_id as string };
  }
  const periods = (id: string) =>
    rows(
      `SELECT period_no, status, period_start, period_end, order_id FROM shop_subscription_periods
        WHERE subscription_id = $1::uuid ORDER BY period_no`,
      id,
    );
  const subRow = (id: string) =>
    row(`SELECT * FROM shop_subscriptions WHERE subscription_id = $1::uuid`, id);
  const events = (type: string, id: string) =>
    count(
      `SELECT count(*) AS c FROM outbox WHERE event_type = $1 AND payload->>'subscription_id' = $2`,
      `shop.subscription.${type}`,
      id,
    );
  const refusal = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e: any) {
      return e;
    }
    throw new Error('expected a refusal');
  };

  it('SB1: subscribe on an item without a subscription -> 422; with one -> subscription_terms; payment -> active + period 1', async () => {
    const s = await shop({ max_periods: 12 });
    const b = buyer();
    const bad = await refusal(
      createQuote(deps, s.m, b, { items: [{ sku: s.plain, qty: 1 }], subscribe: true }),
    );
    expect([bad.status, bad.error_code]).toEqual([422, 'validation_failed']);
    const unsub = await refusal(createQuote(deps, s.m, b, { items: [{ sku: s.sku, qty: 1 }] }));
    expect(unsub.status).toBe(422);
    const two = await refusal(
      createQuote(deps, s.m, b, { items: [{ sku: s.sku, qty: 2 }], subscribe: true }),
    );
    expect(two.status).toBe(422);

    const q = await createQuote(deps, s.m, b, { items: [{ sku: s.sku, qty: 1 }], subscribe: true });
    expect(q.subscription_terms).toEqual({
      period: { unit: 'week', count: 1 },
      amount: 5,
      max_periods: 12,
      renewal_window_h: 72,
      cancel_anytime: true,
    });
    expect(q.total_usd).toBe(5);
    expect(q.pay.x402?.extra).toEqual({ quote_id: q.quote_id });
    const r = await payQuoteId(q.quote_id, b);
    expect(r.status).toBe(200);
    const sub = await row(`SELECT * FROM shop_subscriptions WHERE merchant_id = $1::uuid`, s.m);
    expect(sub).toMatchObject({ status: 'active', rail_pref: 'base', max_periods: 12 });
    expect(new Date(sub.next_charge_at).getTime() - clock).toBeGreaterThan(WEEK_MS - 60_000);
    const ps = await periods(sub.subscription_id);
    expect(ps).toEqual([
      expect.objectContaining({ period_no: 1, status: 'paid', order_id: q.order_id }),
    ]);
    const paid = await row(
      `SELECT payload FROM shop_order_events WHERE order_id = $1::uuid AND to_state = 'PAID'`,
      q.order_id,
    );
    expect(paid.payload).toMatchObject({ subscription_id: sub.subscription_id, period_no: 1 });
    expect(await getOrderView(prisma as never, q.order_id, b.identity)).toMatchObject({
      subscription: { id: sub.subscription_id, period_no: 1 },
    });
    expect(await events('started', sub.subscription_id)).toBe(1);
  });

  it('SB1: the catalog schema accepts a subscription item and refuses the wrong shapes', () => {
    const base = {
      sku: 's1',
      title: 'Plan',
      price_usd: '5',
      category: 'books',
      fulfillment_mode: 'instant',
      fulfillment: { instant: { payload: 'x' } },
      subscription: { period_unit: 'month', period_count: 1, max_periods: 120 },
    };
    const ok = CatalogItemSchema.safeParse(base);
    expect(ok.success).toBe(true);
    expect((ok as any).data.subscription.trial).toBe('none');
    const fails = (patch: Record<string, unknown>) =>
      CatalogItemSchema.safeParse({ ...base, ...patch }).success;
    expect(fails({ subscription: { ...base.subscription, max_periods: 121 } })).toBe(false);
    expect(fails({ subscription: { ...base.subscription, period_count: 0 } })).toBe(false);
    expect(fails({ subscription: { ...base.subscription, period_unit: 'year' } })).toBe(false);
    expect(fails({ price_usd: '0.50' })).toBe(false);
    expect(fails({ fulfillment_mode: 'physical', fulfillment: undefined })).toBe(false);
    expect(fails({ stock: 3 })).toBe(false);
  });

  it('SB2: get outside the window has no renew; 71 h before period_end it has one; two gets give the same quote; after the TTL a new one', async () => {
    const s = await shop();
    const { who, id } = await subscribed(s);
    const end = new Date((await subRow(id)).next_charge_at).getTime();
    clock = end - 5 * 86_400_000;
    const early = await getSubscription(deps, who, id);
    expect(early.renew).toBeUndefined();
    expect(early).toMatchObject({ status: 'active', period_no: 1 });
    clock = end - 73 * HOUR_MS;
    expect((await getSubscription(deps, who, id)).renew).toBeUndefined();
    clock = end - 71 * HOUR_MS;
    const a = await getSubscription(deps, who, id);
    expect(a.renew).toMatchObject({ period_no: 2, total_usd: 5 });
    expect(a.renew?.pay.x402?.extra).toMatchObject({ subscription: { id, period_no: 2 } });
    const b = await getSubscription(deps, who, id);
    expect(b.renew?.quote_id).toBe(a.renew?.quote_id);
    clock += 16 * 60_000; // past the 15 min TTL
    const c = await getSubscription(deps, who, id);
    expect(c.renew?.quote_id).not.toBe(a.renew?.quote_id);
    expect(c.renew?.period_no).toBe(2);
  });

  it('SB3: paying the period-2 quote -> period 2 paid, next_charge_at += one period; a second quote of the same period is refused (409 / UNIQUE)', async () => {
    const s = await shop();
    const { who, id } = await subscribed(s);
    const end1 = new Date((await subRow(id)).next_charge_at).getTime();
    clock = end1 - 71 * HOUR_MS;
    const first = (await getSubscription(deps, who, id)).renew!;
    clock += 16 * 60_000;
    const second = (await getSubscription(deps, who, id)).renew!; // another quote, same period 2
    expect(second.quote_id).not.toBe(first.quote_id);

    const r = await payQuoteId(second.quote_id, who);
    expect(r.status).toBe(200);
    const ps = await periods(id);
    expect(ps.map((p) => [p.period_no, p.status])).toEqual([
      [1, 'paid'],
      [2, 'paid'],
    ]);
    expect(new Date((await subRow(id)).next_charge_at).getTime()).toBe(end1 + WEEK_MS);
    expect(await events('renewed', id)).toBe(1);
    const view = await getOrderView(prisma as never, ps[1].order_id, who.identity);
    expect(view.subscription).toEqual({ id, period_no: 2 });

    // the other quote of period 2: refused before ESCROW (no settle), and the UNIQUE holds in the hook
    mockSettle.mockClear();
    const dup = await payX(first.quote_id, who);
    expect(dup.status).toBe(409);
    expect(dup.body.error_code).toBe('subscription_period_paid');
    expect(mockSettle).not.toHaveBeenCalled();
    const orderOfFirst = await row(
      `SELECT order_id FROM shop_orders WHERE quote_id = $1::uuid`,
      first.quote_id,
    );
    const outcome = await prisma.$transaction((tx) =>
      applySubscriptionPayment(tx as never, {
        order_id: orderOfFirst.order_id,
        merchant_id: s.m,
        rail: 'base',
        at: new Date(clock),
      }),
    );
    expect(outcome).toEqual({ subscription_id: id, period_no: 2, duplicate: true });
    expect((await periods(id)).filter((p) => p.period_no === 2)).toHaveLength(1);
    expect(await events('renewed', id)).toBe(1);
  });

  it('SB4: period_end + 1 h unpaid -> past_due and get is 402 subscription_renewal_due with renew; +25 h one past_due event; +73 h canceled/unpaid + event', async () => {
    const s = await shop();
    const { who, id } = await subscribed(s);
    const end = new Date((await subRow(id)).next_charge_at).getTime();
    clock = end + HOUR_MS;
    const e1 = await refusal(getSubscription(deps, who, id));
    expect([e1.status, e1.error_code]).toEqual([402, 'subscription_renewal_due']);
    expect(e1.extra.renew).toMatchObject({ period_no: 2, quote_id: expect.any(String) });
    expect((await subRow(id)).status).toBe('past_due');
    expect(await events('past_due', id)).toBe(0);

    clock = end + 25 * HOUR_MS;
    await runSubscriptionSweep(deps, clock);
    await runSubscriptionSweep(deps, clock);
    expect(await events('past_due', id)).toBe(1);
    expect((await subRow(id)).status).toBe('past_due');

    clock = end + 73 * HOUR_MS;
    const rep = await runSubscriptionSweep(deps, clock);
    expect(rep.changed).toBeGreaterThan(0);
    expect(await subRow(id)).toMatchObject({ status: 'canceled', status_reason: 'unpaid' });
    expect(await events('canceled', id)).toBe(1);
    await runSubscriptionSweep(deps, clock + HOUR_MS);
    expect(await events('canceled', id)).toBe(1);
    expect(await events('past_due', id)).toBe(1);
    // an unpaid-canceled subscription offers no renewal and its old quote cannot be paid
    const view = await getSubscription(deps, who, id);
    expect(view).toMatchObject({ status: 'canceled', status_reason: 'unpaid' });
    expect(view.renew).toBeUndefined();
    const stale = await payX(e1.extra.renew.quote_id, who);
    expect(stale.status).toBe(409);
    expect(stale.body.error_code).toBe('subscription_not_renewable');
  });

  it('SB5: paying in past_due before +72 h makes the subscription active again', async () => {
    const s = await shop();
    const { who, id } = await subscribed(s);
    const end = new Date((await subRow(id)).next_charge_at).getTime();
    clock = end + 30 * HOUR_MS;
    const due = await refusal(getSubscription(deps, who, id));
    expect(due.error_code).toBe('subscription_renewal_due');
    const r = await payQuoteId(due.extra.renew.quote_id, who);
    expect(r.status).toBe(200);
    expect(await subRow(id)).toMatchObject({ status: 'active', status_reason: null });
    const view = await getSubscription(deps, who, id);
    expect(view).toMatchObject({ status: 'active', period_no: 2 });
    expect(new Date(view.next_charge_at!).getTime()).toBe(end + WEEK_MS);
    expect(await events('renewed', id)).toBe(1);
  });

  it('SB6: cancel by the payer -> canceled, no renew, the paid period stays; another identity gets 404', async () => {
    const s = await shop();
    const { who, id } = await subscribed(s);
    const end = new Date((await subRow(id)).next_charge_at).getTime();
    clock = end - 71 * HOUR_MS;
    const renew = (await getSubscription(deps, who, id)).renew!;
    const stranger = buyer();
    expect((await refusal(cancelSubscription(deps, stranger, id, 'x'))).status).toBe(404);
    expect((await refusal(getSubscription(deps, stranger, id))).status).toBe(404);
    const v = await cancelSubscription(deps, who, id, 'not needed');
    expect(v).toMatchObject({ status: 'canceled', status_reason: 'buyer' });
    expect(v.canceled_at).toBeDefined();
    expect(v.access_until).toBe(new Date(end).toISOString());
    expect(v.current_period_end).toBe(new Date(end).toISOString());
    const g = await getSubscription(deps, who, id);
    expect(g.renew).toBeUndefined();
    expect(g.status).toBe('canceled');
    expect(await events('canceled', id)).toBe(1);
    await cancelSubscription(deps, who, id, undefined); // idempotent
    expect(await events('canceled', id)).toBe(1);
    const late = await payX(renew.quote_id, who);
    expect(late.status).toBe(409);
    expect(late.body.error_code).toBe('subscription_not_renewable');
    expect((await refusal(getSubscription(deps, who, 'not-a-uuid'))).status).toBe(404);
  });

  it('SB7: a merchant lists and cancels only its own subscriptions', async () => {
    const a = await shop();
    const b = await shop();
    const sa = await subscribed(a);
    const sb = await subscribed(b);
    const la = await listMerchantSubscriptions(deps, a.m, {});
    expect(la.subscriptions.map((x) => x.subscription_id)).toEqual([sa.id]);
    expect(
      (await listMerchantSubscriptions(deps, b.m, { status: 'canceled' })).subscriptions,
    ).toEqual([]);
    expect(
      (await listMerchantSubscriptions(deps, b.m, { status: 'active' })).subscriptions,
    ).toHaveLength(1);
    expect((await refusal(listMerchantSubscriptions(deps, a.m, { status: 'paused' }))).status).toBe(
      422,
    );
    expect((await refusal(merchantCancelSubscription(deps, a.m, sb.id, 'x'))).status).toBe(404);
    expect((await subRow(sb.id)).status).toBe('active');
    const done = await merchantCancelSubscription(deps, a.m, sa.id, 'chargeback risk');
    expect(done).toMatchObject({ status: 'canceled', status_reason: 'merchant' });
    expect(await events('canceled', sa.id)).toBe(1);
    expect(((await getMerchantStats(deps, b.m, {})) as any).subscriptions_active).toBe(1);
    expect(((await getMerchantStats(deps, a.m, {})) as any).subscriptions_active).toBe(0);
  });

  it('SB8: a Base period with a fee: fee-split clients pay it in_tx, a single authorization leaves a receivable', async () => {
    E.INTEGRATOR_FEE_ENABLED = 'true';
    const s = await shop({ price: 89 });
    const first = buyer();
    const q1 = await createQuote(deps, s.m, first, {
      items: [{ sku: s.sku, qty: 1 }],
      subscribe: true,
    });
    expect(q1.pay.x402?.amount).toBe(toMicroUsdc(89));
    expect((await payQuoteId(q1.quote_id, first, false)).status).toBe(200);
    const sub = await row(`SELECT * FROM shop_subscriptions WHERE merchant_id = $1::uuid`, s.m);
    expect(
      await rows(
        `SELECT mode, status, fee_usd::float8 AS fee FROM shop_fee_ledger WHERE order_id = $1::uuid`,
        q1.order_id,
      ),
    ).toEqual([{ mode: 'receivable', status: 'owed', fee: 1.34 }]);
    expect(mockWrite).not.toHaveBeenCalled();

    clock = new Date(sub.next_charge_at).getTime() - 2 * HOUR_MS;
    const renew = (await getSubscription(deps, first, sub.subscription_id)).renew!;
    const r = await payQuoteId(renew.quote_id, first, true);
    expect(r.status).toBe(200);
    expect(mockWrite).toHaveBeenCalledTimes(1);
    const [calls] = mockWrite.mock.calls[0][0].args;
    const dec = calls.map((x: any) => decodeFunctionData({ abi: usdcAbi, data: x.callData }).args);
    expect(dec.map((a: any) => String(a[2]))).toEqual([toMicroUsdc(87.66), toMicroUsdc(1.34)]);
    const o2 = await row(
      `SELECT o.order_id, o.fee_settlement FROM shop_subscription_periods p JOIN shop_orders o ON o.order_id = p.order_id
        WHERE p.subscription_id = $1::uuid AND p.period_no = 2`,
      sub.subscription_id,
    );
    expect(o2.fee_settlement).toBe('in_tx');
    expect(
      await rows(
        `SELECT mode, status, fee_usd::float8 AS fee FROM shop_fee_ledger WHERE order_id = $1::uuid`,
        o2.order_id,
      ),
    ).toEqual([{ mode: 'in_tx', status: 'collected', fee: 1.34 }]);
  });

  it('SB9: the shop tool list carries shop.subscription.get and shop.subscription.cancel (T-INT-47 adds preauthorize)', async () => {
    const names = (await shopToolDefinitions()).map((t) => String(t.name));
    expect(names.filter((x) => x.startsWith('shop.subscription.')).sort()).toEqual([
      'shop.subscription.cancel',
      'shop.subscription.get',
      'shop.subscription.preauthorize',
    ]);
    expect(names).toHaveLength(24);
    const defs = await shopToolDefinitions();
    for (const t of defs.filter((d) => String(d.name).startsWith('shop.subscription.'))) {
      expect(t.outputSchema).toBeDefined();
    }
  });

  it('a subscription reaching max_periods is expired once its last period is over', async () => {
    const s = await shop({ max_periods: 2 });
    const { who, id } = await subscribed(s);
    const end1 = new Date((await subRow(id)).next_charge_at).getTime();
    clock = end1 - HOUR_MS;
    const renew = (await getSubscription(deps, who, id)).renew!;
    expect((await payQuoteId(renew.quote_id, who)).status).toBe(200);
    clock = end1 + 2 * HOUR_MS;
    const mid = await getSubscription(deps, who, id);
    expect(mid).toMatchObject({ status: 'active', period_no: 2 });
    expect(mid.renew).toBeUndefined(); // period 2 is the last one: nothing to renew
    clock = end1 + WEEK_MS + HOUR_MS;
    await runSubscriptionSweep(deps, clock);
    expect(await subRow(id)).toMatchObject({ status: 'expired' });
    expect(await events('expired', id)).toBe(1);
    expect((await getSubscription(deps, who, id)).renew).toBeUndefined();
  });

  it('monthly periods keep the day of the month, clamped to the end of a short month', async () => {
    const { addPeriod } = await import('../../src/shop/subscription-core');
    expect(addPeriod(new Date('2026-01-31T10:00:00Z'), 'month', 1).toISOString()).toBe(
      '2026-02-28T10:00:00.000Z',
    );
    expect(addPeriod(new Date('2026-03-15T10:00:00Z'), 'month', 12).toISOString()).toBe(
      '2027-03-15T10:00:00.000Z',
    );
    expect(addPeriod(new Date('2026-03-15T10:00:00Z'), 'week', 2).toISOString()).toBe(
      '2026-03-29T10:00:00.000Z',
    );
    expect(addPeriod(new Date('2026-03-15T10:00:00Z'), 'day', 3).toISOString()).toBe(
      '2026-03-18T10:00:00.000Z',
    );
  });
});

describe('SB10: webhook event types', () => {
  it('HANDLED_EVENT_TYPES carries the six subscription types and no money type (WH7)', () => {
    for (const t of ['started', 'renewed', 'past_due', 'canceled', 'expired', 'pull_failed']) {
      expect(HANDLED_EVENT_TYPES).toContain(`shop.subscription.${t}`);
    }
    expect(HANDLED_EVENT_TYPES).not.toContain('mpp_refund_owed');
    expect(HANDLED_EVENT_TYPES).not.toContain('x402_settle_failed');
  });
});
