/**
 * T-0551: refund_ledger (REFUND-WALLET-1026 ruling-1) against a real Postgres (TEST_DATABASE_URL,
 * disposable): the service, the two shop writers (paid_after_terminal, duplicate_payment) and the
 * refund object on shop.order.get. The chain is a fake reader; nothing is ever signed or sent.
 */
import { client, dbDescribe, migrate, mkMerchant, mkQuote, mkOrder } from './helpers/shop-db';

const mockPrisma = { current: undefined as unknown };
jest.mock('../../src/services/prisma.service', () => ({
  getPrisma: () => mockPrisma.current,
}));
jest.mock('../../src/config/index', () => ({
  config: { ENCRYPTION_KEY: 'k'.repeat(40), X402_NETWORK: 'base' },
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/config/x402.config', () => ({
  getX402Config: () => ({}),
  toMicroUsdc: (n: number) => String(Math.round(n * 1_000_000)),
}));
jest.mock('../../src/pipeline/stages/shop-settle', () => ({ finalizeConfirmed: jest.fn() }));

import {
  cancel,
  listOwed,
  recordRefundOwed,
  refundForOrder,
  refundForReceipt,
} from '../../src/services/refund-ledger.service';
import { confirmPayment, getOrderView } from '../../src/shop/order-payment.service';
import { run as reconcile, type ChainReader } from '../../src/jobs/shop-payment-reconcile.job';
import { flagOverdueSystemRefunds } from '../../src/jobs/shop-sla-sweeper.job';
import { verifyReceipt } from '../../src/shop/refund.service';
import { logger } from '../../src/config/logger';

type Row = Record<string, any>;
const PAYER = '0x00000000000000000000000000000000000a11ce';
const HEARTBEAT = '0x46F110B1AD8195AC1E59366149DFC39E3A88638B';
const SELLER = '0x00000000000000000000000000000000005e11e2';
let seq = Date.now() * 1000;
const uniq = () => (++seq).toString(16);
const tx = () => `0x${uniq().padStart(64, '0')}`;

dbDescribe('refund_ledger', () => {
  const prisma = client();
  mockPrisma.current = prisma;
  const q = (sql: string, ...v: unknown[]) => prisma.$queryRawUnsafe<Row[]>(sql, ...v);
  const x = (sql: string, ...v: unknown[]) => prisma.$executeRawUnsafe(sql, ...v);
  const deps = {
    db: prisma as never,
    transaction: <T>(fn: (t: never) => Promise<T>) => prisma.$transaction((t) => fn(t as never)),
  } as never;

  beforeAll(() => migrate());
  afterAll(() => prisma.$disconnect());
  beforeEach(() => jest.clearAllMocks());

  const base = (over: Record<string, unknown> = {}) => ({
    rail: 'tempo' as const,
    payer: PAYER,
    amount_usd: '0.002',
    reason: 'provider_call_failed',
    source_kind: 'request' as const,
    source_id: `req-${uniq()}`,
    ...over,
  });

  it('RL1: dedups on (source_kind, source_id, reason); a retried writer books nothing twice', async () => {
    const row = base();
    const first = await recordRefundOwed(row);
    expect(first).toMatchObject({ status: 'owed', rail: 'tempo', amount_usd: '0.002000' });
    expect(await recordRefundOwed(row)).toBeNull();
    expect(await recordRefundOwed({ ...row, reason: 'other_reason' })).not.toBeNull();
    const n = await q(
      `SELECT count(*)::int AS c FROM refund_ledger WHERE source_id = $1`,
      row.source_id,
    );
    expect(n[0].c).toBe(2);
  });

  it('RL2: payer is lowercased; an internal wallet is booked as status internal, not a debt', async () => {
    const ext = await recordRefundOwed(base({ payer: PAYER.toUpperCase().replace('0X', '0x') }));
    expect(ext?.payer).toBe(PAYER);
    const int = await recordRefundOwed(base({ payer: HEARTBEAT }));
    expect(int?.status).toBe('internal');
    expect(int?.payer).toBe(HEARTBEAT.toLowerCase());
    const owedIds = (await listOwed('tempo')).map((r) => r.refund_id);
    expect(owedIds).toContain(ext?.refund_id);
    expect(owedIds).not.toContain(int?.refund_id);
  });

  it('RL3: a failing write never throws, is logged with the event name and a hashed payer, and counted', async () => {
    const out = await recordRefundOwed(base({ amount_usd: '-1' }));
    expect(out).toBeNull();
    const err = (logger.error as jest.Mock).mock.calls[0][0];
    expect(err.event).toBe('refund_ledger_write_failed');
    expect(JSON.stringify(err.payer_sha256)).not.toContain(PAYER);
    expect(err.payer_sha256).toMatch(/^[0-9a-f]{8}$/);
    const { refundLedgerWriteFailuresTotal } = await import('../../src/services/metrics.service');
    expect((await refundLedgerWriteFailuresTotal.get()).values[0].value).toBeGreaterThan(0);
  });

  it('RL4: cancel closes an owed row once; the public shape hides internal and cancelled rows', async () => {
    const rid = `${uniq()}`.padStart(32, '0');
    const r = await recordRefundOwed(base({ receipt_id: rid, amount_usd: '0.5' }));
    expect(await refundForReceipt(rid)).toEqual({
      status: 'owed',
      amount_atomic: '500000',
      rail: 'tempo',
      detected_at: expect.any(String),
      refund_tx: null,
      sent_at: null,
      reason: 'provider_call_failed',
    });
    expect(await cancel(r!.refund_id, 'not owed')).toBe(true);
    expect(await cancel(r!.refund_id, 'again')).toBe(false);
    expect(await refundForReceipt(rid)).toBeNull();
    const rid2 = `${uniq()}`.padStart(32, '0');
    await recordRefundOwed(base({ receipt_id: rid2, payer: HEARTBEAT }));
    expect(await refundForReceipt(rid2)).toBeNull();
  });

  async function mkPaying(state: string) {
    const m = await mkMerchant(prisma, uniq());
    const o = await mkOrder(prisma, m, await mkQuote(prisma, m, { status: 'paid' }), state);
    return { m, o };
  }
  const mkPayment = async (o: string, status: string, over: Record<string, unknown> = {}) =>
    (
      await q(
        `INSERT INTO shop_payments (order_id, rail, nonce_or_challenge_id, payer, eip3009_nonce, pay_to, amount_usd, chain_status, splits)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, 1, $7, $8::jsonb) RETURNING payment_id`,
        o,
        over.rail ?? 'base',
        `n-${uniq()}`,
        PAYER,
        `0x${uniq().padStart(64, '0')}`,
        SELLER,
        status,
        JSON.stringify(over.splits ?? []),
      )
    )[0].payment_id as string;
  const FEE_LEG = [
    { wallet: SELLER, amount_usd: '0.1', fee_to: SELLER, fee: 0.1, mode: 'in_tx', nonce: '0xfee' },
  ];
  const chainFor = (found: string): ChainReader => ({
    receiptOk: jest.fn(async () => false),
    authorizationUsed: jest.fn(async () => true),
    findTransfer: jest.fn(async () => found),
  });
  const sysRows = (o: string) =>
    q(`SELECT * FROM shop_refunds WHERE order_id = $1::uuid AND requested_by = 'system'`, o);
  const orderState = async (o: string) =>
    (await q(`SELECT state FROM shop_orders WHERE order_id = $1::uuid`, o))[0].state;
  const approxDays = (d: Date, n: number) =>
    Math.abs(new Date(d).getTime() - (Date.now() + n * 86_400_000)) < 120_000;

  it('RL5: confirmPayment on an EXPIRED order -> payment confirmed, no ledger row at fee 0, system request for the whole amount, order unchanged', async () => {
    const { o } = await mkPaying('EXPIRED');
    const p = await mkPayment(o, 'pending');
    const t = tx();
    expect(
      await confirmPayment(deps, { order_id: o, payment_id: p, tx_hash: t, payer: PAYER }),
    ).toBe(false);
    expect((await q(`SELECT state FROM shop_orders WHERE order_id = $1::uuid`, o))[0].state).toBe(
      'EXPIRED',
    );
    expect(
      (
        await q(`SELECT chain_status, tx_hash FROM shop_payments WHERE payment_id = $1::uuid`, p)
      )[0],
    ).toEqual({
      chain_status: 'confirmed',
      tx_hash: t,
    });
    // decision B, fee 0: nothing in the ledger, the whole amount is a seller request to the payer
    expect(await q(`SELECT 1 FROM refund_ledger WHERE payment_id = $1::uuid`, p)).toHaveLength(0);
    const sys = await sysRows(o);
    expect(sys).toHaveLength(1);
    expect(sys[0]).toMatchObject({
      reason: 'paid_after_terminal',
      status: 'awaiting_merchant_tx',
      payment_id: p,
      refund_to: null,
      verified: false,
    });
    expect(Number(sys[0].amount_usd)).toBe(1);
    expect(approxDays(sys[0].due_at, 7)).toBe(true);
    // a replay of the same confirmation books nothing more
    await confirmPayment(deps, { order_id: o, payment_id: p, tx_hash: t, payer: PAYER });
    expect(await q(`SELECT 1 FROM refund_ledger WHERE payment_id = $1::uuid`, p)).toHaveLength(0);
    expect(await sysRows(o)).toHaveLength(1);
    expect(
      await q(
        `SELECT 1 FROM outbox WHERE event_type = 'shop.order.paid' AND payload->>'order_id' = $1`,
        o,
      ),
    ).toHaveLength(0);
  });

  it('RL6: duplicate with a fee leg -> ledger = fee share only, seller system request for the rest (7 d, to the payer), order untouched, replay books nothing', async () => {
    const { o } = await mkPaying('PAID');
    await mkPayment(o, 'confirmed');
    const dup = await mkPayment(o, 'failed', { splits: FEE_LEG });
    const found = tx();
    const chain = chainFor(found);
    await reconcile({ deps, chain });
    expect(
      (
        await q(`SELECT chain_status, tx_hash FROM shop_payments WHERE payment_id = $1::uuid`, dup)
      )[0],
    ).toEqual({ chain_status: 'confirmed', tx_hash: found });
    const led = await q(`SELECT * FROM refund_ledger WHERE payment_id = $1::uuid`, dup);
    expect(led).toHaveLength(1);
    expect(led[0]).toMatchObject({
      reason: 'duplicate_payment',
      original_tx: found,
      status: 'owed',
      order_id: o,
      note: { whole_amount_usd: '1.000000', fee_share_usd: '0.1', decision: 'B' },
    });
    expect(Number(led[0].amount_usd)).toBe(0.1); // never the whole payment (1)
    const sys = await sysRows(o);
    expect(sys).toHaveLength(1);
    expect(sys[0]).toMatchObject({
      reason: 'duplicate_payment',
      status: 'awaiting_merchant_tx',
      payment_id: dup,
      refund_to: null,
    });
    expect(Number(sys[0].amount_usd)).toBe(0.9);
    expect(approxDays(sys[0].due_at, 7)).toBe(true);
    expect(await orderState(o)).toBe('PAID');
    await reconcile({ deps, chain });
    expect(await q(`SELECT 1 FROM refund_ledger WHERE payment_id = $1::uuid`, dup)).toHaveLength(1);
    expect(await sysRows(o)).toHaveLength(1);
  });

  it('RL6b: duplicate with fee 0 -> no ledger row, system request for the whole amount', async () => {
    const { o } = await mkPaying('PAID');
    await mkPayment(o, 'confirmed');
    const dup = await mkPayment(o, 'failed');
    await reconcile({ deps, chain: chainFor(tx()) });
    expect(await q(`SELECT 1 FROM refund_ledger WHERE payment_id = $1::uuid`, dup)).toHaveLength(0);
    const sys = await sysRows(o);
    expect(sys).toHaveLength(1);
    expect(Number(sys[0].amount_usd)).toBe(1);
    expect(await orderState(o)).toBe('PAID');
  });

  it('RL5b: paid_after_terminal with a fee leg -> ledger = fee share, seller request for the rest', async () => {
    const { o } = await mkPaying('EXPIRED');
    const p = await mkPayment(o, 'pending', { splits: FEE_LEG });
    await confirmPayment(deps, { order_id: o, payment_id: p, tx_hash: tx(), payer: PAYER });
    const led = await q(`SELECT * FROM refund_ledger WHERE payment_id = $1::uuid`, p);
    expect(led).toHaveLength(1);
    expect(led[0]).toMatchObject({ reason: 'paid_after_terminal', note: { decision: 'B' } });
    expect(Number(led[0].amount_usd)).toBe(0.1);
    const sys = await sysRows(o);
    expect(sys).toHaveLength(1);
    expect(Number(sys[0].amount_usd)).toBe(0.9);
    expect(await orderState(o)).toBe('EXPIRED');
  });

  it('RL5c: Tempo fee leg (no mode) is taken in-tx -> ledger = fee share; a receivable leg is owed, not taken -> no ledger row', async () => {
    const TEMPO_LEG = [{ wallet: SELLER, amount_usd: '0.1' }];
    const a = await mkPaying('EXPIRED');
    const pa = await mkPayment(a.o, 'pending', { rail: 'tempo', splits: TEMPO_LEG });
    await confirmPayment(deps, { order_id: a.o, payment_id: pa, tx_hash: tx(), payer: PAYER });
    const led = await q(`SELECT * FROM refund_ledger WHERE payment_id = $1::uuid`, pa);
    expect(led).toHaveLength(1);
    expect(Number(led[0].amount_usd)).toBe(0.1);
    expect(Number((await sysRows(a.o))[0].amount_usd)).toBe(0.9);

    const b = await mkPaying('EXPIRED');
    const pb = await mkPayment(b.o, 'pending', {
      rail: 'tempo',
      splits: [{ ...TEMPO_LEG[0], mode: 'receivable' }],
    });
    await confirmPayment(deps, { order_id: b.o, payment_id: pb, tx_hash: tx(), payer: PAYER });
    expect(await q(`SELECT 1 FROM refund_ledger WHERE payment_id = $1::uuid`, pb)).toHaveLength(0);
    expect(Number((await sysRows(b.o))[0].amount_usd)).toBe(1);
  });

  it('RL10: overdue system request -> one moderation flag, a second sweep adds none, order untouched', async () => {
    const { m, o } = await mkPaying('PAID');
    await mkPayment(o, 'confirmed');
    const dup = await mkPayment(o, 'failed');
    await reconcile({ deps, chain: chainFor(tx()) });
    const now = new Date();
    expect(await flagOverdueSystemRefunds(deps, now)).toBe(0); // not due yet
    await x(
      `UPDATE shop_refunds SET due_at = now() - interval '1 hour' WHERE payment_id = $1::uuid`,
      dup,
    );
    expect(await flagOverdueSystemRefunds(deps, new Date())).toBe(1);
    expect(await flagOverdueSystemRefunds(deps, new Date())).toBe(0);
    const flags = await q(
      `SELECT merchant_id::text AS m FROM shop_moderation_reviews WHERE category = 'duplicate_refund_overdue'`,
    );
    expect(flags.filter((f) => f.m === m)).toHaveLength(1);
    expect(await orderState(o)).toBe('PAID');
    expect(await q(`SELECT 1 FROM refund_ledger WHERE payment_id = $1::uuid`, dup)).toHaveLength(0);
  });

  it('RL11: verifyReceipt accepts (from = pay_to, to = payer) for a system row and rejects a wrong `to`', () => {
    const TOKEN = '0x00000000000000000000000000000000000000aa';
    const ok = {
      status: 'success' as const,
      transfers: [{ token: TOKEN, from: SELLER, to: PAYER, valueMicro: '900000' }],
    };
    expect(verifyReceipt(ok, TOKEN, PAYER, SELLER, 900000n)).toBeNull();
    const wrongTo = {
      ...ok,
      transfers: [{ ...ok.transfers[0], to: '0x00000000000000000000000000000000000000bb' }],
    };
    expect(verifyReceipt(wrongTo, TOKEN, PAYER, SELLER, 900000n)).toBe('no_usdc_transfer_to_payer');
    const wrongFrom = { ...ok, transfers: [{ ...ok.transfers[0], from: PAYER }] };
    expect(verifyReceipt(wrongFrom, TOKEN, PAYER, SELLER, 900000n)).toBe('refund_tx_wrong_sender');
  });

  it('RL12: a system request never counts toward the order refund total', async () => {
    const { o } = await mkPaying('PAID');
    await mkPayment(o, 'confirmed');
    await mkPayment(o, 'failed');
    await reconcile({ deps, chain: chainFor(tx()) });
    await x(
      `UPDATE shop_refunds SET verified = true, verified_amount = amount_usd WHERE order_id = $1::uuid`,
      o,
    );
    const { refunded } = (
      await q(
        `SELECT (SELECT COALESCE(SUM(r.verified_amount), 0) FROM shop_refunds r
                  WHERE r.order_id = $1::uuid AND r.verified
                    AND NOT (r.requested_by = 'system' AND r.payment_id IS NOT NULL)) AS refunded`,
        o,
      )
    )[0];
    expect(Number(refunded)).toBe(0);
  });

  it('RL7: reconcile - authorization not used, or the chain unreadable -> nothing booked', async () => {
    const { o } = await mkPaying('PAID');
    await mkPayment(o, 'confirmed');
    const dup = await mkPayment(o, 'failed');
    const unused: ChainReader = {
      receiptOk: jest.fn(),
      authorizationUsed: jest.fn(async () => false),
      findTransfer: jest.fn(),
    };
    await reconcile({ deps, chain: unused });
    const down: ChainReader = {
      receiptOk: jest.fn(),
      authorizationUsed: jest.fn(async () => {
        throw new Error('rpc down');
      }),
      findTransfer: jest.fn(),
    };
    await reconcile({ deps, chain: down });
    expect(
      (await q(`SELECT chain_status FROM shop_payments WHERE payment_id = $1::uuid`, dup))[0]
        .chain_status,
    ).toBe('failed');
    expect(await q(`SELECT 1 FROM refund_ledger WHERE payment_id = $1::uuid`, dup)).toHaveLength(0);
  });

  it('RL8: shop.order.get view carries the refund object only when a visible ledger row exists', async () => {
    const { o } = await mkPaying('PAID');
    const before = await getOrderView(prisma as never, o, 'agent:x');
    expect('refund' in before).toBe(false);
    await recordRefundOwed(
      base({ source_kind: 'order', source_id: o, order_id: o, rail: 'base', amount_usd: '2.5' }),
    );
    const after = await getOrderView(prisma as never, o, 'agent:x');
    expect(after.refund).toMatchObject({ status: 'owed', amount_atomic: '2500000', rail: 'base' });
    expect(await refundForOrder(o)).toEqual(after.refund);
  });
});
