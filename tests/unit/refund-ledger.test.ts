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
        `INSERT INTO shop_payments (order_id, rail, nonce_or_challenge_id, payer, eip3009_nonce, pay_to, amount_usd, chain_status)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, 1, $7) RETURNING payment_id`,
        o,
        over.rail ?? 'base',
        `n-${uniq()}`,
        PAYER,
        `0x${uniq().padStart(64, '0')}`,
        SELLER,
        status,
      )
    )[0].payment_id as string;

  it('RL5: confirmPayment on an EXPIRED order -> payment confirmed, ledger paid_after_terminal, order unchanged', async () => {
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
    const led = await q(`SELECT * FROM refund_ledger WHERE payment_id = $1::uuid`, p);
    expect(led).toHaveLength(1);
    expect(led[0]).toMatchObject({
      reason: 'paid_after_terminal',
      rail: 'base',
      payer: PAYER,
      original_tx: t,
      status: 'owed',
      source_kind: 'order',
      order_id: o,
    });
    expect(Number(led[0].amount_usd)).toBe(1);
    // a replay of the same confirmation books nothing more
    await confirmPayment(deps, { order_id: o, payment_id: p, tx_hash: t, payer: PAYER });
    expect(await q(`SELECT 1 FROM refund_ledger WHERE payment_id = $1::uuid`, p)).toHaveLength(1);
    expect(
      await q(
        `SELECT 1 FROM outbox WHERE event_type = 'shop.order.paid' AND payload->>'order_id' = $1`,
        o,
      ),
    ).toHaveLength(0);
  });

  it('RL6: reconcile - failed payment of a PAID order with the authorization used -> confirmed + ledger duplicate_payment, no shop_refunds row (decision 1 = B)', async () => {
    const { o } = await mkPaying('PAID');
    await mkPayment(o, 'confirmed');
    const dup = await mkPayment(o, 'failed');
    const found = tx();
    const chain: ChainReader = {
      receiptOk: jest.fn(async () => false),
      authorizationUsed: jest.fn(async () => true),
      findTransfer: jest.fn(async () => found),
    };
    await reconcile({ deps, chain });
    expect(
      (
        await q(`SELECT chain_status, tx_hash FROM shop_payments WHERE payment_id = $1::uuid`, dup)
      )[0],
    ).toEqual({
      chain_status: 'confirmed',
      tx_hash: found,
    });
    const led = await q(`SELECT * FROM refund_ledger WHERE payment_id = $1::uuid`, dup);
    expect(led).toHaveLength(1);
    expect(led[0]).toMatchObject({
      reason: 'duplicate_payment',
      original_tx: found,
      status: 'owed',
      order_id: o,
    });
    expect(await q(`SELECT 1 FROM shop_refunds WHERE order_id = $1::uuid`, o)).toHaveLength(0);
    expect((await q(`SELECT state FROM shop_orders WHERE order_id = $1::uuid`, o))[0].state).toBe(
      'PAID',
    );
    // second run: the payment is confirmed now, nothing new
    await reconcile({ deps, chain });
    expect(await q(`SELECT 1 FROM refund_ledger WHERE payment_id = $1::uuid`, dup)).toHaveLength(1);
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
