import { logger } from '../config/logger';
import type { ShopTx } from '../shop/db';
import { defaultShopDeps, type ShopDeps } from '../shop/merchant-lifecycle.service';
import { transition } from '../shop/order-state';
import { releaseReservation } from '../shop/repository';

/** §5.3 / §12.2: a second `confirm_overdue` for the same order only after this long. */
export const OVERDUE_REPEAT_MS = 24 * 3_600_000;
/** UC-17: this many consecutive late-confirmed orders suspend quoting (status_reason). */
export const UNRESPONSIVE_STREAK = 3;
export const CONNECT_EVENTS_TTL_DAYS = 30;

export interface SweepResult {
  quotes_expired: number;
  confirm_overdue: number;
  merchants_unresponsive: number;
  orders_closed: number;
  refunds_overdue: number;
  payouts_applied: number;
  connect_events_deleted: number;
}

const emit = (db: ShopTx, event_type: string, payload: Record<string, unknown>) =>
  db.$executeRawUnsafe(
    `INSERT INTO outbox (event_type, payload) VALUES ($1, $2::jsonb)`,
    event_type,
    JSON.stringify(payload),
  );

/** (a) open quotes past expires_at -> expired, the held stock back, QUOTED orders -> EXPIRED. */
async function expireQuotes(d: ShopDeps, now: Date): Promise<number> {
  const due = await d.db.$queryRawUnsafe<Array<{ quote_id: string; merchant_id: string }>>(
    `SELECT q.quote_id, q.merchant_id FROM shop_quotes q
      WHERE q.status = 'open' AND q.expires_at < $1::timestamptz
        AND NOT EXISTS (SELECT 1 FROM shop_orders o WHERE o.quote_id = q.quote_id AND o.state = 'PAYING')
      LIMIT 500`,
    now,
  );
  let n = 0;
  for (const q of due) {
    n += await d.transaction(async (tx) => {
      const upd = await tx.$executeRawUnsafe(
        `UPDATE shop_quotes SET status = 'expired'
          WHERE quote_id = $1::uuid AND status = 'open' AND expires_at < $2::timestamptz`,
        q.quote_id,
        now,
      );
      if (upd === 0) return 0;
      const orders = await tx.$queryRawUnsafe<Array<{ order_id: string }>>(
        `SELECT order_id FROM shop_orders WHERE quote_id = $1::uuid AND state = 'QUOTED' FOR UPDATE`,
        q.quote_id,
      );
      for (const o of orders) {
        await transition(tx, o.order_id, 'EXPIRED', { actor: 'system', reason: 'quote_expired' });
      }
      await releaseReservation(tx, { merchant_id: q.merchant_id }, q.quote_id);
      return 1;
    });
  }
  return n;
}

/**
 * (b) PAID past confirm_due_at: ONE `shop.order.confirm_overdue` (the marker is an order event, so
 * a rerun in 5 minutes sees it), a second one after 24 h, then every 24 h while it stays PAID.
 * The merchant's last three decided orders all late -> status_reason = 'unresponsive' (quotes 410).
 */
async function confirmOverdue(
  d: ShopDeps,
  now: Date,
): Promise<{ events: number; unresponsive: number }> {
  const due = await d.db.$queryRawUnsafe<Array<{ order_id: string; merchant_id: string }>>(
    `SELECT order_id, merchant_id FROM shop_orders
      WHERE state = 'PAID' AND confirm_due_at < $1::timestamptz LIMIT 500`,
    now,
  );
  let events = 0;
  let unresponsive = 0;
  for (const o of due) {
    const r = await d.transaction(async (tx) => {
      const lock = await tx.$queryRawUnsafe<Array<{ confirm_due_at: Date }>>(
        `SELECT confirm_due_at FROM shop_orders
          WHERE order_id = $1::uuid AND state = 'PAID' AND confirm_due_at < $2::timestamptz
            FOR UPDATE`,
        o.order_id,
        now,
      );
      if (lock.length === 0) return { emitted: false, flagged: false };
      const prior = await tx.$queryRawUnsafe<Array<{ n: number; last: Date | null }>>(
        `SELECT count(*)::int AS n, max(at) AS last FROM shop_order_events
          WHERE order_id = $1::uuid AND reason = 'confirm_overdue'`,
        o.order_id,
      );
      const { n, last } = prior[0];
      if (last && now.getTime() - new Date(last).getTime() < OVERDUE_REPEAT_MS) {
        return { emitted: false, flagged: false };
      }
      await tx.$executeRawUnsafe(
        `INSERT INTO shop_order_events (order_id, seq, from_state, to_state, actor, reason, payload)
         SELECT $1::uuid, COALESCE(MAX(seq), 0) + 1, 'PAID', 'PAID', 'system', 'confirm_overdue', $2::jsonb
           FROM shop_order_events WHERE order_id = $1::uuid`,
        o.order_id,
        JSON.stringify({ confirm_due_at: lock[0].confirm_due_at, repeat: n }),
      );
      await emit(tx, 'shop.order.confirm_overdue', {
        order_id: o.order_id,
        merchant_id: o.merchant_id,
        confirm_due_at: lock[0].confirm_due_at,
        repeat: n,
      });
      return {
        emitted: true,
        flagged: n === 0 ? await flagUnresponsive(tx, o.merchant_id) : false,
      };
    });
    if (r.emitted) events++;
    if (r.flagged) unresponsive++;
  }
  return { events, unresponsive };
}

async function flagUnresponsive(tx: ShopTx, merchant_id: string): Promise<boolean> {
  const last = await tx.$queryRawUnsafe<Array<{ late: boolean }>>(
    `SELECT EXISTS (SELECT 1 FROM shop_order_events e
                     WHERE e.order_id = o.order_id AND e.reason = 'confirm_overdue') AS late
       FROM shop_orders o
      WHERE o.merchant_id = $1::uuid AND o.settled_at IS NOT NULL
        AND (EXISTS (SELECT 1 FROM shop_order_events e
                      WHERE e.order_id = o.order_id AND e.reason = 'confirm_overdue')
          OR EXISTS (SELECT 1 FROM shop_order_events e
                      WHERE e.order_id = o.order_id AND e.to_state = 'CONFIRMED' AND e.actor = 'merchant'))
      ORDER BY o.settled_at DESC LIMIT $2::int`,
    merchant_id,
    UNRESPONSIVE_STREAK,
  );
  if (last.length < UNRESPONSIVE_STREAK || !last.every((r) => r.late)) return false;
  const upd = await tx.$executeRawUnsafe(
    `UPDATE shop_merchants SET status_reason = 'unresponsive'
      WHERE merchant_id = $1::uuid AND status_reason IS NULL`,
    merchant_id,
  );
  if (upd === 0) return false;
  await emit(tx, 'shop.merchant.unresponsive', { merchant_id, streak: UNRESPONSIVE_STREAK });
  return true;
}

/** (c) close_after passed on a FULFILLED/DELIVERED order -> CLOSED. */
async function closeOrders(d: ShopDeps, now: Date): Promise<number> {
  const due = await d.db.$queryRawUnsafe<Array<{ order_id: string }>>(
    `SELECT order_id FROM shop_orders
      WHERE state IN ('FULFILLED', 'DELIVERED') AND close_after < $1::timestamptz LIMIT 500`,
    now,
  );
  let n = 0;
  for (const o of due) {
    n += await d.transaction(async (tx) => {
      const cur = await tx.$queryRawUnsafe<Array<{ merchant_id: string }>>(
        `SELECT merchant_id FROM shop_orders
          WHERE order_id = $1::uuid AND state IN ('FULFILLED', 'DELIVERED')
            AND close_after < $2::timestamptz FOR UPDATE`,
        o.order_id,
        now,
      );
      if (cur.length === 0) return 0;
      await transition(tx, o.order_id, 'CLOSED', { actor: 'system', reason: 'close_after' });
      await emit(tx, 'shop.order.closed', {
        order_id: o.order_id,
        merchant_id: cur[0].merchant_id,
      });
      return 1;
    });
  }
  return n;
}

/** (d) refund due_at passed (buyer requests and `duplicate` alike) -> overdue, one event (REFUND_OVERDUE). */
async function overdueRefunds(d: ShopDeps, now: Date): Promise<number> {
  return d.transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe<
      Array<{
        refund_id: string;
        order_id: string;
        reason: string;
        due_at: Date;
        merchant_id: string;
      }>
    >(
      `UPDATE shop_refunds r SET status = 'overdue'
         FROM shop_orders o
        WHERE o.order_id = r.order_id AND r.due_at < $1::timestamptz
          AND r.status IN ('requested', 'awaiting_merchant_tx')
       RETURNING r.refund_id, r.order_id, r.reason, r.due_at, o.merchant_id`,
      now,
    );
    for (const r of rows) {
      await emit(tx, 'shop.refund.overdue', {
        refund_id: r.refund_id,
        order_id: r.order_id,
        merchant_id: r.merchant_id,
        reason: r.reason,
        due_at: r.due_at,
      });
    }
    return rows.length;
  });
}

/** (e) F-1: payout_pending whose effective_at has passed becomes the merchant's wallet for its rail. */
async function applyPayouts(d: ShopDeps, now: Date): Promise<number> {
  return d.transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe<Array<{ merchant_id: string; rail: string }>>(
      `UPDATE shop_merchants
          SET payout_wallet_base = CASE WHEN payout_pending->>'rail' = 'base'
                                        THEN payout_pending->>'wallet' ELSE payout_wallet_base END,
              payout_wallet_tempo = CASE WHEN payout_pending->>'rail' = 'tempo'
                                         THEN payout_pending->>'wallet' ELSE payout_wallet_tempo END,
              payout_pending = NULL
        WHERE payout_pending IS NOT NULL
          AND payout_pending->>'rail' IN ('base', 'tempo')
          AND (payout_pending->>'effective_at')::timestamptz < $1::timestamptz
       RETURNING merchant_id, payout_pending->>'rail' AS rail`,
      now,
    );
    for (const m of rows)
      await emit(tx, 'shop.merchant.payout_applied', { merchant_id: m.merchant_id });
    return rows.length;
  });
}

/** (f) §5.1: connect events live 30 days. */
async function pruneConnectEvents(d: ShopDeps, now: Date): Promise<number> {
  return d.db.$executeRawUnsafe(
    `DELETE FROM shop_connect_events WHERE at < $1::timestamptz - ($2::int * interval '1 day')`,
    now,
    CONNECT_EVENTS_TTL_DAYS,
  );
}

/** `shop-sla-sweeper` (every 5 min, worker): each step is independent, one failing does not stop the rest. */
export async function runShopSlaSweeper(
  d: ShopDeps = defaultShopDeps(),
  nowMs: number = Date.now(),
): Promise<SweepResult> {
  const now = new Date(nowMs);
  const out: SweepResult = {
    quotes_expired: 0,
    confirm_overdue: 0,
    merchants_unresponsive: 0,
    orders_closed: 0,
    refunds_overdue: 0,
    payouts_applied: 0,
    connect_events_deleted: 0,
  };
  const step = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      logger.error({ err, job: 'shop-sla-sweeper', step: name }, 'sweeper step failed');
    }
  };
  await step('expire_quotes', async () => void (out.quotes_expired = await expireQuotes(d, now)));
  await step('confirm_overdue', async () => {
    const r = await confirmOverdue(d, now);
    out.confirm_overdue = r.events;
    out.merchants_unresponsive = r.unresponsive;
  });
  await step('close_orders', async () => void (out.orders_closed = await closeOrders(d, now)));
  await step(
    'refunds_overdue',
    async () => void (out.refunds_overdue = await overdueRefunds(d, now)),
  );
  await step('payouts', async () => void (out.payouts_applied = await applyPayouts(d, now)));
  await step(
    'connect_events',
    async () => void (out.connect_events_deleted = await pruneConnectEvents(d, now)),
  );
  return out;
}
