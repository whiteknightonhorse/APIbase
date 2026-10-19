/**
 * T-0431 MS1-MS10 (UC-9 on Tempo, R-5): pull mode `mpp_subscription`. Real Postgres
 * (TEST_DATABASE_URL, DISPOSABLE), the real order/payment path of INT-41. Mocked boundaries: the
 * mppx renewer (`renew` is the only thing that would sign and send), the chain transfer reader,
 * Redis, the replay guard. The challenge itself is covered with the real mppx factory in
 * mpp-subscription-real-mppx.test.ts. No RPC.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toMicroUsdc } from '../../src/config/x402.config';
import { payQuote } from '../../src/shop/pay.service';
import { createQuote, mppSubscriptionAllowed } from '../../src/shop/quote.service';
import { cancelSubscription, getSubscription } from '../../src/shop/subscription.service';
import {
  classifyRenewError,
  forceDue,
  MppNotSentError,
  mppSubscriptionTerms,
  recordActivation,
  runMppRenewals,
  type MppRenewDeps,
  type MppRenewer,
} from '../../src/shop/subscription-mpp.service';
import type { TransferProof } from '../../src/shop/subscription-keychain.service';
import type { ShopDeps } from '../../src/shop/merchant-lifecycle.service';
import { runSubscriptionSweep } from '../../src/shop/subscription.service';
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
    MPP_TESTNET: 'true',
  },
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/services/moderation-ban.service', () => ({
  checkBan: jest.fn(async () => ({ banned: false, retryAfterSecs: 0 })),
}));
const claimed = new Set<string>();
jest.mock('../../src/services/payment-nonce.service', () => ({
  claimPaymentNonce: async (_rail: string, nonce: string) => {
    if (claimed.has(nonce)) return false;
    claimed.add(nonce);
    return true;
  },
}));
jest.mock('../../src/services/redis.service', () => ({
  ensureRedisConnected: async () => ({ del: async () => 1 }),
}));
jest.mock('../../src/services/x402-server.service', () => ({
  getSharedResourceServer: () => ({ verifyPayment: jest.fn(), settlePayment: jest.fn() }),
}));

type Row = Record<string, any>;
const E = process['env'];
const PAYOUT = '0x00000000000000000000000000000000000b0b0b';
const PAYOUT_TEMPO = '0x00000000000000000000000000000000000c0c0c';
const PAYOUT_TEMPO_2 = '0x00000000000000000000000000000000000c0c0d';
const FEE_WALLET = '0x00000000000000000000000000000000000fee00';
const PAYER = '0x00000000000000000000000000000000000a11ce';
const ACCESS_KEY = '0x00000000000000000000000000000000000ce001';
const RUN = Date.now().toString(36);
const txh = (c: string) => `0x${createHash('sha256').update(`${RUN}:${c}`).digest('hex')}`;
const DAY_MS = 86_400_000;
const PRICE = BigInt(toMicroUsdc(5));

describe('MS0: the mode rule (PAY-5, day/week only)', () => {
  const cfg = (o: Record<string, unknown>) =>
    ({
      fee_enabled: true,
      fee_bps: 150,
      fee_min_usd: 0.05,
      gas_estimate_usd: 0.003,
      ...o,
    }) as never;
  it('day and week plans with the fee on and covering 10x gas are offered', () => {
    expect(mppSubscriptionAllowed({ period_unit: 'day', amount_usd: 5 }, false, cfg({}))).toBe(
      true,
    );
    expect(mppSubscriptionAllowed({ period_unit: 'week', amount_usd: 5 }, false, cfg({}))).toBe(
      true,
    );
  });
  it('a month plan never gets the mode', () => {
    expect(mppSubscriptionAllowed({ period_unit: 'month', amount_usd: 50 }, false, cfg({}))).toBe(
      false,
    );
  });
  it('fee off, test SKU, or a fee below 10x gas: not offered', () => {
    const day = { period_unit: 'day' as const, amount_usd: 5 };
    expect(mppSubscriptionAllowed(day, false, cfg({ fee_enabled: false }))).toBe(false);
    expect(mppSubscriptionAllowed(day, true, cfg({}))).toBe(false);
    expect(mppSubscriptionAllowed(day, false, cfg({ gas_estimate_usd: 0.5 }))).toBe(false);
  });
});

describe('MS0b: classifyRenewError', () => {
  it('a confirmation timeout or a held transfer is an unknown outcome (never retried)', () => {
    expect(classifyRenewError(new Error('confirmation timeout')).kind).toBe('unknown');
    const e = new Error('x');
    e.name = 'PaymentOutcomeUnknownError';
    expect(classifyRenewError(e).kind).toBe('unknown');
    const held = classifyRenewError(
      new Error(`subscription transfer was not credited to the recipient: ${txh('held')}`),
    );
    expect(held).toEqual({ kind: 'unknown', tx_hash: txh('held') });
  });
  it('limit and revoked keys are told apart from the rest', () => {
    expect(classifyRenewError(new Error('spending limit exceeded')).kind).toBe('limit_exceeded');
    expect(classifyRenewError(new Error('access key revoked')).kind).toBe('key_revoked');
    expect(classifyRenewError(new Error('socket hang up')).kind).toBe('renew_failed');
  });
});

dbDescribe('subscriptions: MPP subscription intent, platform-run renewal (T-0431)', () => {
  const prisma = client();
  let clock = Date.now();
  const deps: ShopDeps = {
    db: prisma as never,
    transaction: (fn) => prisma.$transaction((tx) => fn(tx as never)),
    redis: { incr: async () => 1, expire: async () => 1 } as never,
    now: () => clock,
  };
  // the mocked mppx renewer
  const renew = jest.fn<Promise<{ reference: string } | null>, [string]>();
  const rewind = jest.fn(async () => true);
  const renewer: MppRenewer = { renew: (id) => renew(id), rewind };
  const proofs = new Map<string, TransferProof>();
  const rdeps = (): MppRenewDeps => ({
    ...deps,
    renewer,
    transfers: {
      read: async (h) => proofs.get(h) ?? { found: false, success: false, transfers: [] },
    },
  });
  let n = 0;
  const tag = () => `${Date.now().toString(36)}m${n++}`;
  const buyer = () => ({ identity: `agent:${tag()}` });

  beforeAll(() => migrate());
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    clock = Date.now();
    Object.assign(E, {
      INTEGRATOR_FEE_ENABLED: 'true',
      INTEGRATOR_BASE_ORDERS_ENABLED: 'false',
      MPP_ENABLED: 'true',
      INTEGRATOR_TEST_SKU_DAILY_CAP: '30',
      INTEGRATOR_FEE_WALLET: FEE_WALLET,
      PUBLIC_BASE_URL: 'https://apibase.pro',
    });
    // the sweep step is global: park the subscriptions and attempts of earlier tests
    await prisma.$executeRawUnsafe(
      `UPDATE shop_subscriptions SET pull_mode = 'none' WHERE pull_mode = 'mpp_subscription'`,
    );
    await prisma.$executeRawUnsafe(
      `UPDATE shop_subscription_mpp_renewals SET status = 'failed' WHERE status <> 'failed'`,
    );
    renew.mockReset();
    rewind.mockClear();
    proofs.clear();
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
  const row = async (sql: string, ...v: unknown[]) =>
    (await prisma.$queryRawUnsafe<Row[]>(sql, ...v))[0];
  const rows = (sql: string, ...v: unknown[]) => prisma.$queryRawUnsafe<Row[]>(sql, ...v);
  const count = async (sql: string, ...v: unknown[]) => Number((await row(sql, ...v)).c);

  async function shop(o: { unit?: string; max_periods?: number; price?: number } = {}) {
    const m = await mkMerchant(prisma, tag());
    await activate(m);
    const sku = `sub-${tag()}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO shop_products (moderation_status, merchant_id, sku, title, price_usd, available, is_test, category,
                                  fulfillment_mode, subscription)
       VALUES ('ok', $1::uuid, $2, 'Plan', $3::numeric, NULL, false, 'books', 'instant', $4::jsonb)`,
      m,
      sku,
      o.price ?? 5,
      JSON.stringify({
        period_unit: o.unit ?? 'day',
        period_count: 1,
        trial: 'none',
        ...(o.max_periods ? { max_periods: o.max_periods } : {}),
      }),
    );
    return { m, sku };
  }

  const header = (id: string) =>
    `Payment ${Buffer.from(JSON.stringify({ challenge: { id } })).toString('base64')}`;

  /** Period 1 paid with the subscription intent (what the middleware hands to payQuote). */
  async function mppSub(o: { unit?: string; max_periods?: number } = {}) {
    const s = await shop(o);
    const who = buyer();
    const q = await createQuote(deps, s.m, who, {
      items: [{ sku: s.sku, qty: 1 }],
      subscribe: true,
    });
    const hash = txh(`activation:${q.quote_id}`);
    await recordActivation(prisma as never, {
      receipt: { reference: hash },
      subscription: {
        subscriptionId: `mppx-${q.quote_id}`,
        lookupKey: `quote:${q.quote_id}`,
        recipient: PAYOUT_TEMPO,
        payer: { address: PAYER },
        accessKey: { accessKeyAddress: ACCESS_KEY },
        subscriptionExpires: new Date(Date.now() + 400 * DAY_MS).toISOString(),
      },
    });
    const r = await payQuote(deps, {
      quote_id: q.quote_id,
      buyer: who,
      requestId: 'r-1',
      host: 'apibase.pro',
      mpp: {
        verified: true,
        payer: PAYER,
        amount: String(q.total_usd),
        txHash: hash,
        asset: '0x20c0000000000000000000000000000000000000',
        method: 'tempo',
        header: header(`ch-${q.quote_id}`),
        recipient: PAYOUT_TEMPO,
        splits: [],
        intent: 'subscription',
      },
    });
    const sub = await row(`SELECT * FROM shop_subscriptions WHERE merchant_id = $1::uuid`, s.m);
    return { ...s, who, q, r, sub, id: sub?.subscription_id as string, hash };
  }
  const periods = (id: string) =>
    rows(
      `SELECT period_no, status, order_id FROM shop_subscription_periods
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
  const dueAt = async (id: string) => {
    clock = new Date((await subRow(id)).next_charge_at).getTime() + 60_000;
  };

  it('MS1: the quote offers the intent for a day plan; period 1 paid with it sets pull_mode and a fee receivable', async () => {
    const s = await shop();
    const who = buyer();
    const q = await createQuote(deps, s.m, who, {
      items: [{ sku: s.sku, qty: 1 }],
      subscribe: true,
    });
    expect(q.pay.mpp_subscription).toEqual({
      url: `https://apibase.pro/api/v1/shop/quotes/${q.quote_id}/pay?intent=subscription`,
      period: { unit: 'day', count: 1 },
      renewal: 'platform',
    });
    const t = await mppSubscriptionTerms(q.quote_id, deps);
    expect(t.ok && t.terms.recipient).toBe(PAYOUT_TEMPO);
    expect(t.ok && Math.floor(t.terms.key_expires_at.getTime() / 1000) * 1000).toBe(
      t.ok && t.terms.key_expires_at.getTime(),
    );

    const b = await mppSub();
    expect(b.r.status).toBe(200);
    expect(b.sub.pull_mode).toBe('mpp_subscription');
    expect(
      (
        await row(
          `SELECT subscription_id FROM shop_subscription_mpp WHERE quote_id = $1::uuid`,
          b.q.quote_id,
        )
      ).subscription_id,
    ).toBe(b.id);
    const pay = await row(
      `SELECT p.splits, p.tx_hash, p.chain_status, o.fee_settlement, o.rail
         FROM shop_payments p JOIN shop_orders o ON o.order_id = p.order_id WHERE o.quote_id = $1::uuid`,
      b.q.quote_id,
    );
    expect(pay).toMatchObject({ tx_hash: b.hash, chain_status: 'confirmed', rail: 'tempo' });
    expect(pay.splits[0]).toMatchObject({ wallet: FEE_WALLET, mode: 'receivable' });
    expect(pay.fee_settlement).toBe('receivable');
    expect(
      await count(
        `SELECT count(*) AS c FROM shop_fee_ledger l JOIN shop_orders o ON o.order_id = l.order_id
          WHERE o.quote_id = $1::uuid AND l.status = 'owed'`,
        b.q.quote_id,
      ),
    ).toBe(1);

    const view = await getSubscription(deps, b.who, b.id);
    expect(view.pull_mode).toBe('mpp_subscription');
    expect(view.renewal_key).toBe(ACCESS_KEY);
  });

  it('MS1b: with the fee on, a plain MPP charge still needs the fee split (the intent flag does not weaken it)', async () => {
    const s = await shop();
    const who = buyer();
    const q = await createQuote(deps, s.m, who, {
      items: [{ sku: s.sku, qty: 1 }],
      subscribe: true,
    });
    const r = await payQuote(deps, {
      quote_id: q.quote_id,
      buyer: who,
      requestId: 'r-2',
      host: 'apibase.pro',
      mpp: {
        verified: true,
        payer: PAYER,
        amount: String(q.total_usd),
        txHash: txh('plain'),
        method: 'tempo',
        header: header(`ch-plain-${RUN}`),
        recipient: PAYOUT_TEMPO,
        splits: [],
      },
    });
    expect(r.status).toBe(402);
    expect(
      await count(`SELECT count(*) AS c FROM shop_subscriptions WHERE merchant_id = $1::uuid`, s.m),
    ).toBe(0);
  });

  it('MS2: a month plan never gets the mode; a day plan with the fee off neither', async () => {
    const month = await shop({ unit: 'month', price: 50 });
    const qm = await createQuote(deps, month.m, buyer(), {
      items: [{ sku: month.sku, qty: 1 }],
      subscribe: true,
    });
    expect(qm.pay.mpp_subscription).toBeUndefined();
    const tm = await mppSubscriptionTerms(qm.quote_id, deps);
    expect(tm.ok).toBe(false);

    E.INTEGRATOR_FEE_ENABLED = 'false';
    const day = await shop();
    const qd = await createQuote(deps, day.m, buyer(), {
      items: [{ sku: day.sku, qty: 1 }],
      subscribe: true,
    });
    expect(qd.pay.mpp_subscription).toBeUndefined();
    expect((await mppSubscriptionTerms(qd.quote_id, deps)).ok).toBe(false);
  });

  it('MS3: a due period is renewed once: period 2 PAID, one tx, fee receivable, renewed event', async () => {
    const b = await mppSub();
    await dueAt(b.id);
    const tx2 = txh('renew2');
    renew.mockResolvedValue({ reference: tx2 });
    const rep = await runMppRenewals(rdeps(), clock);
    expect(rep).toMatchObject({ due: 1, renewed: 1, failed: 0 });
    expect(renew).toHaveBeenCalledTimes(1);
    expect(renew).toHaveBeenCalledWith(`mppx-${b.q.quote_id}`);

    expect((await periods(b.id)).map((p) => [p.period_no, p.status])).toEqual([
      [1, 'paid'],
      [2, 'paid'],
    ]);
    const o2 = await row(
      `SELECT o.state, o.rail, o.tx_hash, o.fee_settlement, p.splits, p.pay_to, p.payer
         FROM shop_subscription_periods sp JOIN shop_orders o ON o.order_id = sp.order_id
         JOIN shop_payments p ON p.order_id = o.order_id
        WHERE sp.subscription_id = $1::uuid AND sp.period_no = 2`,
      b.id,
    );
    expect(o2).toMatchObject({
      state: expect.stringMatching(/PAID|FULFILLED|DELIVERED/),
      rail: 'tempo',
      tx_hash: tx2,
      fee_settlement: 'receivable',
      pay_to: PAYOUT_TEMPO,
      payer: PAYER,
    });
    expect(o2.splits[0]).toMatchObject({ mode: 'receivable', wallet: FEE_WALLET });
    expect(await events('renewed', b.id)).toBe(1);
    expect((await subRow(b.id)).pull_mode).toBe('mpp_subscription');

    // idempotent: the next tick (period not due yet) and a repeat of the same tick renew nothing
    await runMppRenewals(rdeps(), clock);
    await runMppRenewals(rdeps(), clock);
    expect(renew).toHaveBeenCalledTimes(1);
    expect(
      await count(
        `SELECT count(*) AS c FROM shop_subscription_mpp_renewals WHERE subscription_id = $1::uuid`,
        b.id,
      ),
    ).toBe(1);
  });

  it('MS4: two workers racing on one due period renew it once', async () => {
    const b = await mppSub();
    await dueAt(b.id);
    renew.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return { reference: txh('race') };
    });
    await Promise.all([runMppRenewals(rdeps(), clock), runMppRenewals(rdeps(), clock)]);
    expect(renew).toHaveBeenCalledTimes(1);
    expect((await periods(b.id)).length).toBe(2);
  });

  it('MS5: limit too low -> period unpaid, pull_mode none, one pull_failed, no second attempt, then past_due', async () => {
    const b = await mppSub();
    await dueAt(b.id);
    renew.mockRejectedValue(new Error('access key spending limit exceeded'));
    const rep = await runMppRenewals(rdeps(), clock);
    expect(rep).toMatchObject({ renewed: 0, failed: 1 });
    expect((await subRow(b.id)).pull_mode).toBe('none');
    expect(await events('pull_failed', b.id)).toBe(1);
    expect(
      await row(
        `SELECT status, reason FROM shop_subscription_mpp_renewals WHERE subscription_id = $1::uuid`,
        b.id,
      ),
    ).toMatchObject({ status: 'failed', reason: 'limit_exceeded' });
    expect((await periods(b.id)).length).toBe(1);
    await runMppRenewals(rdeps(), clock);
    expect(renew).toHaveBeenCalledTimes(1);
    // the existing INT-41 path takes over
    await runSubscriptionSweep(deps, clock);
    expect((await subRow(b.id)).status).toBe('past_due');
  });

  it('MS6: an unknown outcome is never retried; the chain settles it (found -> period paid)', async () => {
    const b = await mppSub();
    await dueAt(b.id);
    const tx2 = txh('unknown-ok');
    const e = new Error(`confirmation timeout ${tx2}`);
    renew.mockRejectedValue(e);
    const rep = await runMppRenewals(rdeps(), clock);
    expect(rep).toMatchObject({ unknown: 1, renewed: 0 });
    expect(
      await count(
        `SELECT count(*) AS c FROM outbox WHERE event_type = 'mpp_settle_unknown' AND payload->>'url' = $1`,
        `subscription:${b.id}`,
      ),
    ).toBe(1);
    expect((await subRow(b.id)).pull_mode).toBe('mpp_subscription');
    expect(renew).toHaveBeenCalledTimes(1);

    // the attempt is "old" on the test clock; a transaction the chain does not show yet waits
    await prisma.$executeRawUnsafe(
      `UPDATE shop_subscription_mpp_renewals SET updated_at = $2::timestamptz WHERE subscription_id = $1::uuid`,
      b.id,
      new Date(clock).toISOString(),
    );
    clock += 60_000;
    await runMppRenewals(rdeps(), clock);
    expect(
      (
        await row(
          `SELECT status FROM shop_subscription_mpp_renewals WHERE subscription_id = $1::uuid`,
          b.id,
        )
      ).status,
    ).toBe('unknown');

    // the chain shows the transfer: reconcile records the period, still without a second renew
    proofs.set(tx2, {
      found: true,
      success: true,
      transfers: [{ from: PAYER, to: PAYOUT_TEMPO, value: PRICE, memo: '0x' }],
    });
    clock += 5 * 60_000;
    const rep2 = await runMppRenewals(rdeps(), clock);
    expect(rep2.renewed).toBe(1);
    expect(renew).toHaveBeenCalledTimes(1);
    expect((await periods(b.id)).length).toBe(2);
    expect(
      await row(
        `SELECT status, tx_hash FROM shop_subscription_mpp_renewals WHERE subscription_id = $1::uuid`,
        b.id,
      ),
    ).toMatchObject({ status: 'confirmed', tx_hash: tx2 });
  });

  it('MS7: an unknown outcome whose transaction reverted frees the period for past_due (pull_failed)', async () => {
    const b = await mppSub();
    await dueAt(b.id);
    const tx2 = txh('unknown-reverted');
    renew.mockRejectedValue(new Error(`confirmation timeout ${tx2}`));
    await runMppRenewals(rdeps(), clock);
    proofs.set(tx2, { found: true, success: false, transfers: [] });
    clock += 5 * 60_000;
    await runMppRenewals(rdeps(), clock);
    expect((await periods(b.id)).length).toBe(1);
    expect((await subRow(b.id)).pull_mode).toBe('none');
    expect(await events('pull_failed', b.id)).toBe(1);
    expect(renew).toHaveBeenCalledTimes(1);
  });

  it('MS7b: an unknown outcome with no transaction is given up after 2 h with an operator alert', async () => {
    const b = await mppSub();
    await dueAt(b.id);
    renew.mockRejectedValue(new Error('confirmation timeout'));
    await runMppRenewals(rdeps(), clock);
    clock += 3 * 3_600_000;
    await runMppRenewals(rdeps(), clock);
    expect((await subRow(b.id)).pull_mode).toBe('none');
    expect(
      await count(
        `SELECT count(*) AS c FROM outbox WHERE event_type = 'mpp_settle_unknown' AND payload->>'url' = $1`,
        `subscription:${b.id}`,
      ),
    ).toBe(2);
    expect(renew).toHaveBeenCalledTimes(1);
  });

  it('MS8: cancel stops renewals and touches nothing on chain', async () => {
    const b = await mppSub();
    await cancelSubscription(deps, b.who, b.id, 'no thanks');
    await dueAt(b.id);
    renew.mockResolvedValue({ reference: txh('never') });
    const rep = await runMppRenewals(rdeps(), clock);
    expect(rep.due).toBe(0);
    expect(renew).not.toHaveBeenCalled();
    expect((await subRow(b.id)).status).toBe('canceled');
  });

  it('MS9: a moved payout wallet is never paid to the old one; max_periods ends the renewals', async () => {
    const a = await mppSub();
    await prisma.$executeRawUnsafe(
      `UPDATE shop_merchants SET payout_wallet_tempo = $2 WHERE merchant_id = $1::uuid`,
      a.m,
      PAYOUT_TEMPO_2,
    );
    await dueAt(a.id);
    const rep = await runMppRenewals(rdeps(), clock);
    expect(rep.failed).toBe(1);
    expect(renew).not.toHaveBeenCalled();
    expect((await subRow(a.id)).pull_mode).toBe('none');

    const c = await mppSub({ max_periods: 1 });
    await dueAt(c.id);
    renew.mockResolvedValue({ reference: txh('over') });
    const rep2 = await runMppRenewals(rdeps(), clock);
    expect(rep2.skipped).toBeGreaterThanOrEqual(1);
    expect(renew).not.toHaveBeenCalled();
  });

  it('MS10: a renewer that sent nothing (runtime down) frees the period for the next tick', async () => {
    const b = await mppSub();
    await dueAt(b.id);
    renew.mockRejectedValueOnce(new MppNotSentError('runtime down'));
    renew.mockResolvedValue({ reference: txh('later') });
    const rep = await runMppRenewals(rdeps(), clock);
    expect(rep).toMatchObject({ renewed: 0, skipped: 1 });
    expect((await subRow(b.id)).pull_mode).toBe('mpp_subscription');
    const rep2 = await runMppRenewals(rdeps(), clock);
    expect(rep2.renewed).toBe(1);
    expect(renew).toHaveBeenCalledTimes(2);
  });

  it('MS11: the sandbox hook moves the period back on testnet only', async () => {
    const b = await mppSub();
    expect(await forceDue(rdeps(), b.id, Date.now())).toBe(true);
    expect(rewind).toHaveBeenCalledWith(`mppx-${b.q.quote_id}`, DAY_MS);
    expect(new Date((await subRow(b.id)).next_charge_at).getTime()).toBeLessThanOrEqual(
      Date.now() + 5000,
    );
  });

  it('MS12: subscriptions of the other pull modes are untouched by the step', async () => {
    const s = await shop();
    const who = buyer();
    const q = await createQuote(deps, s.m, who, {
      items: [{ sku: s.sku, qty: 1 }],
      subscribe: true,
    });
    const paid = await payQuote(deps, {
      quote_id: q.quote_id,
      buyer: who,
      requestId: 'r-3',
      host: 'apibase.pro',
      mpp: {
        verified: true,
        payer: PAYER,
        amount: String(q.total_usd),
        txHash: txh('plain-charge'),
        method: 'tempo',
        header: header(`ch-charge-${RUN}`),
        recipient: PAYOUT_TEMPO,
        splits: [{ recipient: FEE_WALLET, amount: String(q.total_usd * 0 + 0.08) }],
      },
    });
    expect(paid.status).toBe(200);
    const sub = await row(`SELECT * FROM shop_subscriptions WHERE merchant_id = $1::uuid`, s.m);
    expect(sub.pull_mode).toBe('none');
    clock = new Date(sub.next_charge_at).getTime() + 60_000;
    const rep = await runMppRenewals(rdeps(), clock);
    expect(rep.due).toBe(0);
    expect(renew).not.toHaveBeenCalled();
  });

  it('MS13: the 0042 down script applies in one transaction and is then discarded', async () => {
    const { Client } = jest.requireActual('pg') as typeof import('pg');
    const c = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await c.connect();
    const down = readFileSync(
      join(__dirname, '../../scripts/shop/rollback-0042-mpp-subscription.sql'),
      'utf8',
    )
      .replace(/^BEGIN;$/m, '')
      .replace(/^COMMIT;$/m, '');
    const exists = async (t: string) =>
      (await c.query(`SELECT to_regclass('public.${t}') IS NOT NULL AS e`)).rows[0].e as boolean;
    try {
      await c.query('BEGIN');
      await c.query(down);
      expect(await exists('shop_subscription_mpp')).toBe(false);
      expect(await exists('shop_subscription_mpp_renewals')).toBe(false);
    } finally {
      await c.query('ROLLBACK');
      await c.end();
    }
    expect(
      (
        await prisma.$queryRawUnsafe<Array<{ e: boolean }>>(
          `SELECT to_regclass('public.shop_subscription_mpp') IS NOT NULL AS e`,
        )
      )[0].e,
    ).toBe(true);
  });
});
