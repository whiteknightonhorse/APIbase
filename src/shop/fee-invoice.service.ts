import { randomUUID } from 'node:crypto';
import type { ShopTx } from './db';
import type { ShopDeps } from './merchant-lifecycle.service';
import { QuoteError } from './quote.errors';
import { viemRefundChain, type RefundChain } from './refund.service';

/**
 * §7.1 (Base, wave 2) / §5.2 `shop_fee_invoices` / §12.2 FEE_INVOICE_OVERDUE. Base orders owe the
 * platform fee as a receivable (`shop_fee_ledger.mode = receivable, status = owed`); once a month
 * the owed rows of the closed months become one USDC invoice to our wallet. This module only does
 * the bookkeeping and READS the chain to verify a payment; it never sends or signs anything.
 */

const DOCS = '/docs/integrator#fee-invoices';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TX_RE = /^0x[0-9a-fA-F]{64}$/;
const DAY_MS = 86_400_000;
const MICRO = 1_000_000n;

const INVOICE_DUE_DAYS = 30;
/** Past `due_at`: the Base rail is switched off for the merchant (quotes offer Tempo only). */
const BASE_OFF_AFTER_DAYS = 30;
/** Past `due_at`: the merchant is suspended (quotes 410). */
const SUSPEND_AFTER_DAYS = 60;
const REASON_BASE_OFF = 'fee_overdue_base_off';
const REASON_SUSPENDED = 'fee_overdue_suspended';

export interface FeeInvoiceDeps extends ShopDeps {
  chain?: RefundChain;
}

const emit = (db: ShopTx, event_type: string, payload: Record<string, unknown>) =>
  db.$executeRawUnsafe(
    `INSERT INTO outbox (event_type, payload) VALUES ($1, $2::jsonb)`,
    event_type,
    JSON.stringify(payload),
  );

const queueMail = (tx: ShopTx, merchant_id: string, template: string, msg_id: string) =>
  tx.$executeRawUnsafe(
    `INSERT INTO email_events (msg_id, received_at, from_domain, class, action_required, summary,
                               direction, status, kind, merchant_id, template)
     VALUES ($1, now(), 'apibase.pro', 'UNMATCHED', FALSE, NULL, 'out', 'queued', $2, $3::uuid, $2)
     ON CONFLICT (msg_id) DO NOTHING`,
    msg_id,
    template,
    merchant_id,
  );

/** `YYYY-MM` of the month before `now` (UTC), and the start of the current month. */
function previousPeriod(now: Date): { period: string; before: Date } {
  const before = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const period = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`;
  return { period, before };
}

/**
 * `shop-fee-invoice` (1st of the month): per merchant, the owed Base receivables created before
 * this month -> one invoice (due in 30 days), the ledger rows -> `invoiced`, one mail queued.
 * Nothing owed (fee switch off, only Tempo orders) -> no invoice. A rerun finds no owed rows.
 */
export async function issueFeeInvoices(d: ShopDeps, now: Date): Promise<number> {
  const { period, before } = previousPeriod(now);
  const merchants = await d.db.$queryRawUnsafe<Array<{ merchant_id: string }>>(
    `SELECT DISTINCT merchant_id FROM shop_fee_ledger
      WHERE mode = 'receivable' AND status = 'owed' AND fee_usd > 0
        AND created_at < $1::timestamptz LIMIT 5000`,
    before,
  );
  let n = 0;
  for (const m of merchants) {
    n += await d.transaction(async (tx) => {
      const exists = await tx.$queryRawUnsafe<unknown[]>(
        `SELECT 1 FROM shop_fee_invoices WHERE merchant_id = $1::uuid AND period = $2`,
        m.merchant_id,
        period,
      );
      if (exists.length > 0) return 0;
      const invoice_id = randomUUID();
      const sum = await tx.$queryRawUnsafe<Array<{ amount: string }>>(
        `WITH u AS (
           UPDATE shop_fee_ledger SET status = 'invoiced', invoice_id = $2
            WHERE merchant_id = $1::uuid AND mode = 'receivable' AND status = 'owed'
              AND fee_usd > 0 AND created_at < $3::timestamptz
           RETURNING fee_usd)
         SELECT coalesce(sum(fee_usd), 0)::text AS amount FROM u`,
        m.merchant_id,
        invoice_id,
        before,
      );
      if (!(Number(sum[0]?.amount ?? 0) > 0)) return 0;
      const due_at = new Date(now.getTime() + INVOICE_DUE_DAYS * DAY_MS);
      await tx.$executeRawUnsafe(
        `INSERT INTO shop_fee_invoices (invoice_id, merchant_id, period, amount_usd, due_at, status)
         VALUES ($1::uuid, $2::uuid, $3, $4::numeric, $5::timestamptz, 'open')`,
        invoice_id,
        m.merchant_id,
        period,
        sum[0].amount,
        due_at,
      );
      await emit(tx, 'shop.fee_invoice.issued', {
        invoice_id,
        merchant_id: m.merchant_id,
        period,
        amount_usd: sum[0].amount,
        due_at,
      });
      await queueMail(tx, m.merchant_id, 'fee_invoice', `out:fee_invoice:${invoice_id}`);
      return 1;
    });
  }
  return n;
}

type FeeLevel = 'none' | 'base_off' | 'suspended';

/** The restriction the merchant's unpaid invoices call for at `now` (payment lifts it by itself). */
async function feeLevel(db: ShopTx, merchant_id: string, now: Date): Promise<FeeLevel> {
  const r = await db.$queryRawUnsafe<Array<{ oldest: Date | null }>>(
    `SELECT min(due_at) AS oldest FROM shop_fee_invoices
      WHERE merchant_id = $1::uuid AND status IN ('open', 'overdue') AND paid_tx_hash IS NULL`,
    merchant_id,
  );
  const oldest = r[0]?.oldest;
  if (!oldest) return 'none';
  const age = now.getTime() - new Date(oldest).getTime();
  if (age >= SUSPEND_AFTER_DAYS * DAY_MS) return 'suspended';
  if (age >= BASE_OFF_AFTER_DAYS * DAY_MS) return 'base_off';
  return 'none';
}

/** Quote path: is the Base rail switched off for this merchant? (read-only, derived from invoices) */
export async function baseRailDisabled(
  db: ShopTx,
  merchant_id: string,
  nowMs: number,
): Promise<boolean> {
  return (await feeLevel(db, merchant_id, new Date(nowMs))) !== 'none';
}

/** Brings `shop_merchants` in line with the level; only touches state this module set itself. */
async function applyLevel(tx: ShopTx, merchant_id: string, level: FeeLevel): Promise<void> {
  if (level === 'suspended') {
    await tx.$executeRawUnsafe(
      `UPDATE shop_merchants SET status = 'suspended', status_reason = $2
        WHERE merchant_id = $1::uuid AND status = 'active'
          AND (status_reason IS NULL OR status_reason = $3)`,
      merchant_id,
      REASON_SUSPENDED,
      REASON_BASE_OFF,
    );
  } else if (level === 'base_off') {
    await tx.$executeRawUnsafe(
      `UPDATE shop_merchants SET status_reason = $2
        WHERE merchant_id = $1::uuid AND status = 'active' AND status_reason IS NULL`,
      merchant_id,
      REASON_BASE_OFF,
    );
    await tx.$executeRawUnsafe(
      `UPDATE shop_merchants SET status = 'active', status_reason = $2
        WHERE merchant_id = $1::uuid AND status = 'suspended' AND status_reason = $3`,
      merchant_id,
      REASON_BASE_OFF,
      REASON_SUSPENDED,
    );
  } else {
    await tx.$executeRawUnsafe(
      `UPDATE shop_merchants SET status = 'active', status_reason = NULL
        WHERE merchant_id = $1::uuid AND status = 'suspended' AND status_reason = $2`,
      merchant_id,
      REASON_SUSPENDED,
    );
    await tx.$executeRawUnsafe(
      `UPDATE shop_merchants SET status_reason = NULL
        WHERE merchant_id = $1::uuid AND status_reason = $2`,
      merchant_id,
      REASON_BASE_OFF,
    );
  }
}

export interface OverdueResult {
  flagged: number;
  merchants_restricted: number;
}

/**
 * Sweeper step: invoices 30+ days past `due_at` -> `overdue` (ONE `shop.fee_invoice.overdue` event per
 * invoice = the FEE_INVOICE_OVERDUE incident, HUMAN_ONLY), the merchant's level re-applied (Base off at
 * 30 days, suspended at 60). Idempotent: the status flip is the marker.
 */
export async function enforceFeeOverdue(d: ShopDeps, now: Date): Promise<OverdueResult> {
  const cutoff = new Date(now.getTime() - BASE_OFF_AFTER_DAYS * DAY_MS);
  const due = await d.db.$queryRawUnsafe<Array<{ merchant_id: string }>>(
    `SELECT DISTINCT merchant_id FROM shop_fee_invoices
      WHERE status IN ('open', 'overdue') AND paid_tx_hash IS NULL AND due_at <= $1::timestamptz
      LIMIT 1000`,
    cutoff,
  );
  const out: OverdueResult = { flagged: 0, merchants_restricted: 0 };
  for (const m of due) {
    const r = await d.transaction(async (tx) => {
      const flipped = await tx.$queryRawUnsafe<
        Array<{ invoice_id: string; period: string; amount_usd: string; due_at: Date }>
      >(
        `UPDATE shop_fee_invoices SET status = 'overdue'
          WHERE merchant_id = $1::uuid AND status = 'open' AND paid_tx_hash IS NULL
            AND due_at <= $2::timestamptz
        RETURNING invoice_id, period, amount_usd::text AS amount_usd, due_at`,
        m.merchant_id,
        cutoff,
      );
      for (const f of flipped) {
        await emit(tx, 'shop.fee_invoice.overdue', {
          invoice_id: f.invoice_id,
          merchant_id: m.merchant_id,
          period: f.period,
          amount_usd: f.amount_usd,
          due_at: f.due_at,
        });
      }
      const level = await feeLevel(tx, m.merchant_id, now);
      await applyLevel(tx, m.merchant_id, level);
      return { flagged: flipped.length, restricted: level !== 'none' ? 1 : 0 };
    });
    out.flagged += r.flagged;
    out.merchants_restricted += r.restricted;
  }
  return out;
}

const bad = (message: string, extra: Record<string, unknown> = {}) =>
  new QuoteError(400, 'validation_failed', message, 'fix_request', {
    documentation_url: DOCS,
    ...extra,
  });

const toMicro = (usd: string): bigint => {
  const [i, f = ''] = usd.split('.');
  return BigInt(i) * MICRO + BigInt(f.padEnd(6, '0').slice(0, 6));
};

export interface FeeInvoiceView {
  invoice_id: string;
  period: string;
  amount_usd: string;
  due_at: string;
  status: string;
  paid_tx_hash: string | null;
  pay_to: string | null;
  memo: string;
}

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));

const view = (r: Record<string, unknown>): FeeInvoiceView => ({
  invoice_id: String(r.invoice_id),
  period: String(r.period),
  amount_usd: String(r.amount_usd),
  due_at: iso(r.due_at),
  status: String(r.status),
  paid_tx_hash: (r.paid_tx_hash as string | null) ?? null,
  pay_to: process.env['INTEGRATOR_FEE_WALLET'] ?? null,
  memo: String(r.invoice_id),
});

/** `GET /merchants/me/fee-invoices`: the key holder's own invoices, newest first. */
export async function listFeeInvoices(
  d: ShopDeps,
  merchant_id: string,
): Promise<{ invoices: FeeInvoiceView[] }> {
  const rows = await d.db.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT invoice_id, period, amount_usd::text AS amount_usd, due_at, status, paid_tx_hash
       FROM shop_fee_invoices WHERE merchant_id = $1::uuid ORDER BY period DESC LIMIT 120`,
    merchant_id,
  );
  return { invoices: rows.map(view) };
}

/**
 * `POST /merchants/me/fee-invoices/:id/paid {tx_hash}`: the chain is READ (viem): the transaction is
 * confirmed and carries a USDC `Transfer` to `INTEGRATOR_FEE_WALLET` of at least the invoice amount.
 * Accepted -> invoice `paid`, its ledger rows `paid`, restrictions re-derived (lifted when nothing
 * else is overdue). Anything else -> 422 with the reason and nothing changes.
 */
export async function markFeeInvoicePaid(
  d: FeeInvoiceDeps,
  merchant_id: string,
  invoice_id: unknown,
  input: { tx_hash?: unknown },
): Promise<FeeInvoiceView> {
  const notFound = () =>
    new QuoteError(404, 'not_found', 'invoice not found', 'use_different_tool');
  if (typeof invoice_id !== 'string' || !UUID_RE.test(invoice_id)) throw notFound();
  if (typeof input.tx_hash !== 'string' || !TX_RE.test(input.tx_hash)) {
    throw bad('tx_hash must be a 0x-prefixed 32-byte transaction hash');
  }
  const tx_hash = input.tx_hash.toLowerCase();
  const inv = await d.db.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT invoice_id, period, amount_usd::text AS amount_usd, due_at, status, paid_tx_hash
       FROM shop_fee_invoices WHERE invoice_id = $1::uuid AND merchant_id = $2::uuid`,
    invoice_id,
    merchant_id,
  );
  if (!inv[0]) throw notFound();
  if (inv[0].status === 'paid') {
    if (String(inv[0].paid_tx_hash).toLowerCase() === tx_hash) return view(inv[0]);
    throw new QuoteError(
      409,
      'already_paid',
      'this invoice is already paid',
      'use_different_tool',
      {
        documentation_url: DOCS,
      },
    );
  }
  if (inv[0].status === 'written_off') {
    throw new QuoteError(409, 'written_off', 'this invoice was written off', 'use_different_tool', {
      documentation_url: DOCS,
    });
  }
  const wallet = process.env['INTEGRATOR_FEE_WALLET'];
  if (!wallet) {
    throw new QuoteError(
      503,
      'fee_wallet_unavailable',
      'the fee wallet is not configured; repeat later',
      'retry_after_delay',
    );
  }
  const used = await d.db.$queryRawUnsafe<unknown[]>(
    `SELECT 1 FROM shop_fee_invoices WHERE lower(paid_tx_hash) = $1 LIMIT 1`,
    tx_hash,
  );
  if (used.length > 0) {
    throw new QuoteError(
      409,
      'tx_already_used',
      'this transaction already paid an invoice',
      'fix_request',
      {
        documentation_url: DOCS,
      },
    );
  }

  let receipt;
  try {
    receipt = await (d.chain ?? (await viemRefundChain())).receipt('base', tx_hash);
  } catch {
    throw new QuoteError(
      503,
      'chain_unavailable',
      'the chain could not be read right now; repeat the call',
      'retry_after_delay',
    );
  }
  const token = (await import('../config/x402.config')).getX402Config().usdcAddress;
  const need = toMicro(String(inv[0].amount_usd));
  let reason: string | null = null;
  if (receipt.status === 'missing') reason = 'tx_not_found_or_unconfirmed';
  else if (receipt.status === 'reverted') reason = 'tx_reverted';
  else {
    const toUs = receipt.transfers
      .filter((t) => t.token.toLowerCase() === token.toLowerCase())
      .filter((t) => t.to.toLowerCase() === wallet.toLowerCase())
      .reduce((sum, t) => sum + BigInt(t.valueMicro), 0n);
    if (toUs === 0n) reason = 'no_usdc_transfer_to_fee_wallet';
    else if (toUs < need) reason = 'transfer_below_amount';
  }
  if (reason) {
    throw new QuoteError(
      422,
      'fee_payment_rejected',
      `the transaction does not prove this payment: ${reason}`,
      'fix_request',
      { invoice_id, status: String(inv[0].status), reject_reason: reason, documentation_url: DOCS },
    );
  }

  return d.transaction(async (tx) => {
    const upd = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `UPDATE shop_fee_invoices SET status = 'paid', paid_tx_hash = $3
        WHERE invoice_id = $1::uuid AND merchant_id = $2::uuid AND status IN ('open', 'overdue')
       RETURNING invoice_id, period, amount_usd::text AS amount_usd, due_at, status, paid_tx_hash`,
      invoice_id,
      merchant_id,
      tx_hash,
    );
    if (!upd[0])
      throw new QuoteError(
        409,
        'already_paid',
        'this invoice is already paid',
        'use_different_tool',
      );
    await tx.$executeRawUnsafe(
      `UPDATE shop_fee_ledger SET status = 'paid', paid_tx_hash = $2
        WHERE invoice_id = $1 AND merchant_id = $3::uuid AND status = 'invoiced'`,
      invoice_id,
      tx_hash,
      merchant_id,
    );
    await applyLevel(
      tx,
      merchant_id,
      await feeLevel(tx, merchant_id, new Date((d.now ?? Date.now)())),
    );
    await emit(tx, 'shop.fee_invoice.paid', { invoice_id, merchant_id, tx_hash });
    return view(upd[0]);
  });
}

export interface FeeReceivables {
  owed_usd: string;
  invoiced_usd: string;
  open_invoices: Array<{
    invoice_id: string;
    period: string;
    amount_usd: string;
    due_at: string;
    status: string;
  }>;
}

/** Owner page / stats: Base receivable not yet invoiced + the invoices still unpaid. */
export async function loadFeeReceivables(db: ShopTx, merchant_id: string): Promise<FeeReceivables> {
  const [sums, open] = await Promise.all([
    db.$queryRawUnsafe<Array<{ owed: string; invoiced: string }>>(
      `SELECT coalesce(sum(fee_usd) FILTER (WHERE mode = 'receivable' AND status = 'owed'), 0)::text AS owed,
              coalesce(sum(fee_usd) FILTER (WHERE mode = 'receivable' AND status = 'invoiced'), 0)::text AS invoiced
         FROM shop_fee_ledger WHERE merchant_id = $1::uuid`,
      merchant_id,
    ),
    db.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT invoice_id, period, amount_usd::text AS amount_usd, due_at, status
         FROM shop_fee_invoices WHERE merchant_id = $1::uuid AND status IN ('open', 'overdue')
        ORDER BY due_at LIMIT 24`,
      merchant_id,
    ),
  ]);
  return {
    owed_usd: sums[0]?.owed ?? '0',
    invoiced_usd: sums[0]?.invoiced ?? '0',
    open_invoices: open.map((o) => ({
      invoice_id: String(o.invoice_id),
      period: String(o.period),
      amount_usd: String(o.amount_usd),
      due_at: iso(o.due_at),
      status: String(o.status),
    })),
  };
}
