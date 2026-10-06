import type { ShopDeps } from './merchant-lifecycle.service';
import type { ShopTx } from './db';
import { transition, type State } from './order-state';
import { QuoteError } from './quote.errors';
import { lockOrder } from './repository';

/**
 * §4 F-10 / UC-13 / §6.2 shop.merchant.refund: a refund is the merchant's own transaction. The code never
 * sends crypto and never signs anything: it READS the chain (viem, read-only) and checks that the
 * transaction the merchant names paid the payer back.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TX_RE = /^0x[0-9a-fA-F]{64}$/;
const DOCS = '/docs/integrator#refunds';
/** USDC has 6 decimals on both rails. */
const MICRO = 1_000_000n;

/** A refund can be registered while the order is live (PAID..DELIVERED, DISPUTED) or already in a refund state. */
const REFUNDABLE: readonly State[] = [
  'PAID',
  'CONFIRMED',
  'FULFILLED',
  'SHIPPED',
  'DELIVERED',
  'DISPUTED',
  'REFUND_PENDING',
  'PARTIALLY_REFUNDED',
];

export interface RefundReceipt {
  status: 'success' | 'reverted' | 'missing';
  /** ERC-20 Transfer logs of the transaction. */
  transfers: Array<{ token: string; to: string; valueMicro: string }>;
}

/** The only chain access the refund path has: one read per transaction. Tests inject a fake. */
export interface RefundChain {
  receipt(rail: 'base' | 'tempo', txHash: string): Promise<RefundReceipt>;
}

export interface RefundDeps extends ShopDeps {
  chain?: RefundChain;
}

export async function viemRefundChain(): Promise<RefundChain> {
  const { createPublicClient, http, parseAbi, parseEventLogs } = await import('viem');
  const { getX402Config } = await import('../config/x402.config');
  const { getMppConfig } = await import('../config/mpp.config');
  const abi = parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)']);
  return {
    receipt: async (rail, txHash) => {
      const url = rail === 'tempo' ? getMppConfig().rpcUrl : getX402Config().baseRpcUrl;
      const client = createPublicClient({ transport: http(url) });
      let r;
      try {
        r = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
      } catch (e) {
        if ((e as Error).name === 'TransactionReceiptNotFoundError') {
          return { status: 'missing', transfers: [] };
        }
        throw e;
      }
      const logs = parseEventLogs({ abi, logs: r.logs, eventName: 'Transfer' });
      return {
        status: r.status === 'success' ? 'success' : 'reverted',
        transfers: logs.map((l) => ({
          token: l.address,
          to: String(l.args.to),
          valueMicro: String(l.args.value),
        })),
      };
    },
  };
}

const bad = (message: string) =>
  new QuoteError(400, 'validation_failed', message, 'fix_request', { documentation_url: DOCS });
const notFound = () => new QuoteError(404, 'not_found', 'order not found', 'use_different_tool');

/** `12.5` / `"12.50"` -> micro-USDC; at most 6 decimals, > 0. */
function toMicro(v: unknown): bigint | null {
  const s = typeof v === 'number' && Number.isFinite(v) ? String(v) : v;
  if (typeof s !== 'string' || !/^\d+(\.\d{1,6})?$/.test(s)) return null;
  const [i, f = ''] = s.split('.');
  return BigInt(i) * MICRO + BigInt(f.padEnd(6, '0'));
}

const fromMicro = (m: bigint): string => `${m / MICRO}.${String(m % MICRO).padStart(6, '0')}`;

const emit = (db: ShopTx, event_type: string, payload: Record<string, unknown>) =>
  db.$executeRawUnsafe(
    `INSERT INTO outbox (event_type, payload) VALUES ($1, $2::jsonb)`,
    event_type,
    JSON.stringify(payload),
  );

interface OrderFacts {
  state: State;
  rail: string | null;
  payer_wallet: string | null;
  total: bigint;
  refunded: bigint;
}

async function orderFacts(tx: ShopTx, merchant_id: string, order_id: string): Promise<OrderFacts> {
  const rows = await tx.$queryRawUnsafe<
    Array<{
      state: State;
      rail: string | null;
      payer_wallet: string | null;
      total: string;
      refunded: string;
    }>
  >(
    `SELECT o.state, o.rail, o.payer_wallet,
            (o.total_usd * 1000000)::bigint::text AS total,
            (SELECT COALESCE(SUM(r.verified_amount), 0) * 1000000 FROM shop_refunds r
              WHERE r.order_id = o.order_id AND r.verified)::bigint::text AS refunded
       FROM shop_orders o WHERE o.order_id = $1::uuid AND o.merchant_id = $2::uuid`,
    order_id,
    merchant_id,
  );
  const o = rows[0];
  if (!o) throw notFound();
  return {
    state: o.state,
    rail: o.rail,
    payer_wallet: o.payer_wallet,
    total: BigInt(o.total),
    refunded: BigInt(o.refunded),
  };
}

function checkRefundable(f: OrderFacts, amount: bigint): void {
  if (!REFUNDABLE.includes(f.state)) {
    throw new QuoteError(
      409,
      'not_refundable',
      `order is ${f.state}: nothing to refund`,
      'use_different_tool',
      { state: f.state, documentation_url: DOCS },
    );
  }
  if (f.refunded + amount > f.total) {
    throw new QuoteError(
      400,
      'refund_exceeds_total',
      `refunds would total ${fromMicro(f.refunded + amount)} but the order is ${fromMicro(f.total)}`,
      'fix_request',
      {
        already_refunded_usd: fromMicro(f.refunded),
        order_total_usd: fromMicro(f.total),
        documentation_url: DOCS,
      },
    );
  }
}

/** Why the transaction does not prove the refund, or null when it does. */
function verifyReceipt(
  r: RefundReceipt,
  token: string,
  payer: string,
  amount: bigint,
): string | null {
  if (r.status === 'missing') return 'tx_not_found_or_unconfirmed';
  if (r.status === 'reverted') return 'tx_reverted';
  const paidToPayer = r.transfers
    .filter((t) => t.token.toLowerCase() === token.toLowerCase())
    .filter((t) => t.to.toLowerCase() === payer.toLowerCase())
    .reduce((sum, t) => sum + BigInt(t.valueMicro), 0n);
  if (paidToPayer === 0n) return 'no_usdc_transfer_to_payer';
  if (paidToPayer < amount) return 'transfer_below_amount';
  return null;
}

async function railToken(rail: 'base' | 'tempo'): Promise<string> {
  if (rail === 'tempo') return (await import('../config/mpp.config')).getMppConfig().usdcAddress;
  return (await import('../config/x402.config')).getX402Config().usdcAddress;
}

export interface RefundResult {
  refund_id: string;
  order_id: string;
  state: State;
  status: 'verified';
  verified_amount_usd: string;
  refunded_usd: string;
  order_total_usd: string;
}

/**
 * `shop.merchant.refund({order_id, amount, tx_hash})` / `POST /merchants/me/refunds` (scope refunds:write).
 * Verified -> `shop_refunds.verified`, the order goes REFUND_PENDING -> REFUNDED (the refunds add up to
 * `total_usd`) or PARTIALLY_REFUNDED. Anything else is recorded as `rejected` with the reason and the
 * order is untouched (422). The platform fee is never returned (`shop_fee_ledger` is not written here).
 */
export async function merchantRefund(
  d: RefundDeps,
  merchant_id: string,
  input: { order_id?: unknown; amount?: unknown; tx_hash?: unknown },
): Promise<RefundResult> {
  const order_id = input.order_id;
  if (typeof order_id !== 'string' || !UUID_RE.test(order_id)) throw notFound();
  const micro = toMicro(input.amount);
  if (micro === null || micro === 0n) {
    throw bad('amount must be a positive USD amount with at most 6 decimals');
  }
  if (typeof input.tx_hash !== 'string' || !TX_RE.test(input.tx_hash)) {
    throw bad('tx_hash must be a 0x-prefixed 32-byte transaction hash');
  }
  const tx_hash = input.tx_hash.toLowerCase();

  const facts = await orderFacts(d.db, merchant_id, order_id);
  checkRefundable(facts, micro);
  const used = await d.db.$queryRawUnsafe<unknown[]>(
    `SELECT 1 FROM shop_refunds WHERE lower(tx_hash) = $1 AND verified LIMIT 1`,
    tx_hash,
  );
  if (used.length > 0) {
    throw new QuoteError(
      409,
      'tx_already_used',
      'this transaction already settled a refund',
      'fix_request',
      { documentation_url: DOCS },
    );
  }

  const rail = facts.rail === 'tempo' ? 'tempo' : 'base';
  let reason: string | null;
  if (!facts.payer_wallet) {
    reason = 'order_has_no_payer_wallet';
  } else {
    let receipt: RefundReceipt;
    try {
      receipt = await (d.chain ?? (await viemRefundChain())).receipt(rail, tx_hash);
    } catch {
      throw new QuoteError(
        503,
        'chain_unavailable',
        'the chain could not be read right now; repeat the call',
        'retry_after_delay',
      );
    }
    reason = verifyReceipt(receipt, await railToken(rail), facts.payer_wallet, micro);
  }

  const amount_usd = fromMicro(micro);
  if (reason) {
    const rej = await d.db.$queryRawUnsafe<Array<{ refund_id: string }>>(
      `INSERT INTO shop_refunds (order_id, amount_usd, reason, requested_by, tx_hash, status, reject_reason)
       VALUES ($1::uuid, $2::numeric, 'other', 'merchant', $3, 'rejected', $4) RETURNING refund_id`,
      order_id,
      amount_usd,
      tx_hash,
      reason,
    );
    throw new QuoteError(
      422,
      'refund_rejected',
      `the transaction does not prove this refund: ${reason}`,
      'fix_request',
      {
        refund_id: rej[0].refund_id,
        status: 'rejected',
        reject_reason: reason,
        state: facts.state,
        documentation_url: DOCS,
      },
    );
  }

  return d.transaction(async (tx) => {
    const locked = await lockOrder(tx, { merchant_id, order_id });
    if (!locked) throw notFound();
    // The row is locked now: re-read what could have moved while the chain was being read.
    const now = await orderFacts(tx, merchant_id, order_id);
    checkRefundable(now, micro);
    const total = now.refunded + micro;
    const full = total === now.total;

    if (now.state !== 'REFUND_PENDING') {
      await transition(tx, order_id, 'REFUND_PENDING', {
        actor: 'merchant',
        reason: 'merchant_refund',
      });
    }
    const open = await tx.$queryRawUnsafe<
      Array<{
        refund_id: string;
        owed: string;
        reason: string;
        requested_by: string;
        status: string;
        due_at: Date | null;
      }>
    >(
      `SELECT refund_id, (amount_usd * 1000000)::bigint::text AS owed, reason, requested_by, status, due_at
         FROM shop_refunds
        WHERE order_id = $1::uuid AND NOT verified AND status IN ('requested', 'awaiting_merchant_tx', 'overdue')
        ORDER BY created_at LIMIT 1 FOR UPDATE`,
      order_id,
    );
    let refund_id: string;
    if (open[0]) {
      refund_id = open[0].refund_id;
      await tx.$executeRawUnsafe(
        `UPDATE shop_refunds SET amount_usd = $2::numeric, tx_hash = $3, verified = true,
                verified_amount = $2::numeric, status = 'verified', verified_at = now()
          WHERE refund_id = $1::uuid`,
        refund_id,
        fromMicro(micro),
        tx_hash,
      );
      const rest = BigInt(open[0].owed) - micro;
      if (rest > 0n && !full) {
        // the merchant still owes the difference: it keeps the same due date and SLA
        await tx.$executeRawUnsafe(
          `INSERT INTO shop_refunds (order_id, amount_usd, reason, requested_by, status, due_at)
           VALUES ($1::uuid, $2::numeric, $3, $4, $5, $6::timestamptz)`,
          order_id,
          fromMicro(rest),
          open[0].reason,
          open[0].requested_by,
          open[0].status === 'overdue' ? 'awaiting_merchant_tx' : open[0].status,
          open[0].due_at,
        );
      }
    } else {
      const ins = await tx.$queryRawUnsafe<Array<{ refund_id: string }>>(
        `INSERT INTO shop_refunds (order_id, amount_usd, reason, requested_by, tx_hash, verified,
                                   verified_amount, status, verified_at)
         VALUES ($1::uuid, $2::numeric, 'other', 'merchant', $3, true, $2::numeric, 'verified', now())
         RETURNING refund_id`,
        order_id,
        fromMicro(micro),
        tx_hash,
      );
      refund_id = ins[0].refund_id;
    }
    if (full) {
      await tx.$executeRawUnsafe(
        `UPDATE shop_refunds SET status = 'rejected', reject_reason = 'order_fully_refunded'
          WHERE order_id = $1::uuid AND NOT verified AND status IN ('requested', 'awaiting_merchant_tx', 'overdue')`,
        order_id,
      );
    }
    const to: State = full ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    await transition(tx, order_id, to, {
      actor: 'merchant',
      reason: 'refund_verified',
      payload: { refund_id, amount_usd: fromMicro(micro), tx_hash },
    });
    await tx.$executeRawUnsafe(
      `UPDATE shop_disputes SET status = 'resolved_refund', resolved_at = now()
        WHERE order_id = $1::uuid AND status IN ('open', 'merchant_responded')`,
      order_id,
    );
    await emit(tx, 'shop.refund.verified', {
      refund_id,
      order_id,
      merchant_id,
      amount_usd: fromMicro(micro),
      tx_hash,
      state: to,
    });
    return {
      refund_id,
      order_id,
      state: to,
      status: 'verified' as const,
      verified_amount_usd: fromMicro(micro),
      refunded_usd: fromMicro(total),
      order_total_usd: fromMicro(now.total),
    };
  });
}
