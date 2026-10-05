import type { ShopDeps } from './merchant-lifecycle.service';
import type { ShopTx } from './db';
import { DEFAULT_REFUND_WINDOW_DAYS } from './adapters/shop-order.adapter';
import { ALL_STATES, transition, type State } from './order-state';
import { QuoteError } from './quote.errors';
import { listOrders, lockOrder } from './repository';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOCS = '/docs/integrator#orders';
/** UC-13: a buyer-requested refund is due from the merchant within 7 days. */
export const REFUND_DUE_DAYS = 7;
const DOCUMENT_STATES: readonly State[] = [
  'PAID',
  'CONFIRMED',
  'FULFILLED',
  'SHIPPED',
  'DELIVERED',
  'REFUND_PENDING',
  'DISPUTED',
];

const notFound = () => new QuoteError(404, 'not_found', 'order not found', 'use_different_tool');
const invalid = (message: string) =>
  new QuoteError(422, 'validation_failed', message, 'fix_request', { documentation_url: DOCS });

const emit = (db: ShopTx, event_type: string, payload: Record<string, unknown>) =>
  db.$executeRawUnsafe(
    `INSERT INTO outbox (event_type, payload) VALUES ($1, $2::jsonb)`,
    event_type,
    JSON.stringify(payload),
  );

export interface RefundPolicy {
  refund_window_days: number | null;
  returns_accepted: boolean;
}

/** The policy of the SKUs on the order: returns only if every SKU accepts them, the longest window. */
export async function refundPolicy(db: ShopTx, order_id: string): Promise<RefundPolicy> {
  const rows = await db.$queryRawUnsafe<
    Array<{ returns_accepted: boolean; refund_window_days: number | null }>
  >(
    `SELECT p.returns_accepted, p.refund_window_days
       FROM shop_orders o
       JOIN shop_quotes q ON q.quote_id = o.quote_id
       CROSS JOIN LATERAL jsonb_array_elements(q.items) i
       JOIN shop_products p ON p.merchant_id = o.merchant_id AND p.sku = i->>'sku'
      WHERE o.order_id = $1::uuid`,
    order_id,
  );
  if (rows.length === 0) return { refund_window_days: null, returns_accepted: false };
  return {
    returns_accepted: rows.every((r) => r.returns_accepted),
    refund_window_days: Math.max(
      ...rows.map((r) => r.refund_window_days ?? DEFAULT_REFUND_WINDOW_DAYS),
    ),
  };
}

/**
 * UC-13 / §6.1 shop.order.cancel after PAID. Before CONFIRMED the buyer always gets the refund
 * (grace); afterwards only when the SKUs accept returns and the refund window is still open.
 * A digital order delivered under `waive_withdrawal` has no refund at all. Runs inside the
 * caller's transaction with the order row locked.
 */
export async function cancelPaidOrder(
  tx: ShopTx,
  o: {
    order_id: string;
    state: string;
    total_usd: string;
    merchant_id: string;
    settled_at: Date | null;
    close_after: Date | null;
    waive_withdrawal: boolean;
  },
  reason: string,
  nowMs: number,
): Promise<{ order_id: string; state: 'REFUND_PENDING'; refund_id: string | null }> {
  const refusal = (message: string, extra: Record<string, unknown> = {}) =>
    new QuoteError(409, 'not_cancellable', message, 'use_different_tool', {
      state: o.state,
      documentation_url: DOCS,
      ...extra,
    });
  if (o.state === 'REFUND_PENDING') {
    const r = await tx.$queryRawUnsafe<Array<{ refund_id: string }>>(
      `SELECT refund_id FROM shop_refunds WHERE order_id = $1::uuid ORDER BY created_at DESC LIMIT 1`,
      o.order_id,
    );
    return { order_id: o.order_id, state: 'REFUND_PENDING', refund_id: r[0]?.refund_id ?? null };
  }
  if (o.state === 'CLOSED' && o.waive_withdrawal) {
    throw refusal('order is CLOSED: the withdrawal right was waived at payment, no refund');
  }
  if (!['PAID', 'CONFIRMED', 'FULFILLED', 'SHIPPED', 'DELIVERED'].includes(o.state)) {
    throw refusal(`order is ${o.state}: not cancellable`);
  }
  if (o.state !== 'PAID') {
    const policy = await refundPolicy(tx, o.order_id);
    if (o.state === 'FULFILLED' && o.waive_withdrawal) {
      throw refusal('digital content delivered with waive_withdrawal: no refund', {
        refund_policy: policy,
      });
    }
    if (!policy.returns_accepted) {
      throw refusal('the merchant does not accept returns for this order', {
        refund_policy: policy,
      });
    }
    const end =
      o.close_after ??
      new Date(
        (o.settled_at ?? new Date(nowMs)).getTime() +
          (policy.refund_window_days ?? DEFAULT_REFUND_WINDOW_DAYS) * 86_400_000,
      );
    if (end.getTime() < nowMs) {
      throw refusal(
        `the refund window (${policy.refund_window_days ?? DEFAULT_REFUND_WINDOW_DAYS} days) has passed`,
        { refund_policy: policy },
      );
    }
  }
  await transition(tx, o.order_id, 'REFUND_PENDING', { actor: 'buyer', reason });
  const rows = await tx.$queryRawUnsafe<Array<{ refund_id: string }>>(
    `INSERT INTO shop_refunds (order_id, amount_usd, reason, requested_by, status, due_at)
     VALUES ($1::uuid, $2::numeric, $3, 'buyer', 'requested', $4::timestamptz + ($5::int * interval '1 day'))
     RETURNING refund_id`,
    o.order_id,
    o.total_usd,
    reason,
    new Date(nowMs),
    REFUND_DUE_DAYS,
  );
  await emit(tx, 'shop.refund.requested', {
    order_id: o.order_id,
    merchant_id: o.merchant_id,
    refund_id: rows[0].refund_id,
    amount_usd: o.total_usd,
    requested_by: 'buyer',
  });
  return { order_id: o.order_id, state: 'REFUND_PENDING', refund_id: rows[0].refund_id };
}

// ---------------------------------------------------------------------------
// §6.2 merchant order tools / §6.3 /merchants/me/orders. The merchant is always the key's.
// ---------------------------------------------------------------------------

const encodeCursor = (c: { t: string; id: string }) =>
  Buffer.from(JSON.stringify(c)).toString('base64url');

function decodeCursor(raw: string): { cursor_ts: string; order_id: string } {
  try {
    const c = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
      t?: unknown;
      id?: unknown;
    };
    if (typeof c.t === 'string' && !Number.isNaN(Date.parse(c.t)) && UUID_RE.test(String(c.id))) {
      return { cursor_ts: c.t, order_id: String(c.id) };
    }
  } catch {
    /* falls through */
  }
  throw invalid('cursor is invalid');
}

export async function listMerchantOrders(
  d: ShopDeps,
  merchant_id: string,
  q: { state?: unknown; since?: unknown; cursor?: unknown; limit?: unknown },
): Promise<{ orders: Array<Record<string, unknown>>; next_cursor: string | null }> {
  if (q.state !== undefined && !ALL_STATES.includes(q.state as State)) {
    throw invalid(`state must be one of ${ALL_STATES.join(', ')}`);
  }
  let since: Date | undefined;
  if (q.since !== undefined) {
    since = new Date(String(q.since));
    if (Number.isNaN(since.getTime())) throw invalid('since must be an ISO 8601 date-time');
  }
  const limit = q.limit === undefined ? 50 : Number(q.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw invalid('limit must be an integer 1..200');
  }
  const rows = await listOrders(d.db, {
    merchant_id,
    state: q.state as State | undefined,
    since,
    after: q.cursor === undefined ? undefined : decodeCursor(String(q.cursor)),
    limit: limit + 1,
  });
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    orders: page.map((r) => ({
      order_id: r.order_id,
      state: r.state,
      total_usd: r.total_usd,
      fee_usd: r.fee_usd,
      created_at: r.created_at,
      confirm_due_at: r.confirm_due_at,
    })),
    next_cursor:
      rows.length > limit && last ? encodeCursor({ t: last.cursor_ts, id: last.order_id }) : null,
  };
}

function ownOrderId(order_id: unknown): string {
  if (typeof order_id !== 'string' || !UUID_RE.test(order_id)) throw notFound();
  return order_id;
}

/** §5.3 PAID -> CONFIRMED by the merchant; the confirm SLA stops. Repeating it is a no-op. */
export async function confirmMerchantOrder(
  d: ShopDeps,
  merchant_id: string,
  order_id: unknown,
): Promise<{ order_id: string; state: string }> {
  const id = ownOrderId(order_id);
  return d.transaction(async (tx) => {
    const o = await lockOrder(tx, { merchant_id, order_id: id });
    if (!o) throw notFound();
    if (o.state === 'CONFIRMED') return { order_id: id, state: o.state };
    if (o.state !== 'PAID') {
      throw new QuoteError(
        409,
        'not_confirmable',
        `order is ${o.state}: only a PAID order can be confirmed`,
        'use_different_tool',
        { state: o.state, documentation_url: DOCS },
      );
    }
    await transition(tx, id, 'CONFIRMED', { actor: 'merchant', reason: 'merchant_confirmed' });
    await tx.$executeRawUnsafe(
      `UPDATE shop_orders SET confirm_due_at = NULL WHERE order_id = $1::uuid`,
      id,
    );
    await emit(tx, 'shop.order.confirmed', { order_id: id, merchant_id });
    return { order_id: id, state: 'CONFIRMED' };
  });
}

/** UC-21: an https document link, kept in the order's event log and shown by `order.get`. */
export async function addMerchantDocument(
  d: ShopDeps,
  merchant_id: string,
  order_id: unknown,
  url: unknown,
): Promise<{ order_id: string; url: string }> {
  const id = ownOrderId(order_id);
  let parsed: URL | undefined;
  try {
    parsed = typeof url === 'string' && url.length <= 2000 ? new URL(url) : undefined;
  } catch {
    parsed = undefined;
  }
  if (!parsed || parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw invalid('url must be an https:// link (up to 2000 characters, no credentials)');
  }
  const href = parsed.href;
  return d.transaction(async (tx) => {
    const o = await lockOrder(tx, { merchant_id, order_id: id });
    if (!o) throw notFound();
    if (!DOCUMENT_STATES.includes(o.state)) {
      throw new QuoteError(
        409,
        'order_state_conflict',
        `order is ${o.state}: documents attach to paid, open orders`,
        'use_different_tool',
        { state: o.state, documentation_url: DOCS },
      );
    }
    await tx.$executeRawUnsafe(
      `INSERT INTO shop_order_events (order_id, seq, from_state, to_state, actor, reason, payload)
       SELECT $1::uuid, COALESCE(MAX(seq), 0) + 1, $2, $2, 'merchant', 'document', $3::jsonb
         FROM shop_order_events WHERE order_id = $1::uuid`,
      id,
      o.state,
      JSON.stringify({ url: href }),
    );
    return { order_id: id, url: href };
  });
}
