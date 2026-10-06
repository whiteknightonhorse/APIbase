/**
 * T-INT-23 RF1-RF7: refunds verified on-chain (viem is a fake chain reader here), disputes, the
 * hourly reputation and its UC-17 thresholds, against a real Postgres (TEST_DATABASE_URL, disposable).
 */
import { runShopSlaSweeper } from '../../src/jobs/shop-sla-sweeper.job';
import { getX402Config } from '../../src/config/x402.config';
import { openDispute } from '../../src/shop/dispute.service';
import { merchantRefund, type RefundChain, type RefundDeps } from '../../src/shop/refund.service';
import { createQuote } from '../../src/shop/quote.service';
import { isPayer } from '../../src/shop/order-payment.service';
import { client, dbDescribe, migrate, mkMerchant } from './helpers/shop-db';

jest.mock('../../src/config/index', () => ({
  config: { ENCRYPTION_KEY: 'k'.repeat(40), X402_NETWORK: 'base' },
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/services/moderation-ban.service', () => ({
  checkBan: jest.fn(async () => ({ banned: false, retryAfterSecs: 0 })),
}));

type Row = Record<string, any>;
const D = 24 * 3_600_000;
const PAYER = '0x00000000000000000000000000000000000a11ce';
const OTHER = '0x00000000000000000000000000000000000b0b00';
const BUYER = 'agent:rf-buyer';
const USDC = getX402Config().usdcAddress;
// unique per run: a verified refund transaction is unique in the (disposable) database
let h = Date.now() * 1000;
const hash = () => `0x${(++h).toString(16).padStart(64, '0')}`;

dbDescribe('refunds, disputes, reputation', () => {
  const prisma = client();
  const txs = new Map<string, Awaited<ReturnType<RefundChain['receipt']>>>();
  const chain: RefundChain = {
    receipt: async (_rail, tx) => txs.get(tx) ?? { status: 'missing', transfers: [] },
  };
  const deps: RefundDeps = {
    db: prisma as never,
    transaction: (fn) => prisma.$transaction((tx) => fn(tx as never)),
    redis: { incr: async () => 1, expire: async () => 1 } as never,
    chain,
  };
  let n = 0;
  const tag = () => `${Date.now().toString(36)}r${n++}`;
  const q = (sql: string, ...v: unknown[]) => prisma.$queryRawUnsafe<Row[]>(sql, ...v);
  const x = (sql: string, ...v: unknown[]) => prisma.$executeRawUnsafe(sql, ...v);
  const fail = (p: Promise<unknown>) =>
    p.then(
      () => null,
      (e) => e as Row,
    );

  beforeAll(() => migrate());
  afterAll(() => prisma.$disconnect());

  /** A tx of USDC paying `micro` to `to` (success). */
  function paid(to: string, usd: number, token = USDC): string {
    const t = hash();
    txs.set(t, {
      status: 'success',
      transfers: [{ token, to, valueMicro: String(Math.round(usd * 1_000_000)) }],
    });
    return t;
  }
  async function merchant() {
    const m = await mkMerchant(prisma, tag());
    await x(`UPDATE shop_merchants SET status = 'active' WHERE merchant_id = $1::uuid`, m);
    return m;
  }
  async function order(
    m: string,
    state: string,
    total = 89,
    o: { test?: boolean; closedDaysAgo?: number } = {},
  ) {
    const quote_id = (
      await q(
        `INSERT INTO shop_quotes (merchant_id, buyer_identity, items, subtotal, total_usd, expires_at, status, is_test)
         VALUES ($1::uuid, $2, '[]'::jsonb, $3::numeric, $3::numeric, now() + interval '10 minutes', 'paid', $4)
         RETURNING quote_id`,
        m,
        BUYER,
        total,
        o.test ?? false,
      )
    )[0].quote_id;
    return (
      await q(
        `INSERT INTO shop_orders (quote_id, merchant_id, state, total_usd, fee_usd, payer_wallet, rail, settled_at)
         VALUES ($1::uuid, $2::uuid, $3, $4::numeric, 1.34, $5, 'base', now() - interval '1 day')
         RETURNING order_id`,
        quote_id,
        m,
        state,
        total,
        PAYER,
      )
    )[0].order_id as string;
  }
  const state = async (id: string) =>
    (await q(`SELECT state FROM shop_orders WHERE order_id = $1::uuid`, id))[0].state as string;
  const outbox = async (type: string, id: string) =>
    Number(
      (
        await q(
          `SELECT count(*)::int AS c FROM outbox WHERE event_type = $1 AND payload->>'order_id' = $2`,
          type,
          id,
        )
      )[0].c,
    );

  it('RF1: tx to the payer with value = total -> REFUNDED, verified = true', async () => {
    const m = await merchant();
    const o = await order(m, 'PAID');
    const r = await merchantRefund(deps, m, {
      order_id: o,
      amount: '89',
      tx_hash: paid(PAYER, 89),
    });
    expect(r).toMatchObject({
      state: 'REFUNDED',
      status: 'verified',
      verified_amount_usd: '89.000000',
    });
    const ref = (await q(`SELECT * FROM shop_refunds WHERE order_id = $1::uuid`, o))[0];
    expect(ref).toMatchObject({ verified: true, status: 'verified' });
    expect(Number(ref.verified_amount)).toBe(89);
    expect(await state(o)).toBe('REFUNDED');
    expect(await outbox('shop.refund.verified', o)).toBe(1);
    // the same transaction cannot settle a second refund
    const again = await fail(
      merchantRefund(deps, m, { order_id: o, amount: '89', tx_hash: ref.tx_hash }),
    );
    expect(again?.status).toBe(409);
  });

  it('RF2: tx to someone else (or too small, reverted, missing, wrong token) -> rejected, state unchanged', async () => {
    const m = await merchant();
    const o = await order(m, 'CONFIRMED');
    const cases: Array<[string, string]> = [
      [paid(OTHER, 89), 'no_usdc_transfer_to_payer'],
      [paid(PAYER, 10), 'transfer_below_amount'],
      [paid(PAYER, 89, '0x00000000000000000000000000000000deadbeef'), 'no_usdc_transfer_to_payer'],
      [hash(), 'tx_not_found_or_unconfirmed'],
    ];
    const reverted = hash();
    txs.set(reverted, { status: 'reverted', transfers: [] });
    cases.push([reverted, 'tx_reverted']);
    for (const [tx, why] of cases) {
      const e = await fail(merchantRefund(deps, m, { order_id: o, amount: '89', tx_hash: tx }));
      expect(e?.status).toBe(422);
      expect(e?.error_code).toBe('refund_rejected');
      expect(e?.extra?.reject_reason).toBe(why);
      expect(await state(o)).toBe('CONFIRMED');
    }
    const rows = await q(
      `SELECT status, verified, reject_reason FROM shop_refunds WHERE order_id = $1::uuid`,
      o,
    );
    expect(rows).toHaveLength(cases.length);
    expect(rows.every((r) => r.status === 'rejected' && r.verified === false)).toBe(true);
    // another merchant's order is 404
    const other = await merchant();
    expect(
      (await fail(merchantRefund(deps, other, { order_id: o, amount: '1', tx_hash: hash() })))
        ?.status,
    ).toBe(404);
  });

  it('RF3: $20 of $89 -> PARTIALLY_REFUNDED, then $69 -> REFUNDED; over the total -> 400', async () => {
    const m = await merchant();
    const o = await order(m, 'DELIVERED');
    const first = await merchantRefund(deps, m, {
      order_id: o,
      amount: '20',
      tx_hash: paid(PAYER, 20),
    });
    expect(first.state).toBe('PARTIALLY_REFUNDED');
    const over = await fail(
      merchantRefund(deps, m, { order_id: o, amount: '70', tx_hash: paid(PAYER, 70) }),
    );
    expect(over?.status).toBe(400);
    expect(over?.error_code).toBe('refund_exceeds_total');
    expect(await state(o)).toBe('PARTIALLY_REFUNDED');
    const second = await merchantRefund(deps, m, {
      order_id: o,
      amount: '69',
      tx_hash: paid(PAYER, 69),
    });
    expect(second).toMatchObject({ state: 'REFUNDED', refunded_usd: '89.000000' });
    const done = await fail(
      merchantRefund(deps, m, { order_id: o, amount: '1', tx_hash: paid(PAYER, 1) }),
    );
    expect(done?.status).toBe(409);
  });

  it('RF3b: a buyer refund request is claimed by the verified refund; the open remainder keeps its due date', async () => {
    const m = await merchant();
    const o = await order(m, 'PAID');
    await x(`UPDATE shop_orders SET state = 'REFUND_PENDING' WHERE order_id = $1::uuid`, o);
    await x(
      `INSERT INTO shop_refunds (order_id, amount_usd, reason, requested_by, status, due_at)
       VALUES ($1::uuid, 89, 'other', 'buyer', 'requested', now() + interval '7 days')`,
      o,
    );
    await merchantRefund(deps, m, { order_id: o, amount: '30', tx_hash: paid(PAYER, 30) });
    const rows = await q(
      `SELECT amount_usd::float8 AS a, status FROM shop_refunds WHERE order_id = $1::uuid ORDER BY created_at`,
      o,
    );
    expect(rows).toEqual([
      { a: 30, status: 'verified' },
      { a: 59, status: 'requested' },
    ]);
    await merchantRefund(deps, m, { order_id: o, amount: '59', tx_hash: paid(PAYER, 59) });
    expect(await state(o)).toBe('REFUNDED');
    expect(
      await q(`SELECT status FROM shop_refunds WHERE order_id = $1::uuid AND NOT verified`, o),
    ).toEqual([]);
  });

  it('RF4: the payer disputes -> DISPUTED, due_at about +7 days; another identity -> 404', async () => {
    const m = await merchant();
    const o = await order(m, 'DELIVERED');
    const stranger = await fail(
      openDispute(
        deps,
        { identity: 'agent:stranger' },
        { order_id: o, reason_code: 'not_received' },
      ),
    );
    expect(stranger?.status).toBe(404);
    expect(await state(o)).toBe('DELIVERED');

    const d = await openDispute(
      deps,
      { identity: BUYER },
      { order_id: o, reason_code: 'not_received', note: 'never came' },
    );
    expect(d).toMatchObject({ status: 'open', state: 'DISPUTED' });
    expect(Math.abs(new Date(d.due_at as Date).getTime() - Date.now() - 7 * D)).toBeLessThan(
      60_000,
    );
    expect(await state(o)).toBe('DISPUTED');
    const again = await openDispute(
      deps,
      { identity: BUYER },
      { order_id: o, reason_code: 'other' },
    );
    expect(again.dispute_id).toBe(d.dispute_id);
    expect(await outbox('shop.dispute.opened', o)).toBe(1);

    const bad = await fail(
      openDispute(deps, { identity: BUYER }, { order_id: o, reason_code: 'rude' }),
    );
    expect(bad?.status).toBe(422);
    const long = await fail(
      openDispute(
        deps,
        { identity: BUYER },
        { order_id: o, reason_code: 'other', note: 'x'.repeat(1001) },
      ),
    );
    expect(long?.status).toBe(422);
    // the payer is also identified by the paying wallet
    expect(isPayer({ buyer_identity: null, payer_wallet: PAYER }, 'agent:x')).toBe(false);

    // a verified refund resolves the dispute (DISPUTED -> REFUND_PENDING -> REFUNDED)
    await merchantRefund(deps, m, { order_id: o, amount: '89', tx_hash: paid(PAYER, 89) });
    expect(
      (await q(`SELECT status FROM shop_disputes WHERE dispute_id = $1::uuid`, d.dispute_id))[0]
        .status,
    ).toBe('resolved_refund');
    expect(await state(o)).toBe('REFUNDED');
  });

  it('RF5: due_at passed -> expired, the order returns, exactly one DISPUTE_UNANSWERED event', async () => {
    const m = await merchant();
    const o = await order(m, 'CONFIRMED');
    const d = await openDispute(
      deps,
      { identity: BUYER },
      { order_id: o, reason_code: 'not_as_described' },
    );
    const early = await runShopSlaSweeper(deps, Date.now() + 6 * D);
    expect(early.disputes_expired).toBe(0);
    const late = Date.now() + 8 * D;
    await runShopSlaSweeper(deps, late);
    await runShopSlaSweeper(deps, late + 5 * 60_000);
    expect(
      (await q(`SELECT status FROM shop_disputes WHERE dispute_id = $1::uuid`, d.dispute_id))[0]
        .status,
    ).toBe('expired');
    expect(await state(o)).toBe('CONFIRMED');
    expect(await outbox('shop.dispute.unanswered', o)).toBe(1);
  });

  it('RF5b: an overdue refund (also reason=duplicate) -> overdue + one event', async () => {
    const m = await merchant();
    const o = await order(m, 'REFUND_PENDING');
    await x(
      `INSERT INTO shop_refunds (order_id, amount_usd, reason, requested_by, status, due_at)
       VALUES ($1::uuid, 89, 'duplicate', 'system', 'awaiting_merchant_tx', now() + interval '7 days')`,
      o,
    );
    await runShopSlaSweeper(deps, Date.now() + 8 * D);
    await runShopSlaSweeper(deps, Date.now() + 8 * D + 600_000);
    expect(
      (await q(`SELECT status FROM shop_refunds WHERE order_id = $1::uuid`, o))[0].status,
    ).toBe('overdue');
    expect(await outbox('shop.refund.overdue', o)).toBe(1);
  });

  /** `closed` CLOSED orders, of which `disputed` carry a dispute; plus orders that must not count. */
  async function shop(
    closed: number,
    disputed: number,
    extra: { testDisputed?: number; dupDisputed?: number } = {},
  ) {
    const m = await merchant();
    const ids: string[] = [];
    for (let i = 0; i < closed; i++) ids.push(await order(m, 'CLOSED'));
    const dispute = (order_id: string, reason: string) =>
      x(
        `INSERT INTO shop_disputes (order_id, opened_by, reason_code, due_at, status)
         VALUES ($1::uuid, $2, $3, now() + interval '7 days', 'expired')`,
        order_id,
        BUYER,
        reason,
      );
    for (let i = 0; i < disputed; i++) await dispute(ids[i], 'not_received');
    for (let i = 0; i < (extra.testDisputed ?? 0); i++) {
      await dispute(await order(m, 'CLOSED', 5, { test: true }), 'not_received');
    }
    for (let i = 0; i < (extra.dupDisputed ?? 0); i++)
      await dispute(ids[closed - 1 - i], 'duplicate');
    return m;
  }
  const sweep = () => runShopSlaSweeper(deps, Date.now() + 1_000);
  const merchantRow = async (m: string) =>
    (
      await q(
        `SELECT status_reason, reputation FROM shop_merchants WHERE merchant_id = $1::uuid`,
        m,
      )
    )[0];
  const mails = async (m: string, template: string) =>
    Number(
      (
        await q(
          `SELECT count(*)::int AS c FROM email_events WHERE merchant_id = $1::uuid AND template = $2`,
          m,
          template,
        )
      )[0].c,
    );

  it('RF6: reputation, warning at 1 %, suspension at 2 % (quote 410); test SKU and duplicates not counted', async () => {
    // 1 dispute in 100 closed = 1 % -> warning; the 3 test-SKU disputes and 2 duplicate disputes are ignored
    const warn = await shop(100, 1, { testDisputed: 3, dupDisputed: 2 });
    await sweep();
    const w = await merchantRow(warn);
    expect(w.reputation).toMatchObject({
      orders_closed: 100,
      dispute_rate: 0.01,
      refund_rate: 0,
      closed_on_time_pct: 100,
    });
    expect(typeof w.reputation.as_of).toBe('string');
    expect(w.status_reason).toBeNull();
    expect(await mails(warn, 'dispute_rate_warning')).toBe(1);
    // once an hour: an immediate second sweep does not recompute, a week-old warning is not repeated early
    await sweep();
    expect(await mails(warn, 'dispute_rate_warning')).toBe(1);

    // 2 disputes in 100 = 2 % -> suspended, quotes are 410 until the operator clears status_reason
    const sus = await shop(100, 2);
    await sweep();
    const s = await merchantRow(sus);
    expect(s.reputation).toMatchObject({ dispute_rate: 0.02, orders_closed: 100 });
    expect(s.status_reason).toBe('disputes');
    expect(await mails(sus, 'merchant_disputes_suspended')).toBe(1);
    const gone = await fail(
      createQuote(deps, sus, { identity: 'agent:q' }, { items: [{ sku: 'nope', qty: 1 }] }),
    );
    expect(gone?.status).toBe(410);

    // the literal card numbers: 10 closed orders, 1 dispute = 0.1, far past 2 % -> suspended at once
    const ten = await shop(10, 1);
    await sweep();
    const t = await merchantRow(ten);
    expect(t.reputation.dispute_rate).toBe(0.1);
    expect(t.status_reason).toBe('disputes');

    // under 10 closed orders nothing applies, and the numbers still publish
    const few = await shop(9, 5);
    await sweep();
    const f = await merchantRow(few);
    expect(f.reputation).toMatchObject({ orders_closed: 9 });
    expect(f.status_reason).toBeNull();

    // test-SKU orders are not counted at all
    const onlyTest = await shop(10, 0, { testDisputed: 4 });
    await sweep();
    expect((await merchantRow(onlyTest)).reputation).toMatchObject({
      orders_closed: 10,
      dispute_rate: 0,
    });
  });

  it('RF7: a refund leaves shop_fee_ledger untouched (fee is not returned)', async () => {
    const m = await merchant();
    const o = await order(m, 'PAID');
    await x(
      `INSERT INTO shop_fee_ledger (merchant_id, order_id, fee_usd, mode, status) VALUES ($1::uuid, $2::uuid, 1.34, 'in_tx', 'collected')`,
      m,
      o,
    );
    const snap = () =>
      q(
        `SELECT entry_id, fee_usd::text, status FROM shop_fee_ledger WHERE order_id = $1::uuid ORDER BY entry_id`,
        o,
      );
    const before = await snap();
    await merchantRefund(deps, m, { order_id: o, amount: '89', tx_hash: paid(PAYER, 89) });
    expect(await snap()).toEqual(before);
  });
});
