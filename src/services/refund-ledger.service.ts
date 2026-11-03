import { createHash } from 'node:crypto';
import { logger } from '../config/logger';
import { isInternalWallet } from '../config/internal-wallets';
import { getPrisma } from './prisma.service';
import { refundLedgerWriteFailuresTotal } from './metrics.service';
import { usdToAtomic } from './public-receipt.service';

/**
 * T-0551 (REFUND-WALLET-1026 ruling-1): the one refund-owed ledger for Base x402 and Tempo MPP.
 * This module only RECORDS debts and reads them; it never signs or sends anything (the refund
 * payout job, 0553, pays them). Writers never throw into a payment path.
 */

export type RefundRail = 'base' | 'tempo';
export type RefundSourceKind = 'receipt' | 'order' | 'request';
export type RefundStatus = 'owed' | 'internal' | 'scheduled' | 'sent' | 'cancelled';

export interface RefundOwedInput {
  rail: RefundRail;
  payer: string;
  amount_usd: string | number;
  reason: string;
  source_kind: RefundSourceKind;
  source_id: string;
  receipt_id?: string | null;
  order_id?: string | null;
  payment_id?: string | null;
  original_tx?: string | null;
  note?: Record<string, unknown>;
}

export interface RefundLedgerRow {
  refund_id: string;
  rail: RefundRail;
  payer: string;
  amount_usd: string;
  reason: string;
  source_kind: RefundSourceKind;
  source_id: string;
  receipt_id: string | null;
  order_id: string | null;
  payment_id: string | null;
  original_tx: string | null;
  status: RefundStatus;
  payout_id: string | null;
  refund_tx: string | null;
  detected_at: Date;
  sent_at: Date | null;
  cancelled_reason: string | null;
}

/** Anything with the Prisma raw-query surface (the client or a shop transaction). */
export interface LedgerDb {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}

/** The public refund object (no internal rows, no payer, no ids). */
export interface PublicRefund {
  status: Exclude<RefundStatus, 'internal'>;
  amount_atomic: string;
  rail: RefundRail;
  detected_at: string;
  refund_tx: string | null;
  sent_at: string | null;
  reason: string;
}

const COLS = `refund_id::text, rail, payer, amount_usd::text, reason, source_kind, source_id,
  receipt_id, order_id::text, payment_id::text, original_tx, status, payout_id::text, refund_tx,
  detected_at, sent_at, cancelled_reason`;

const ORDER_DEBT_REASONS = new Set<string>(['duplicate_payment', 'paid_after_terminal']);

const walletTag = (w: string) => createHash('sha256').update(w).digest('hex').slice(0, 8);

/**
 * Books one debt. Idempotent on (source_kind, source_id, reason): a retried writer returns null
 * and books nothing. Returns the new row, or null (duplicate, invalid input or write failure).
 * Never throws. With `db` set (inside a shop transaction) the insert runs under a savepoint so a
 * failure cannot abort the caller's transaction.
 */
async function insertLedgerRow(
  row: RefundOwedInput,
  db?: LedgerDb,
): Promise<RefundLedgerRow | null> {
  const payer = typeof row.payer === 'string' ? row.payer.toLowerCase() : '';
  const tag = payer ? walletTag(payer) : 'none';
  const amount = Number(row.amount_usd);
  const inTx = db !== undefined;
  try {
    if (!payer || !Number.isFinite(amount) || amount <= 0) {
      throw new Error('refund_ledger: payer and a positive amount are required');
    }
    const exec: LedgerDb = db ?? (getPrisma() as unknown as LedgerDb);
    if (inTx) await exec.$executeRawUnsafe('SAVEPOINT refund_ledger_sp');
    try {
      const out = await exec.$queryRawUnsafe<RefundLedgerRow[]>(
        `INSERT INTO refund_ledger
           (rail, payer, amount_usd, reason, source_kind, source_id, receipt_id, order_id,
            payment_id, original_tx, status, note)
         VALUES ($1, $2, $3::numeric, $4, $5, $6, $7, $8::uuid, $9::uuid, $10, $11, $12::jsonb)
         ON CONFLICT (source_kind, source_id, reason) DO NOTHING
         RETURNING ${COLS}`,
        row.rail,
        payer,
        String(row.amount_usd),
        row.reason,
        row.source_kind,
        row.source_id,
        row.receipt_id ?? null,
        row.order_id ?? null,
        row.payment_id ?? null,
        row.original_tx ?? null,
        isInternalWallet(payer) ? 'internal' : 'owed',
        JSON.stringify(row.note ?? {}),
      );
      if (inTx) await exec.$executeRawUnsafe('RELEASE SAVEPOINT refund_ledger_sp');
      return out[0] ?? null;
    } catch (e) {
      if (inTx)
        await exec.$executeRawUnsafe('ROLLBACK TO SAVEPOINT refund_ledger_sp').catch(() => 0);
      throw e;
    }
  } catch (err) {
    refundLedgerWriteFailuresTotal.inc();
    logger.error(
      {
        event: 'refund_ledger_write_failed',
        err,
        rail: row.rail,
        reason: row.reason,
        source_kind: row.source_kind,
        source_id: row.source_id,
        payer_sha256: tag,
      },
      'refund ledger write FAILED — this refund will be missed unless caught manually',
    );
    return null;
  }
}

export async function listOwed(rail?: RefundRail): Promise<RefundLedgerRow[]> {
  return getPrisma().$queryRawUnsafe<RefundLedgerRow[]>(
    `SELECT ${COLS} FROM refund_ledger
      WHERE status = 'owed' AND ($1::text IS NULL OR rail = $1)
      ORDER BY detected_at`,
    rail ?? null,
  );
}

/** Closes a debt without paying it. Only owed/internal rows can be cancelled. */
export async function cancel(refundId: string, reason: string): Promise<boolean> {
  const n = await getPrisma().$executeRawUnsafe(
    `UPDATE refund_ledger SET status = 'cancelled', cancelled_reason = $2
      WHERE refund_id = $1::uuid AND status IN ('owed','internal')`,
    refundId,
    reason,
  );
  return n > 0;
}

interface PublicRow {
  status: PublicRefund['status'];
  amount_usd: string;
  rail: RefundRail;
  detected_at: Date;
  refund_tx: string | null;
  sent_at: Date | null;
  reason: string;
}

function toPublic(r: PublicRow): PublicRefund {
  return {
    status: r.status,
    amount_atomic: usdToAtomic(r.amount_usd) ?? '0',
    rail: r.rail,
    detected_at: new Date(r.detected_at).toISOString(),
    refund_tx: r.refund_tx,
    sent_at: r.sent_at ? new Date(r.sent_at).toISOString() : null,
    reason: r.reason,
  };
}

const PUBLIC_COLS = `status, amount_usd::text, rail, detected_at, refund_tx, sent_at, reason`;

/** The public refund object for a receipt, or null (no row, or an internal / cancelled row). */
export async function refundForReceipt(
  receiptId: string,
  db: LedgerDb = getPrisma() as unknown as LedgerDb,
): Promise<PublicRefund | null> {
  const rows = await db.$queryRawUnsafe<PublicRow[]>(
    `SELECT ${PUBLIC_COLS} FROM refund_ledger
      WHERE receipt_id = $1 AND status NOT IN ('internal','cancelled')
      ORDER BY detected_at DESC LIMIT 1`,
    receiptId,
  );
  return rows[0] ? toPublic(rows[0]) : null;
}

/** The public refund object for an order (APIbase-owed), or null. */
export async function refundForOrder(
  orderId: string,
  db: LedgerDb = getPrisma() as unknown as LedgerDb,
): Promise<PublicRefund | null> {
  const rows = await db.$queryRawUnsafe<PublicRow[]>(
    `SELECT ${PUBLIC_COLS} FROM refund_ledger
      WHERE order_id = $1::uuid AND status NOT IN ('internal','cancelled')
      ORDER BY detected_at DESC LIMIT 1`,
    orderId,
  );
  return rows[0] ? toPublic(rows[0]) : null;
}

/**
 * Public writer. T-0656: order-level debts (duplicate_payment / paid_after_terminal, written inside a
 * shop transaction) never reach the ledger as the whole payment: they go through bookOrderPaymentDebt
 * (decision B: fee share only, plus a seller refund request). Every other debt is booked as given.
 */
export async function recordRefundOwed(
  row: RefundOwedInput,
  db?: LedgerDb,
): Promise<RefundLedgerRow | null> {
  if (
    db &&
    row.source_kind === 'order' &&
    ORDER_DEBT_REASONS.has(row.reason) &&
    row.payment_id &&
    row.order_id
  ) {
    await bookOrderPaymentDebt(
      db,
      {
        payment_id: row.payment_id,
        order_id: row.order_id,
        rail: row.rail,
        payer: row.payer,
        amount_usd: String(row.amount_usd),
        original_tx: row.original_tx ?? null,
      },
      row.reason as OrderDebtReason,
    );
    return null;
  }
  return insertLedgerRow(row, db);
}

/** Seller refund window for a payment that arrived twice or after the order closed. */
const SYSTEM_REFUND_DAYS = 7;

export type OrderDebtReason = 'duplicate_payment' | 'paid_after_terminal';

export interface OrderDebtPayment {
  payment_id: string;
  order_id: string;
  rail: 'base' | 'tempo';
  payer: string;
  amount_usd: string;
  original_tx: string | null;
}

/**
 * T-0656 (operator decision 1 = B): the seller refunds the buyer himself, APIbase returns only its
 * own fee. The money of a duplicate / late order payment sits in the seller's payout wallet; APIbase
 * holds only the fee leg that was taken in the payment's own transaction (`splits` mode `in_tx`).
 *  - fee_share > 0: refund_ledger row for the fee share only (never the whole payment);
 *  - fee_share = 0: nothing in the ledger;
 *  - always: one system refund request on the seller (shop_refunds, 7 days, to the paying wallet,
 *    refund_to NULL), idempotent on (payment_id, reason). Records only; the order is never touched.
 * Runs inside the caller's transaction: a failed request insert rolls the whole booking back.
 */
export async function bookOrderPaymentDebt(
  tx: LedgerDb,
  p: OrderDebtPayment,
  reason: OrderDebtReason,
): Promise<{ fee_share_usd: string; seller_usd: string }> {
  const legs = await tx.$queryRawUnsafe<Array<{ fee: string; seller: string }>>(
    `SELECT fee::text AS fee, (amount - fee)::text AS seller FROM (
       SELECT $2::numeric AS amount,
              coalesce((SELECT sum((e->>'amount_usd')::numeric)
                          FROM shop_payments sp, jsonb_array_elements(sp.splits) e
                         WHERE sp.payment_id = $1::uuid AND e->>'mode' = 'in_tx'), 0) AS fee) t`,
    p.payment_id,
    p.amount_usd,
  );
  const fee = legs[0]?.fee ?? '0';
  const seller = legs[0]?.seller ?? p.amount_usd;
  const feeShare = Number(fee) > 0 ? Number(fee) : 0;
  if (feeShare > 0) {
    await insertLedgerRow(
      {
        rail: p.rail,
        payer: p.payer,
        amount_usd: fee,
        reason,
        source_kind: 'order',
        source_id: p.payment_id,
        order_id: p.order_id,
        payment_id: p.payment_id,
        original_tx: p.original_tx ?? undefined,
        note: { whole_amount_usd: p.amount_usd, fee_share_usd: fee, decision: 'B' },
      },
      tx,
    );
  }
  if (Number(seller) > 0) {
    await tx.$executeRawUnsafe(
      `INSERT INTO shop_refunds (order_id, payment_id, amount_usd, reason, requested_by, status, due_at)
       VALUES ($1::uuid, $2::uuid, $3::numeric, $4, 'system', 'awaiting_merchant_tx',
               now() + make_interval(days => $5::int))
       ON CONFLICT (payment_id, reason) WHERE requested_by = 'system' AND payment_id IS NOT NULL
       DO NOTHING`,
      p.order_id,
      p.payment_id,
      seller,
      reason,
      SYSTEM_REFUND_DAYS,
    );
  }
  return { fee_share_usd: fee, seller_usd: seller };
}
