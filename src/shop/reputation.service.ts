import type { ShopDeps } from './merchant-lifecycle.service';
import type { ShopTx } from './db';

/**
 * UC-17 / §5.1 shop_merchants.reputation, recomputed by the sweeper once an hour per merchant.
 *
 * Orders that count: settled, not the test SKU (F-12, `shop_quotes.is_test`). `orders_closed` = those in
 * CLOSED / REFUNDED / PARTIALLY_REFUNDED. Reason `duplicate` (our double charge, not the merchant's
 * fault) is excluded from `dispute_rate` and `refund_rate`.
 *   dispute_rate = orders with a non-duplicate dispute / orders_closed        (a fraction, 0.02 = 2 %)
 *   refund_rate  = orders with a verified non-duplicate refund / orders_closed
 *   closed_on_time_pct = 100 * closed orders that never raised confirm_overdue / ship_overdue / orders_closed
 */
const REPUTATION_REFRESH_MS = 3_600_000;
/** The thresholds apply from this many closed orders on. */
const MIN_ORDERS_FOR_THRESHOLDS = 10;
const DISPUTE_WARN_RATE = 0.01;
const DISPUTE_SUSPEND_RATE = 0.02;
/** One warning mail/event per merchant per this long. */
const WARN_REPEAT_MS = 7 * 86_400_000;

const ELIGIBLE = `o.settled_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM shop_quotes tq WHERE tq.quote_id = o.quote_id AND tq.is_test)`;

interface Reputation {
  closed_on_time_pct: number | null;
  dispute_rate: number;
  refund_rate: number;
  orders_closed: number;
  as_of: string;
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

const round = (n: number, p = 10_000) => Math.round(n * p) / p;

async function computeReputation(db: ShopTx, merchant_id: string, now: Date): Promise<Reputation> {
  const r = await db.$queryRawUnsafe<
    Array<{ closed: number; on_time: number; disputed: number; refunded: number }>
  >(
    `SELECT
       count(*) FILTER (WHERE o.state IN ('CLOSED', 'REFUNDED', 'PARTIALLY_REFUNDED'))::int AS closed,
       count(*) FILTER (WHERE o.state IN ('CLOSED', 'REFUNDED', 'PARTIALLY_REFUNDED')
         AND NOT EXISTS (SELECT 1 FROM shop_order_events e WHERE e.order_id = o.order_id
                          AND e.reason IN ('confirm_overdue', 'ship_overdue')))::int AS on_time,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM shop_disputes s WHERE s.order_id = o.order_id
                                       AND s.reason_code <> 'duplicate'))::int AS disputed,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM shop_refunds f WHERE f.order_id = o.order_id
                                       AND f.verified AND f.reason <> 'duplicate'))::int AS refunded
       FROM shop_orders o
      WHERE o.merchant_id = $1::uuid AND ${ELIGIBLE}`,
    merchant_id,
  );
  const { closed, on_time, disputed, refunded } = r[0];
  return {
    closed_on_time_pct: closed > 0 ? round((100 * on_time) / closed, 100) : null,
    dispute_rate: closed > 0 ? round(disputed / closed) : 0,
    refund_rate: closed > 0 ? round(refunded / closed) : 0,
    orders_closed: closed,
    as_of: now.toISOString(),
  };
}

/**
 * Recompute every active merchant whose reputation is older than an hour, publish it, and apply the UC-17
 * thresholds: dispute_rate >= 1 % at >= 10 closed orders -> a warning (mail + event, at most weekly);
 * >= 2 % -> `status_reason = 'disputes'` (quotes answer 410) until the operator clears it. The status is
 * never lifted here. Returns {updated, warned, suspended}.
 */
export async function refreshReputations(
  d: ShopDeps,
  now: Date,
): Promise<{ updated: number; warned: number; suspended: number }> {
  const stale = await d.db.$queryRawUnsafe<Array<{ merchant_id: string }>>(
    `SELECT merchant_id FROM shop_merchants
      WHERE status IN ('active', 'suspended')
        AND EXISTS (SELECT 1 FROM shop_orders so
                     WHERE so.merchant_id = shop_merchants.merchant_id AND so.settled_at IS NOT NULL)
        AND (reputation->>'as_of' IS NULL
             OR (reputation->>'as_of')::timestamptz < $1::timestamptz - ($2::int * interval '1 millisecond'))
      LIMIT 500`,
    now,
    REPUTATION_REFRESH_MS,
  );
  const out = { updated: 0, warned: 0, suspended: 0 };
  for (const m of stale) {
    const r = await d.transaction(async (tx) => {
      const rep = await computeReputation(tx, m.merchant_id, now);
      await tx.$executeRawUnsafe(
        `UPDATE shop_merchants SET reputation = $2::jsonb WHERE merchant_id = $1::uuid`,
        m.merchant_id,
        JSON.stringify(rep),
      );
      if (rep.orders_closed < MIN_ORDERS_FOR_THRESHOLDS) return { warned: false, suspended: false };
      if (rep.dispute_rate >= DISPUTE_SUSPEND_RATE) {
        const upd = await tx.$executeRawUnsafe(
          `UPDATE shop_merchants SET status_reason = 'disputes'
            WHERE merchant_id = $1::uuid AND status_reason IS NULL`,
          m.merchant_id,
        );
        if (upd === 0) return { warned: false, suspended: false };
        await emit(tx, 'shop.merchant.disputes_suspended', {
          merchant_id: m.merchant_id,
          dispute_rate: rep.dispute_rate,
          orders_closed: rep.orders_closed,
        });
        await queueMail(
          tx,
          m.merchant_id,
          'merchant_disputes_suspended',
          `out:disputes:${m.merchant_id}:suspended:${now.toISOString()}`,
        );
        return { warned: false, suspended: true };
      }
      if (rep.dispute_rate >= DISPUTE_WARN_RATE) {
        const recent = await tx.$queryRawUnsafe<unknown[]>(
          `SELECT 1 FROM outbox WHERE event_type = 'shop.merchant.dispute_rate_warning'
              AND payload->>'merchant_id' = $1
              AND created_at > $2::timestamptz - ($3::int * interval '1 millisecond') LIMIT 1`,
          m.merchant_id,
          now,
          WARN_REPEAT_MS,
        );
        if (recent.length > 0) return { warned: false, suspended: false };
        await emit(tx, 'shop.merchant.dispute_rate_warning', {
          merchant_id: m.merchant_id,
          dispute_rate: rep.dispute_rate,
          orders_closed: rep.orders_closed,
        });
        await queueMail(
          tx,
          m.merchant_id,
          'dispute_rate_warning',
          `out:disputes:${m.merchant_id}:warning:${now.toISOString()}`,
        );
        return { warned: true, suspended: false };
      }
      return { warned: false, suspended: false };
    });
    out.updated++;
    if (r.warned) out.warned++;
    if (r.suspended) out.suspended++;
  }
  return out;
}
