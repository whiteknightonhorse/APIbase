import { getPrisma } from './prisma.service';
import { pendingReceiptId } from './public-receipt.service';

/**
 * A-GD-01: the public receipt index by payment transaction (apibase-receipt-index/1). It answers,
 * from the receipt store and the refund ledger, "which receipts did APIbase issue for this payment
 * transaction, and was it refunded". A transaction APIbase never saw is an honest empty answer.
 */
export const RECEIPT_INDEX_SCHEMA = 'apibase-receipt-index/1';

export interface ReceiptIndex {
  schema: typeof RECEIPT_INDEX_SCHEMA;
  payment_tx: string;
  receipt_ids: string[];
  refund_tx: string | null;
  first_seen_at: string | null;
}

export interface IndexSource {
  /** receipt ids with this payment_tx in the stored body, with the row time */
  receiptsByTx(tx: string): Promise<Array<{ receipt_id: string; at: Date }>>;
  /** receipts of calls whose x402 settle landed with this tx (pending-id receipts, T-0596) */
  settledPending(tx: string): Promise<Array<{ receipt_id: string; at: Date }>>;
  /** the sent refund transaction for this original payment, if any */
  refundTx(tx: string): Promise<string | null>;
}

export const pgIndexSource: IndexSource = {
  async receiptsByTx(tx) {
    const rows = (await getPrisma().$queryRawUnsafe(
      `SELECT receipt_id, created_at FROM public_receipts
        WHERE (body::jsonb ->> 'payment_tx') = $1 ORDER BY created_at, receipt_id`,
      tx,
    )) as Array<{ receipt_id: string; created_at: Date }>;
    return rows.map((r) => ({
      receipt_id: String(r.receipt_id).trim(),
      at: new Date(r.created_at),
    }));
  },
  async settledPending(tx) {
    const rows = (await getPrisma().$queryRawUnsafe(
      `SELECT l.execution_id::text AS execution_id, r.created_at
         FROM execution_ledger l
         JOIN public_receipts r ON r.receipt_id = replace(l.execution_id::text, '-', '')
        WHERE lower(l.settle_tx_hash) = $1 AND l.x402_settle_state = 'settled'`,
      tx,
    )) as Array<{ execution_id: string; created_at: Date }>;
    const out: Array<{ receipt_id: string; at: Date }> = [];
    for (const r of rows) {
      const id = pendingReceiptId(r.execution_id);
      if (id) out.push({ receipt_id: id, at: new Date(r.created_at) });
    }
    return out;
  },
  async refundTx(tx) {
    const rows = (await getPrisma().$queryRawUnsafe(
      `SELECT refund_tx FROM refund_ledger
        WHERE original_tx = $1 AND status = 'sent' AND refund_tx IS NOT NULL
        ORDER BY sent_at LIMIT 1`,
      tx,
    )) as Array<{ refund_tx: string | null }>;
    return rows[0]?.refund_tx ? rows[0].refund_tx.toLowerCase() : null;
  },
};

/** The index of one payment transaction. `tx` must already be a lowercase 0x + 64 hex string. */
export async function receiptIndexForTx(
  tx: string,
  src: IndexSource = pgIndexSource,
): Promise<ReceiptIndex> {
  const [direct, pending, refundTx] = await Promise.all([
    src.receiptsByTx(tx),
    src.settledPending(tx),
    src.refundTx(tx),
  ]);
  const seen = new Map<string, Date>();
  for (const r of [...direct, ...pending]) {
    const prev = seen.get(r.receipt_id);
    if (!prev || r.at < prev) seen.set(r.receipt_id, r.at);
  }
  const ids = [...seen.keys()].sort();
  const first = [...seen.values()].sort((a, b) => a.getTime() - b.getTime())[0];
  return {
    schema: RECEIPT_INDEX_SCHEMA,
    payment_tx: tx,
    receipt_ids: ids,
    refund_tx: refundTx,
    first_seen_at: first ? first.toISOString() : null,
  };
}
