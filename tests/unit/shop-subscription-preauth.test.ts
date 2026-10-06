/**
 * T-INT-47 PA1-PA9 (UC-9 on Base): subscriptions pulled with pre-signed EIP-3009 authorizations.
 * Real Postgres (TEST_DATABASE_URL, DISPOSABLE), real viem signatures and verifyTypedData, the real
 * ESCROW -> settle path of `shop.order.pay`. Mocked boundaries: facilitator verify/settle, the
 * replay-guard Redis, the operator signer (aggregate3), the USDC `authorizationState` reader and
 * the clock (`deps.now`). No RPC, no transaction.
 */
import { decodeFunctionData, parseAbi } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { toMicroUsdc } from '../../src/config/x402.config';
import { logger } from '../../src/config/logger';
import { decryptSecret } from '../../src/services/secret-crypto.service';
import { payQuote } from '../../src/shop/pay.service';
import { createQuote } from '../../src/shop/quote.service';
import {
  buildFeeSplitXPayment,
  type FeeSplitChallenge,
} from '../../scripts/shop/examples/x402-fee-split-client';
import {
  buildPreauthorizations,
  type PreauthTerms,
} from '../../scripts/shop/examples/preauthorize-base';
import { cancelSubscription, getSubscription } from '../../src/shop/subscription.service';
import { preauthorizeSubscription } from '../../src/shop/subscription-preauth.service';
import { runSubscriptionPull } from '../../src/shop/subscription-pull.service';
import { addPeriod } from '../../src/shop/subscription-core';
import { shopToolDefinitions } from '../../src/shop/tool-definitions';
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
// Replay guard + its Redis (one key set: the replay guard's `payment-nonce:*` and the pull job's claims).
const claimed = new Set<string>();
const mockClaim = jest.fn(async (_rail: string, nonce: string) => {
  const k = `payment-nonce:x402:${nonce}`;
  if (claimed.has(k)) return false;
  claimed.add(k);
  return true;
});
jest.mock('../../src/services/payment-nonce.service', () => ({
  claimPaymentNonce: (r: string, n: string) => mockClaim(r, n),
}));
jest.mock('../../src/services/redis.service', () => ({
  ensureRedisConnected: async () => ({
    set: async (k: string, _v: string, _ex: string, _ttl: number, _nx: string) => {
      if (claimed.has(k)) return null;
      claimed.add(k);
      return 'OK';
    },
    del: async (...keys: string[]) => {
      for (const k of keys) claimed.delete(k);
      return keys.length;
    },
  }),
}));
const mockVerify = jest.fn();
const mockSettle = jest.fn();
jest.mock('../../src/services/x402-server.service', () => ({
  getSharedResourceServer: () => ({ verifyPayment: mockVerify, settlePayment: mockSettle }),
}));
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
const PAYOUT = '0x00000000000000000000000000000000000b0b0b';
const FEE_WALLET = '0x00000000000000000000000000000000000fee00';
const FEE_WALLET_BASE = '0x00000000000000000000000000000000000fee0b';
const TX = `0x${'ab'.repeat(32)}`;
const HOUR_MS = 3_600_000;
const WEEK_MS = 7 * 86_400_000;
const usdcAbi = parseAbi([
  'function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)',
]);
const SIG_RE = /0x[0-9a-f]{130}/;

dbDescribe('subscriptions: Base pull with pre-signed authorizations', () => {
  const prisma = client();
  let clock = Date.now();
  const deps: ShopDeps = {
    db: prisma as never,
    transaction: (fn) => prisma.$transaction((tx) => fn(tx as never)),
    redis: { incr: async () => 1, expire: async () => 1 } as never,
    now: () => clock,
  };
  const used = jest.fn(async (_from: string, _nonce: string) => false);
  const chain = { authorizationUsed: (f: string, n: string) => used(f, n) };
  const pull = (at: number = clock) => runSubscriptionPull(deps, at, { chain });
  let n = 0;
  const tag = () => `${Date.now().toString(36)}p${n++}`;
  const buyer = () => ({ identity: `agent:${tag()}` });
  const account = privateKeyToAccount(generatePrivateKey());
  const stranger = privateKeyToAccount(generatePrivateKey());

  beforeAll(() => migrate());
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    // the job scans every subscription: each test starts from an empty authorization table
    await prisma.$executeRawUnsafe(`DELETE FROM shop_subscription_authorizations`);
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
    used.mockReset().mockResolvedValue(false);
    (logger.info as jest.Mock).mockClear();
    (logger.warn as jest.Mock).mockClear();
    (logger.error as jest.Mock).mockClear();
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
           VALUES ($1, 'int47', $2, $3, now() - interval '1 day', 'b')`,
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

  async function shop(o: { price?: number; max_periods?: number } = {}) {
    const m = await mkMerchant(prisma, tag());
    await activate(m);
    const sku = `sub-${tag()}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO shop_products (merchant_id, sku, title, price_usd, available, is_test, category,
                                  fulfillment_mode, subscription)
       VALUES ($1::uuid, $2, 'Plan', $3::numeric, NULL, false, 'books', 'instant', $4::jsonb)`,
      m,
      sku,
      o.price ?? 5,
      JSON.stringify({
        period_unit: 'week',
        period_count: 1,
        trial: 'none',
        ...(o.max_periods ? { max_periods: o.max_periods } : {}),
      }),
    );
    return { m, sku };
  }
  type Shop = Awaited<ReturnType<typeof shop>>;

  const payX = (quote_id: string, who: { identity: string }, h?: string) =>
    payQuote(deps, {
      quote_id,
      x402PaymentHeader: h,
      buyer: who,
      requestId: 'r-1',
      host: 'apibase.pro',
    });
  /** Period 1: paid by `account` with one authorization (no fee leg). */
  async function subscribed(s: Shop, who = buyer()) {
    const q = await createQuote(deps, s.m, who, {
      items: [{ sku: s.sku, qty: 1 }],
      subscribe: true,
    });
    const c = (await payX(q.quote_id, who)).body as unknown as FeeSplitChallenge &
      Record<string, any>;
    const single = { ...c, accepts: [{ ...c.accepts[0], extra: { ...c.accepts[0].extra } }] };
    delete (single.accepts[0].extra as any).fee_split;
    const r = await payX(q.quote_id, who, await buildFeeSplitXPayment(account, single));
    expect(r.status).toBe(200);
    const sub = await row(`SELECT * FROM shop_subscriptions WHERE merchant_id = $1::uuid`, s.m);
    return { who, sub, id: sub.subscription_id as string, end1: new Date(sub.next_charge_at) };
  }

  /** Start (unix s) of period n: periods are contiguous weeks from the end of period 1. */
  const startOf = (end1: Date, no: number) =>
    Math.floor(addPeriod(end1, 'week', no - 2).getTime() / 1000);
  const terms = (end1: Date, nos: number[], o: Partial<PreauthTerms> = {}): PreauthTerms => ({
    asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    chainId: 8453,
    payTo: PAYOUT,
    amountMicro: toMicroUsdc(5),
    periods: nos.map((no) => ({ period_no: no, start: startOf(end1, no) })),
    ...o,
  });
  const authRows = (id: string) =>
    rows(
      `SELECT period_no, leg, status, nonce FROM shop_subscription_authorizations
        WHERE subscription_id = $1::uuid ORDER BY period_no, leg`,
      id,
    );
  const periodRows = (id: string) =>
    rows(
      `SELECT period_no, status, order_id FROM shop_subscription_periods
        WHERE subscription_id = $1::uuid ORDER BY period_no`,
      id,
    );
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
  const preauth = (id: string, who: { identity: string }, authorizations: unknown) =>
    preauthorizeSubscription(deps, who, id, { authorizations });

  it('PA1: 3 authorizations for periods 2-4 are stored pending; a bad one refuses the whole batch', async () => {
    const s = await shop({ max_periods: 12 });
    const { who, id, end1 } = await subscribed(s);
    const t = terms(end1, [2, 3, 4]);
    const auths = await buildPreauthorizations(account, t);

    // to != payout wallet: 422, the whole batch is refused, nothing is stored
    const wrongTo = await buildPreauthorizations(account, {
      ...t,
      periods: [t.periods[1]],
      payTo: '0x00000000000000000000000000000000000dead0',
    });
    const e1 = await refusal(preauth(id, who, [auths[0], wrongTo[0], auths[2]]));
    expect(e1.message).toMatch(/to must be/);
    expect([e1.status, e1.error_code]).toEqual([422, 'validation_failed']);
    expect(await authRows(id)).toEqual([]);

    // validAfter != period start
    const early = await buildPreauthorizations(account, {
      ...t,
      periods: [{ period_no: 2, start: startOf(end1, 2) - 60 }],
    });
    const e2 = await refusal(preauth(id, who, early));
    expect(e2.status).toBe(422);
    expect(e2.message).toMatch(/validAfter/);

    // value != price
    const cheap = await buildPreauthorizations(account, { ...t, amountMicro: toMicroUsdc(4) });
    expect((await refusal(preauth(id, who, cheap))).status).toBe(422);

    // a signature of another key over the same fields
    const other = await buildPreauthorizations(stranger, t);
    const forged = auths.map((a, i) => ({
      ...a,
      signature: other[i].signature,
    }));
    const e3 = await refusal(preauth(id, who, forged));
    expect(e3.status).toBe(422);
    expect(e3.message).toMatch(/signature/);
    // the stranger's own wallet is not the payer
    const e4 = await refusal(preauth(id, who, other));
    expect(e4.status).toBe(422);
    expect(await authRows(id)).toEqual([]);

    const ok = await preauth(id, who, auths);
    expect(ok.pull_mode).toBe('base_preauth');
    expect(ok.preauthorized_periods.map((p) => [p.period_no, p.status, p.fee_leg])).toEqual([
      [2, 'pending', false],
      [3, 'pending', false],
      [4, 'pending', false],
    ]);
    expect((await authRows(id)).map((r) => r.status)).toEqual(['pending', 'pending', 'pending']);
    const view = await getSubscription(deps, who, id);
    expect(view.pull_mode).toBe('base_preauth');
    expect(view.preauthorized_periods).toHaveLength(3);
    // the same period twice is refused
    const again = await buildPreauthorizations(account, { ...t, periods: t.periods.slice(0, 1) });
    expect((await refusal(preauth(id, who, again))).error_code).toBe(
      'period_already_preauthorized',
    );
  });

  it('PA2: before valid_after the job does nothing; after it exactly one payment of the period quote', async () => {
    const s = await shop({ max_periods: 12 });
    const { who, id, end1 } = await subscribed(s);
    await preauth(id, who, await buildPreauthorizations(account, terms(end1, [2, 3])));
    mockVerify.mockClear();
    mockSettle.mockClear();

    clock = startOf(end1, 2) * 1000 - HOUR_MS;
    expect(await pull()).toMatchObject({ checked: 0, paid: 0 });
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockSettle).not.toHaveBeenCalled();

    clock = startOf(end1, 2) * 1000 + 5 * 60_000;
    const r = await pull();
    expect(r).toMatchObject({ checked: 1, paid: 1 });
    // ESCROW verified against the binding of the period-2 quote: payee and amount are the server's
    expect(mockVerify).toHaveBeenCalledTimes(1);
    const [payload, requirements] = mockVerify.mock.calls[0];
    expect(requirements).toMatchObject({ payTo: PAYOUT, amount: toMicroUsdc(5) });
    expect(payload.payload.authorization).toMatchObject({ to: PAYOUT, value: toMicroUsdc(5) });
    expect(mockSettle).toHaveBeenCalledTimes(1);
    const ps = await periodRows(id);
    expect(ps.map((p) => [p.period_no, p.status])).toEqual([
      [1, 'paid'],
      [2, 'paid'],
    ]);
    const quoteOf = await row(
      `SELECT e.payload->'subscription' AS s FROM shop_order_events e
        WHERE e.order_id = $1::uuid AND e.seq = 1`,
      ps[1].order_id,
    );
    expect(quoteOf.s).toMatchObject({ subscription_id: id, period_no: 2 });
    expect((await authRows(id)).map((a) => [a.period_no, a.status])).toEqual([
      [2, 'settled'],
      [3, 'pending'],
    ]);
    const shown = (await getSubscription(deps, who, id)).preauthorized_periods!;
    expect(shown[0]).toMatchObject({ period_no: 2, status: 'settled', tx_hash: TX });
    // a second tick settles nothing more
    await pull();
    expect(mockSettle).toHaveBeenCalledTimes(1);
  });

  it('PA2: a duplicate row of the same period (two ticks at once) settles once', async () => {
    const s = await shop({ max_periods: 12 });
    const { who, id, end1 } = await subscribed(s);
    await preauth(id, who, await buildPreauthorizations(account, terms(end1, [2])));
    // the same period stored a second time with another nonce (a hand-made duplicate row)
    await prisma.$executeRawUnsafe(
      `INSERT INTO shop_subscription_authorizations (subscription_id, period_no, leg, from_address, to_address,
          value_micro, valid_after, valid_before, nonce, signature_enc, status)
       SELECT subscription_id, period_no, leg, from_address, to_address, value_micro, valid_after,
              valid_before, '0x' || repeat('d', 64), signature_enc, status
         FROM shop_subscription_authorizations WHERE subscription_id = $1::uuid`,
      id,
    );
    mockVerify.mockClear();
    mockSettle.mockClear();
    clock = startOf(end1, 2) * 1000 + 5 * 60_000;
    await Promise.all([pull(), pull()]);
    expect(mockVerify).toHaveBeenCalledTimes(1);
    expect(mockSettle).toHaveBeenCalledTimes(1);
    expect((await periodRows(id)).filter((p) => p.status === 'paid')).toHaveLength(2);
  });

  it('PA3: with the fee on, a fee leg settles through aggregate3 (in_tx); without it the fee is a receivable', async () => {
    E.INTEGRATOR_FEE_ENABLED = 'true';
    const s = await shop({ price: 89, max_periods: 12 });
    const { who, id, end1 } = await subscribed(s);
    const total = toMicroUsdc(89);
    const feeMicro = toMicroUsdc(1.34);
    const base = terms(end1, [2], { amountMicro: total });
    const withFee = await buildPreauthorizations(account, {
      ...base,
      fee: { to: FEE_WALLET_BASE, amountMicro: feeMicro },
    });
    const without = await buildPreauthorizations(account, {
      ...base,
      periods: [{ period_no: 3, start: startOf(end1, 3) }],
    });
    // a fee-split period needs the fee leg to be exact; a fee leg to another address is refused
    const wrongFee = await buildPreauthorizations(account, {
      ...base,
      fee: { to: PAYOUT, amountMicro: feeMicro },
    });
    expect((await refusal(preauth(id, who, wrongFee))).status).toBe(422);
    const ok = await preauth(id, who, [...withFee, ...without]);
    expect(ok.preauthorized_periods.map((p) => [p.period_no, p.fee_leg])).toEqual([
      [2, true],
      [3, false],
    ]);
    expect(
      await count(
        `SELECT count(*) AS c FROM shop_subscription_authorizations WHERE subscription_id = $1::uuid`,
        id,
      ),
    ).toBe(3);

    mockWrite.mockClear();
    mockSettle.mockClear();
    clock = startOf(end1, 2) * 1000 + 5 * 60_000;
    expect(await pull()).toMatchObject({ paid: 1 });
    expect(mockWrite).toHaveBeenCalledTimes(1);
    const [calls] = mockWrite.mock.calls[0][0].args;
    const dec = calls.map((x: any) => decodeFunctionData({ abi: usdcAbi, data: x.callData }).args);
    expect(dec.map((a: any) => String(a[2]))).toEqual([toMicroUsdc(87.66), feeMicro]);
    expect(dec.map((a: any) => String(a[1]).toLowerCase())).toEqual([PAYOUT, FEE_WALLET_BASE]);
    const o2 = (await periodRows(id))[1].order_id;
    expect(
      await rows(`SELECT mode, status FROM shop_fee_ledger WHERE order_id = $1::uuid`, o2),
    ).toEqual([{ mode: 'in_tx', status: 'collected' }]);
    expect(mockSettle).not.toHaveBeenCalled();

    clock = startOf(end1, 3) * 1000 + 5 * 60_000;
    expect(await pull()).toMatchObject({ paid: 1 });
    expect(mockWrite).toHaveBeenCalledTimes(1);
    expect(mockSettle).toHaveBeenCalledTimes(1);
    const o3 = (await periodRows(id))[2].order_id;
    expect(
      await rows(`SELECT mode, status FROM shop_fee_ledger WHERE order_id = $1::uuid`, o3),
    ).toEqual([{ mode: 'receivable', status: 'owed' }]);
  });

  it('PA4: an authorization already used (or canceled) on-chain by someone else is canceled, never settled', async () => {
    const s = await shop({ max_periods: 12 });
    const { who, id, end1 } = await subscribed(s);
    await preauth(id, who, await buildPreauthorizations(account, terms(end1, [2])));
    used.mockResolvedValue(true);
    mockVerify.mockClear();
    mockSettle.mockClear();
    clock = startOf(end1, 2) * 1000 + 5 * 60_000;
    expect(await pull()).toMatchObject({ canceled: 1, paid: 0 });
    expect(used).toHaveBeenCalled();
    expect((await authRows(id)).map((a) => a.status)).toEqual(['canceled']);
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockSettle).not.toHaveBeenCalled();
    expect((await periodRows(id)).map((p) => p.period_no)).toEqual([1]);
  });

  it('PA5: success:false keeps the authorization for the next tick; a settle then pays; running out of time fails it once', async () => {
    const s = await shop({ max_periods: 12 });
    const { who, id, end1 } = await subscribed(s);
    await preauth(id, who, await buildPreauthorizations(account, terms(end1, [2, 3])));
    const t2 = startOf(end1, 2) * 1000;

    mockSettle.mockClear().mockResolvedValue({ success: false, errorReason: 'insufficient_funds' });
    clock = t2 + 5 * 60_000;
    expect(await pull()).toMatchObject({ retry: 1, paid: 0 });
    expect((await authRows(id)).map((a) => [a.period_no, a.status])).toEqual([
      [2, 'pending'],
      [3, 'pending'],
    ]);
    expect(await events('pull_failed', id)).toBe(0);

    // the next tick: funds are there now, the SAME stored authorization is executed
    mockSettle.mockReset().mockResolvedValue({ success: true, transaction: TX });
    clock = t2 + HOUR_MS + 5 * 60_000;
    expect(await pull()).toMatchObject({ paid: 1 });
    expect((await periodRows(id)).map((p) => [p.period_no, p.status])).toEqual([
      [1, 'paid'],
      [2, 'paid'],
    ]);

    // period 3: every tick fails until validBefore - 10 min has passed
    const t3 = startOf(end1, 3) * 1000;
    mockSettle.mockReset().mockResolvedValue({ success: false, errorReason: 'insufficient_funds' });
    for (const h of [1, 2, 3]) {
      clock = t3 + h * HOUR_MS;
      await pull();
    }
    expect((await authRows(id)).map((a) => [a.period_no, a.status])).toEqual([
      [2, 'settled'],
      [3, 'pending'],
    ]);
    clock = t3 + 24 * HOUR_MS - 5 * 60_000; // validBefore is 24 h after the start; inside the 10 min margin
    expect(await pull()).toMatchObject({ failed: 1 });
    expect((await authRows(id)).map((a) => [a.period_no, a.status])).toEqual([
      [2, 'settled'],
      [3, 'failed'],
    ]);
    expect((await periodRows(id)).map((p) => [p.period_no, p.status])).toEqual([
      [1, 'paid'],
      [2, 'paid'],
      [3, 'past_due'],
    ]);
    // one event for the period, however often the job runs afterwards
    await pull(clock + HOUR_MS);
    await pull(clock + 2 * HOUR_MS);
    expect(await events('pull_failed', id)).toBe(1);
    // INT-41: the agent renews the failed period explicitly and it is credited (the past_due row is upgraded)
    mockSettle.mockReset().mockResolvedValue({ success: true, transaction: TX });
    clock = t3 + 25 * HOUR_MS;
    // past_due answers 402 subscription_renewal_due with the renewal quote attached
    const due = await refusal(getSubscription(deps, who, id));
    expect(due.error_code).toBe('subscription_renewal_due');
    const renew = due.extra.renew;
    expect(renew.period_no).toBe(3);
    const c = (await payX(renew.quote_id, who)).body as unknown as FeeSplitChallenge &
      Record<string, any>;
    const single = { ...c, accepts: [{ ...c.accepts[0], extra: { ...c.accepts[0].extra } }] };
    delete (single.accepts[0].extra as any).fee_split;
    expect(
      (await payX(renew.quote_id, who, await buildFeeSplitXPayment(account, single))).status,
    ).toBe(200);
    expect((await periodRows(id)).map((p) => [p.period_no, p.status])).toEqual([
      [1, 'paid'],
      [2, 'paid'],
      [3, 'paid'],
    ]);
  });

  it('PA6: cancel turns every pending authorization canceled and the job executes nothing', async () => {
    const s = await shop({ max_periods: 12 });
    const { who, id, end1 } = await subscribed(s);
    await preauth(id, who, await buildPreauthorizations(account, terms(end1, [2, 3, 4])));
    await cancelSubscription(deps, who, id, 'bye');
    expect((await authRows(id)).map((a) => a.status)).toEqual(['canceled', 'canceled', 'canceled']);
    mockVerify.mockClear();
    mockSettle.mockClear();
    clock = startOf(end1, 2) * 1000 + 5 * 60_000;
    expect(await pull()).toMatchObject({ checked: 0, paid: 0 });
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockSettle).not.toHaveBeenCalled();
    // a canceled subscription accepts no new authorization
    const e = await refusal(
      preauth(id, who, await buildPreauthorizations(account, terms(end1, [5]))),
    );
    expect(e.status).toBe(409);
  });

  it('PA7: 13 authorizations, a period beyond max_periods and a period already paid are all 422', async () => {
    const s = await shop({ max_periods: 3 });
    const { who, id, end1 } = await subscribed(s);
    const thirteen = await buildPreauthorizations(
      account,
      terms(
        end1,
        Array.from({ length: 13 }, (_, i) => i + 2),
      ),
    );
    expect((await refusal(preauth(id, who, thirteen))).status).toBe(422);
    expect((await refusal(preauth(id, who, []))).status).toBe(422);
    const beyond = await buildPreauthorizations(account, terms(end1, [4]));
    const e = await refusal(preauth(id, who, beyond));
    expect(e.status).toBe(422);
    expect(e.message).toMatch(/max_periods/);
    const paid = await buildPreauthorizations(account, {
      ...terms(end1, [2]),
      periods: [{ period_no: 1, start: startOf(end1, 2) - 7 * 86400 }],
    });
    expect((await refusal(preauth(id, who, paid))).status).toBe(422);
    expect(await authRows(id)).toEqual([]);
  });

  it('PA8: another identity gets 404, so does an unknown id', async () => {
    const s = await shop({ max_periods: 12 });
    const { id, end1 } = await subscribed(s);
    const auths = await buildPreauthorizations(account, terms(end1, [2]));
    expect((await refusal(preauth(id, buyer(), auths))).status).toBe(404);
    expect(
      (await refusal(preauth('00000000-0000-4000-8000-000000000000', buyer(), auths))).status,
    ).toBe(404);
    expect((await refusal(preauth('nope', buyer(), auths))).status).toBe(404);
    expect(await authRows(id)).toEqual([]);
  });

  it('PA9: the stored signature is ciphertext (secret-crypto) and no log line carries a signature', async () => {
    const s = await shop({ max_periods: 12 });
    const { who, id, end1 } = await subscribed(s);
    const auths = await buildPreauthorizations(account, terms(end1, [2, 3]));
    await preauth(id, who, auths);
    const stored = await rows(
      `SELECT signature_enc, encode(signature_enc, 'hex') AS hex, convert_from(signature_enc, 'UTF8') AS txt
         FROM shop_subscription_authorizations WHERE subscription_id = $1::uuid ORDER BY period_no`,
      id,
    );
    expect(stored).toHaveLength(2);
    const dump = JSON.stringify(
      await rows(
        `SELECT * FROM shop_subscription_authorizations WHERE subscription_id = $1::uuid`,
        id,
      ),
      (_k, v) => (typeof v === 'bigint' ? String(v) : v),
    );
    expect(dump).not.toMatch(SIG_RE);
    for (const [i, r] of stored.entries()) {
      expect(r.txt).not.toMatch(/^0x[0-9a-f]{130}$/);
      expect(r.hex).not.toContain(auths[i].signature.slice(2).toLowerCase());
      expect(decryptSecret(r.txt, 'k'.repeat(40))).toBe(auths[i].signature.toLowerCase());
    }
    // run the job through success and failure: nothing it logs carries a signature
    clock = startOf(end1, 2) * 1000 + 5 * 60_000;
    await pull();
    mockSettle.mockReset().mockResolvedValue({ success: false, errorReason: 'insufficient_funds' });
    clock = startOf(end1, 3) * 1000 + 5 * 60_000;
    await pull();
    const logged = JSON.stringify([
      (logger.info as jest.Mock).mock.calls,
      (logger.warn as jest.Mock).mock.calls,
      (logger.error as jest.Mock).mock.calls,
    ]);
    expect(logged).not.toMatch(SIG_RE);
    for (const a of auths) expect(logged).not.toContain(a.signature.slice(2, 40));
  });

  it('the shop tool list grew by exactly shop.subscription.preauthorize', async () => {
    const defs = await shopToolDefinitions();
    const names = defs.map((t) => String(t.name));
    expect(names.filter((x) => x.startsWith('shop.subscription.')).sort()).toEqual([
      'shop.subscription.cancel',
      'shop.subscription.get',
      'shop.subscription.preauthorize',
    ]);
    expect(names).toHaveLength(24);
    const t = defs.find((d) => d.name === 'shop.subscription.preauthorize')!;
    expect(t.outputSchema).toBeDefined();
  });
});
