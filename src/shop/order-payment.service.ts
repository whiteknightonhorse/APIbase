import { createHash } from 'node:crypto';
import { config } from '../config';
import { decryptSecret } from '../services/secret-crypto.service';
import type { ShopDeps } from './merchant-lifecycle.service';
import type { ShopTx } from './db';
import { convertReservation } from './repository';
import { transition } from './order-state';
import { QuoteError } from './quote.errors';
import { loadPiiSummary } from './pii/pii.service';
import { refundPolicy, type RefundPolicy } from './order-lifecycle.service';

/** §8.4: client/version (MCP initialize) or user agent (REST); the wallet is only a hash prefix. */
export interface BuyerAgent {
  client_name?: string;
  client_version?: string;
  user_agent?: string;
}

export interface OrderEventView {
  seq: number;
  from_state: string | null;
  to_state: string;
  actor: string;
  reason: string | null;
  at: Date;
}

export interface OrderView {
  order_id: string;
  state: string;
  tx_hash: string | null;
  fulfillment?: string;
  events?: OrderEventView[];
  /** T-INT-22: set by `order_ship`; null until a physical order is shipped. */
  tracking?: { carrier: string; number: string; url?: string } | null;
  delivery_eta?: Date | null;
  merchant_contact?: { email: string; site_url: string };
  documents?: Array<{ url: string; at: Date }>;
  refund_policy?: RefundPolicy;
  /** T-INT-21: which buyer-data envelopes are held (kinds + hashes); never the ciphertext. */
  pii?: { kinds: string[]; sha256: Record<string, string> };
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PaidInput {
  order_id: string;
  payment_id: string;
  tx_hash: string;
  payer: string;
  rail?: string;
  request_id?: string;
  buyer_agent?: BuyerAgent;
}

/**
 * Receipt seen (settle with `transaction`, or the reconcile job): payment -> confirmed, order
 * PAYING|PAYMENT_FAILED -> PAID (§5.3 needs the confirmed row first), quote -> paid, the
 * reservation becomes a sale (UC-16), outbox `shop.order.paid`. One transaction; a no-op when the
 * order is already past PAYING (a second confirmation of the same order never pays twice).
 * Returns whether this call performed the transition.
 */
export async function confirmPayment(deps: ShopDeps, p: PaidInput): Promise<boolean> {
  return deps.transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe<
      Array<{ state: string; quote_id: string; merchant_id: string; total_usd: string }>
    >(
      `SELECT state, quote_id, merchant_id, total_usd::text AS total_usd
         FROM shop_orders WHERE order_id = $1::uuid FOR UPDATE`,
      p.order_id,
    );
    const o = rows[0];
    if (!o || (o.state !== 'PAYING' && o.state !== 'PAYMENT_FAILED')) return false;
    const rail = p.rail ?? 'base';
    await tx.$executeRawUnsafe(
      `UPDATE shop_payments SET chain_status = 'confirmed', tx_hash = $2, confirmed_at = now()
        WHERE payment_id = $1::uuid`,
      p.payment_id,
      p.tx_hash,
    );
    await tx.$executeRawUnsafe(
      `UPDATE shop_orders SET tx_hash = $2, settled_at = now(), payer_wallet = $3, rail = $4
        WHERE order_id = $1::uuid`,
      p.order_id,
      p.tx_hash,
      p.payer,
      rail,
    );
    const a = p.buyer_agent ?? {};
    await transition(tx, p.order_id, 'PAID', {
      actor: 'system',
      reason: 'payment_confirmed',
      payload: {
        request_id: p.request_id ?? null,
        rail,
        tx_hash: p.tx_hash,
        buyer_agent: {
          ...(a.client_name ? { client_name: a.client_name } : {}),
          ...(a.client_version ? { client_version: a.client_version } : {}),
          ...(a.user_agent ? { user_agent: a.user_agent } : {}),
          wallet_hash_prefix: sha(p.payer).slice(0, 8),
        },
      },
    });
    // §7.1/§5.1: the fee is the leg the payment row was bound to (0 = switch off / test SKU).
    // Tempo took it in the same transaction (collected); Base owes it (receivable, wave-2 invoice).
    const legs = await tx.$queryRawUnsafe<Array<{ fee: string }>>(
      `SELECT coalesce(sum((e->>'amount_usd')::numeric), 0)::text AS fee
         FROM shop_payments, jsonb_array_elements(splits) e WHERE payment_id = $1::uuid`,
      p.payment_id,
    );
    const fee = Number(legs[0]?.fee ?? 0);
    const settlement = fee > 0 ? (rail === 'tempo' ? 'in_tx' : 'receivable') : 'none';
    if (fee > 0) {
      await tx.$executeRawUnsafe(
        `INSERT INTO shop_fee_ledger (merchant_id, order_id, fee_usd, mode, status)
         VALUES ($1::uuid, $2::uuid, $3::numeric, $4, $5)`,
        o.merchant_id,
        p.order_id,
        fee,
        settlement,
        settlement === 'in_tx' ? 'collected' : 'owed',
      );
    }
    await tx.$executeRawUnsafe(
      `UPDATE shop_orders SET fee_settlement = $2 WHERE order_id = $1::uuid`,
      p.order_id,
      settlement,
    );
    // §5.3 / UC-17: a merchant-fulfilled order (not instant, not the test SKU) must be CONFIRMED
    // within the merchant's confirm_sla_h (default 48); the sweeper watches confirm_due_at.
    await tx.$executeRawUnsafe(
      `UPDATE shop_orders o
          SET confirm_due_at = now() + (COALESCE((m.policy->>'confirm_sla_h')::numeric, 48) * interval '1 hour')
         FROM shop_merchants m, shop_quotes q
        WHERE o.order_id = $1::uuid AND m.merchant_id = o.merchant_id AND q.quote_id = o.quote_id
          AND NOT q.is_test
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(q.items) i
              JOIN shop_products p ON p.merchant_id = o.merchant_id AND p.sku = i->>'sku'
             WHERE p.fulfillment_mode <> 'instant')`,
      p.order_id,
    );
    await tx.$executeRawUnsafe(
      `UPDATE shop_quotes SET status = 'paid' WHERE quote_id = $1::uuid`,
      o.quote_id,
    );
    await convertReservation(tx, { merchant_id: o.merchant_id }, o.quote_id);
    await tx.$executeRawUnsafe(
      `INSERT INTO outbox (event_type, payload) VALUES ('shop.order.paid', $1::jsonb)`,
      JSON.stringify({
        order_id: p.order_id,
        quote_id: o.quote_id,
        merchant_id: o.merchant_id,
        total_usd: o.total_usd,
        tx_hash: p.tx_hash,
        request_id: p.request_id ?? null,
      }),
    );
    return true;
  });
}

/** Settle refused / threw: the row is `failed` (still reconciled for 24 h), the order PAYMENT_FAILED. */
export async function failPayment(
  deps: ShopDeps,
  p: { order_id: string; payment_id: string; reason: string },
): Promise<void> {
  await deps.transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `UPDATE shop_payments SET chain_status = 'failed'
        WHERE payment_id = $1::uuid AND chain_status = 'pending'`,
      p.payment_id,
    );
    const o = await tx.$queryRawUnsafe<Array<{ state: string }>>(
      `SELECT state FROM shop_orders WHERE order_id = $1::uuid FOR UPDATE`,
      p.order_id,
    );
    if (o[0]?.state === 'PAYING') {
      await transition(tx, p.order_id, 'PAYMENT_FAILED', { actor: 'system', reason: p.reason });
    }
  });
}

/** Is `identity` the payer: the quote's buyer, or the identity derived from the paying wallet. */
export function isPayer(
  o: { buyer_identity: string | null; payer_wallet: string | null },
  identity: string,
): boolean {
  if (o.buyer_identity && o.buyer_identity === identity) return true;
  return Boolean(o.payer_wallet && identity === `wallet:${sha(o.payer_wallet.toLowerCase())}`);
}

interface ViewRow {
  order_id: string;
  state: string;
  tx_hash: string | null;
  fulfillment_payload_enc: string | null;
  buyer_identity: string | null;
  payer_wallet: string | null;
  merchant_id: string;
  delivery_eta: Date | null;
}

/** UC-19: the merchant's contact is the payer's while the order is open (PAID ... not CLOSED). */
const CONTACT_STATES = [
  'PAID',
  'CONFIRMED',
  'FULFILLED',
  'SHIPPED',
  'DELIVERED',
  'REFUND_PENDING',
  'DISPUTED',
];

async function loadView(db: ShopTx, where: string, value: string): Promise<ViewRow | undefined> {
  const rows = await db.$queryRawUnsafe<ViewRow[]>(
    `SELECT o.order_id, o.state, o.tx_hash, o.fulfillment_payload_enc, o.payer_wallet, o.merchant_id, o.delivery_eta, q.buyer_identity
       FROM shop_orders o JOIN shop_quotes q ON q.quote_id = o.quote_id
      WHERE ${where} = $1::uuid
      ORDER BY o.created_at DESC LIMIT 1`,
    value,
  );
  return rows[0];
}

function toView(r: ViewRow, withFulfillment: boolean): OrderView {
  const view: OrderView = { order_id: r.order_id, state: r.state, tx_hash: r.tx_hash };
  if (withFulfillment && r.fulfillment_payload_enc) {
    view.fulfillment = decryptSecret(r.fulfillment_payload_enc, config.ENCRYPTION_KEY);
  }
  return view;
}

/**
 * §6.1 shop.order.get: state, events, tracking + delivery_eta (physical, once shipped), refund policy for everyone;
 * `fulfillment`, `merchant_contact` (open orders only) and `documents` for the payer's identity.
 */
export async function getOrderView(
  db: ShopTx,
  order_id: string,
  identity: string,
): Promise<OrderView> {
  if (!UUID_RE.test(order_id ?? '')) {
    throw new QuoteError(404, 'not_found', 'order not found', 'use_different_tool');
  }
  const r = await loadView(db, 'o.order_id', order_id);
  if (!r) throw new QuoteError(404, 'not_found', 'order not found', 'use_different_tool');
  const payer = isPayer(r, identity);
  const view = toView(r, payer);
  view.events = await db.$queryRawUnsafe<OrderEventView[]>(
    `SELECT seq, from_state, to_state, actor, reason, at FROM shop_order_events
      WHERE order_id = $1::uuid ORDER BY seq`,
    order_id,
  );
  const shipped = await db.$queryRawUnsafe<Array<{ tracking: unknown }>>(
    `SELECT payload->'tracking' AS tracking FROM shop_order_events
      WHERE order_id = $1::uuid AND reason = 'shipped' ORDER BY seq DESC LIMIT 1`,
    order_id,
  );
  view.tracking = (shipped[0]?.tracking as OrderView['tracking']) ?? null;
  view.delivery_eta = r.delivery_eta;
  view.refund_policy = await refundPolicy(db, order_id);
  const pii = await loadPiiSummary(db, order_id);
  if (pii && payer) view.pii = pii;
  if (payer) {
    view.documents = await db.$queryRawUnsafe<Array<{ url: string; at: Date }>>(
      `SELECT payload->>'url' AS url, at FROM shop_order_events
        WHERE order_id = $1::uuid AND reason = 'document' ORDER BY seq`,
      order_id,
    );
    if (CONTACT_STATES.includes(r.state)) {
      const m = await db.$queryRawUnsafe<Array<{ email: string; site_url: string }>>(
        `SELECT contact_email AS email, site_url FROM shop_merchants WHERE merchant_id = $1::uuid`,
        r.merchant_id,
      );
      if (m[0]) view.merchant_contact = m[0];
    }
  }
  return view;
}

/** §8.1 item 3: a repeat without payment on an already paid quote, by the same payer. */
export async function findPlacedOrder(
  db: ShopTx,
  quote_id: string,
  identity: string,
): Promise<OrderView | null> {
  if (!UUID_RE.test(quote_id ?? '')) return null;
  const q = await db.$queryRawUnsafe<Array<{ status: string }>>(
    `SELECT status FROM shop_quotes WHERE quote_id = $1::uuid`,
    quote_id,
  );
  if (q[0]?.status !== 'paid') return null;
  const r = await loadView(db, 'o.quote_id', quote_id);
  if (!r || !isPayer(r, identity)) return null;
  return toView(r, true);
}

/** The buyer-facing answer to a payment that got past ESCROW (shared by REST, /mcp and the pipeline). */
export function payResponseBody(v: {
  order_id: string;
  state: string;
  tx_hash?: string | null;
  fulfillment?: string;
}): { status: number; body: Record<string, unknown> } {
  if (v.state === 'PAYING') {
    return {
      status: 202,
      body: { status: 'payment_pending', order_id: v.order_id, state: v.state },
    };
  }
  const order: OrderView = {
    order_id: v.order_id,
    state: v.state,
    tx_hash: v.tx_hash ?? null,
    ...(v.fulfillment !== undefined ? { fulfillment: v.fulfillment } : {}),
  };
  return { status: 200, body: { status: 'paid', order_id: v.order_id, state: v.state, order } };
}
