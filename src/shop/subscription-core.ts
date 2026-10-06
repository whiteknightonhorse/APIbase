import { getMppConfig } from '../config/mpp.config';
import { toMicroUsdc } from '../config/x402.config';
import type { ShopTx } from './db';

/**
 * T-INT-41 (UC-9 / F-8): subscription state, shared by the payment hook (order-payment.service)
 * and the service layer. A period is an ORDER: it is quoted, paid and delivered like any other
 * order, and renewal is always an explicit payment of the buyer's agent. Nothing here ever pulls
 * funds (only INT-47 stores pre-signed authorizations, executed by the `shop-subscription-pull` job).
 *
 * The link between an order and its subscription is the payload of the order's creation event
 * (`QUOTED`, seq 1): `{subscription: {subscribe: true, plan}}` for period 1 and
 * `{subscription: {subscription_id, period_no}}` for a renewal. No schema change is needed.
 */

/** A renewal quote can be fetched from `period_end - 72 h` to `period_end + 72 h`. */
export const RENEWAL_WINDOW_H = 72;
/** After `period_end`: the merchant is told at +24 h; at +72 h the subscription is canceled unpaid. */
export const PAST_DUE_NOTICE_H = 24;
export const UNPAID_CANCEL_H = 72;
const HOUR_MS = 3_600_000;

export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'expired';

export interface SubscriptionPlan {
  sku: string;
  title: string;
  period_unit: 'day' | 'week' | 'month';
  period_count: number;
  amount_usd: number;
  max_periods: number | null;
}

export interface SubscriptionRow {
  subscription_id: string;
  merchant_id: string;
  sku: string;
  buyer_agent_id: string | null;
  plan: SubscriptionPlan;
  rail_pref: string | null;
  /** T-INT-47: `base_preauth` once the payer stored pre-signed authorizations (else `none`). */
  pull_mode: 'none' | 'base_preauth' | 'tempo_keychain';
  next_charge_at: Date | null;
  expires_at: Date | null;
  max_periods: number | null;
  status: SubscriptionStatus;
  status_reason: string | null;
  canceled_at: Date | null;
  created_at: Date;
}

export interface PeriodRow {
  period_no: number;
  period_start: Date;
  period_end: Date;
  order_id: string | null;
  status: string;
}

export interface SubscriptionBinding {
  subscribe?: true;
  plan?: SubscriptionPlan;
  subscription_id?: string;
  period_no?: number;
}

export const SUBSCRIPTION_COLS = `subscription_id, merchant_id, sku, buyer_agent_id, plan, rail_pref, pull_mode,
  next_charge_at, expires_at, max_periods, status, status_reason, canceled_at, created_at`;

/** `date + count x unit` in UTC; a month keeps the day of month, clamped to the target month's end. */
export function addPeriod(date: Date, unit: 'day' | 'week' | 'month', count: number): Date {
  const d = new Date(date.getTime());
  if (unit === 'day') d.setUTCDate(d.getUTCDate() + count);
  else if (unit === 'week') d.setUTCDate(d.getUTCDate() + 7 * count);
  else {
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + count);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last));
  }
  return d;
}

export const emitSubscriptionEvent = (
  tx: ShopTx,
  type: 'started' | 'renewed' | 'past_due' | 'canceled' | 'expired' | 'pull_failed',
  payload: Record<string, unknown>,
) =>
  tx.$executeRawUnsafe(
    `INSERT INTO outbox (event_type, payload) VALUES ($1, $2::jsonb)`,
    `shop.subscription.${type}`,
    JSON.stringify(payload),
  );

/**
 * T-INT-47: a canceled or expired subscription never executes a stored authorization. Every
 * still-pending leg becomes `canceled` (submitted ones are in flight and are left to reconcile).
 */
export const cancelPendingAuthorizations = (tx: ShopTx, subscription_id: string) =>
  tx.$executeRawUnsafe(
    `UPDATE shop_subscription_authorizations SET status = 'canceled'
      WHERE subscription_id = $1::uuid AND status = 'pending'`,
    subscription_id,
  );

export interface PreauthorizedPeriod {
  period_no: number;
  status: string;
  valid_after: string;
  valid_before: string;
  /** A second, fee-leg authorization is stored for this period (the fee settles in the same transaction). */
  fee_leg: boolean;
  tx_hash: string | null;
}

/** T-INT-47: the stored pre-signed periods of a subscription (never the signatures), oldest first. */
export async function preauthorizedPeriods(
  db: ShopTx,
  subscription_id: string,
): Promise<PreauthorizedPeriod[]> {
  const rows = await db.$queryRawUnsafe<
    Array<{
      period_no: number;
      status: string;
      valid_after: Date;
      valid_before: Date;
      fee_leg: boolean;
      tx_hash: string | null;
    }>
  >(
    `SELECT a.period_no, a.status, a.valid_after, a.valid_before,
            EXISTS (SELECT 1 FROM shop_subscription_authorizations f
                     WHERE f.subscription_id = a.subscription_id AND f.period_no = a.period_no
                       AND f.leg = 'fee' AND f.valid_before = a.valid_before) AS fee_leg,
            (SELECT p.tx_hash FROM shop_payments p
              WHERE p.eip3009_nonce = a.nonce AND p.chain_status = 'confirmed' LIMIT 1) AS tx_hash
       FROM shop_subscription_authorizations a
      WHERE a.subscription_id = $1::uuid AND a.leg = 'merchant'
      ORDER BY a.period_no, a.valid_before`,
    subscription_id,
  );
  return rows.map((r) => ({
    period_no: r.period_no,
    status: r.status,
    valid_after: new Date(r.valid_after).toISOString(),
    valid_before: new Date(r.valid_before).toISOString(),
    fee_leg: r.fee_leg,
    tx_hash: r.tx_hash,
  }));
}

/** The subscription link carried by an order's creation event, or null for an ordinary order. */
export async function bindingOfOrder(
  db: ShopTx,
  order_id: string,
): Promise<SubscriptionBinding | null> {
  const rows = await db.$queryRawUnsafe<Array<{ s: SubscriptionBinding | null }>>(
    `SELECT payload->'subscription' AS s FROM shop_order_events WHERE order_id = $1::uuid AND seq = 1`,
    order_id,
  );
  return rows[0]?.s ?? null;
}

export async function latestPeriod(db: ShopTx, subscription_id: string): Promise<PeriodRow | null> {
  const rows = await db.$queryRawUnsafe<PeriodRow[]>(
    `SELECT period_no, period_start, period_end, order_id, status FROM shop_subscription_periods
      WHERE subscription_id = $1::uuid AND status = 'paid' ORDER BY period_no DESC LIMIT 1`,
    subscription_id,
  );
  return rows[0] ?? null;
}

/** Period 1 ends the subscription's term when `max_periods` is reached. */
export const reachedEnd = (
  s: Pick<SubscriptionRow, 'max_periods' | 'expires_at'>,
  n: number,
  paidEnd: Date,
) =>
  (s.max_periods != null && n >= s.max_periods) ||
  (s.expires_at != null && paidEnd.getTime() >= new Date(s.expires_at).getTime());

/**
 * Payment hook, called inside the PAID transaction (order-payment.service.confirmPayment) before
 * the order moves: period 1 creates the subscription, a renewal adds its period. Returns the
 * `{subscription_id, period_no}` the PAID event carries, or null for an ordinary order. A period
 * that is already paid (a second quote of the same period, paid in a race) is NOT credited twice:
 * `duplicate: true`, the money stays with the order (the merchant refunds it).
 */
export async function applySubscriptionPayment(
  tx: ShopTx,
  a: { order_id: string; merchant_id: string; rail: string; at: Date },
): Promise<{ subscription_id: string; period_no: number; duplicate?: true } | null> {
  const b = await bindingOfOrder(tx, a.order_id);
  if (!b) return null;

  if (b.subscribe && b.plan) {
    const buyer = await tx.$queryRawUnsafe<Array<{ buyer_identity: string | null }>>(
      `SELECT q.buyer_identity FROM shop_orders o JOIN shop_quotes q ON q.quote_id = o.quote_id
        WHERE o.order_id = $1::uuid`,
      a.order_id,
    );
    const end = addPeriod(a.at, b.plan.period_unit, b.plan.period_count);
    const expires =
      b.plan.max_periods != null
        ? addPeriod(a.at, b.plan.period_unit, b.plan.period_count * b.plan.max_periods)
        : null;
    const rows = await tx.$queryRawUnsafe<Array<{ subscription_id: string }>>(
      `INSERT INTO shop_subscriptions (merchant_id, sku, buyer_agent_id, plan, rail_pref,
          next_charge_at, expires_at, max_periods, status)
       VALUES ($1::uuid, $2, $3, $4::jsonb, $5, $6::timestamptz, $7::timestamptz, $8::int, 'active')
       RETURNING subscription_id`,
      a.merchant_id,
      b.plan.sku,
      buyer[0]?.buyer_identity ?? null,
      JSON.stringify(b.plan),
      a.rail,
      end.toISOString(),
      expires?.toISOString() ?? null,
      b.plan.max_periods,
    );
    const subscription_id = rows[0].subscription_id;
    await tx.$executeRawUnsafe(
      `INSERT INTO shop_subscription_periods (subscription_id, period_no, period_start, period_end, order_id, status)
       VALUES ($1::uuid, 1, $2::timestamptz, $3::timestamptz, $4::uuid, 'paid')`,
      subscription_id,
      a.at.toISOString(),
      end.toISOString(),
      a.order_id,
    );
    await emitSubscriptionEvent(tx, 'started', {
      subscription_id,
      merchant_id: a.merchant_id,
      sku: b.plan.sku,
      period_no: 1,
      order_id: a.order_id,
      current_period_end: end.toISOString(),
    });
    return { subscription_id, period_no: 1 };
  }

  if (!b.subscription_id || !Number.isInteger(b.period_no)) return null;
  const period_no = b.period_no as number;
  const subs = await tx.$queryRawUnsafe<SubscriptionRow[]>(
    `SELECT ${SUBSCRIPTION_COLS} FROM shop_subscriptions WHERE subscription_id = $1::uuid FOR UPDATE`,
    b.subscription_id,
  );
  const sub = subs[0];
  if (!sub) return null;
  const prev = await tx.$queryRawUnsafe<PeriodRow[]>(
    `SELECT period_no, period_start, period_end, order_id, status FROM shop_subscription_periods
      WHERE subscription_id = $1::uuid AND period_no = $2::int`,
    sub.subscription_id,
    period_no - 1,
  );
  // Contiguous periods; a payment so late that its period is already over starts now instead.
  let start = prev[0] ? new Date(prev[0].period_end) : a.at;
  let end = addPeriod(start, sub.plan.period_unit, sub.plan.period_count);
  if (end.getTime() <= a.at.getTime()) {
    start = a.at;
    end = addPeriod(start, sub.plan.period_unit, sub.plan.period_count);
  }
  const ins = await tx.$queryRawUnsafe<Array<{ period_no: number }>>(
    `INSERT INTO shop_subscription_periods (subscription_id, period_no, period_start, period_end, order_id, status)
     VALUES ($1::uuid, $2::int, $3::timestamptz, $4::timestamptz, $5::uuid, 'paid')
     ON CONFLICT (subscription_id, period_no) DO UPDATE
        SET period_start = EXCLUDED.period_start, period_end = EXCLUDED.period_end,
            order_id = EXCLUDED.order_id, status = 'paid'
      WHERE shop_subscription_periods.status <> 'paid'
     RETURNING period_no`,
    sub.subscription_id,
    period_no,
    start.toISOString(),
    end.toISOString(),
    a.order_id,
  );
  if (ins.length === 0) return { subscription_id: sub.subscription_id, period_no, duplicate: true };
  await tx.$executeRawUnsafe(
    `UPDATE shop_subscriptions
        SET next_charge_at = $2::timestamptz, rail_pref = $3,
            status = CASE WHEN status = 'past_due' THEN 'active' ELSE status END,
            status_reason = CASE WHEN status = 'past_due' THEN NULL ELSE status_reason END
      WHERE subscription_id = $1::uuid`,
    sub.subscription_id,
    end.toISOString(),
    a.rail,
  );
  await emitSubscriptionEvent(tx, 'renewed', {
    subscription_id: sub.subscription_id,
    merchant_id: sub.merchant_id,
    sku: sub.sku,
    period_no,
    order_id: a.order_id,
    current_period_end: end.toISOString(),
  });
  return { subscription_id: sub.subscription_id, period_no };
}

/**
 * Time-driven transitions of one subscription (lazy on `get`/`cancel`, eager in the sweep job).
 * Locks the row; idempotent; events are written once (past_due: looked up by period in the outbox).
 *   paid period over, term reached                 -> expired
 *   paid period over, no renewal                   -> past_due
 *   period_end + 24 h                              -> one `subscription.past_due` event
 *   period_end + 72 h                              -> canceled, status_reason 'unpaid', event
 */
export async function advanceSubscription(
  tx: ShopTx,
  subscription_id: string,
  nowMs: number,
): Promise<SubscriptionRow | null> {
  const subs = await tx.$queryRawUnsafe<SubscriptionRow[]>(
    `SELECT ${SUBSCRIPTION_COLS} FROM shop_subscriptions WHERE subscription_id = $1::uuid FOR UPDATE`,
    subscription_id,
  );
  const sub = subs[0];
  if (!sub) return null;
  if (sub.status === 'canceled' || sub.status === 'expired' || !sub.next_charge_at) return sub;
  const paidEnd = new Date(sub.next_charge_at);
  if (nowMs < paidEnd.getTime()) return sub;

  const last = await latestPeriod(tx, subscription_id);
  const n = last?.period_no ?? 1;
  const base = { subscription_id, merchant_id: sub.merchant_id, sku: sub.sku, period_no: n };
  const set = async (status: SubscriptionStatus, reason: string | null) => {
    const rows = await tx.$queryRawUnsafe<SubscriptionRow[]>(
      `UPDATE shop_subscriptions
          SET status = $2, status_reason = $3,
              canceled_at = CASE WHEN $2 = 'canceled' THEN $4::timestamptz ELSE canceled_at END
        WHERE subscription_id = $1::uuid RETURNING ${SUBSCRIPTION_COLS}`,
      subscription_id,
      status,
      reason,
      new Date(nowMs).toISOString(),
    );
    if (status === 'canceled' || status === 'expired') {
      await cancelPendingAuthorizations(tx, subscription_id);
    }
    return rows[0];
  };

  if (reachedEnd(sub, n, paidEnd)) {
    const out = await set('expired', 'term_reached');
    await emitSubscriptionEvent(tx, 'expired', base);
    return out;
  }
  const late = nowMs - paidEnd.getTime();
  if (late >= UNPAID_CANCEL_H * HOUR_MS) {
    const out = await set('canceled', 'unpaid');
    await emitSubscriptionEvent(tx, 'canceled', {
      ...base,
      reason: 'unpaid',
      access_until: paidEnd.toISOString(),
    });
    return out;
  }
  const out = sub.status === 'past_due' ? sub : await set('past_due', 'renewal_due');
  if (late >= PAST_DUE_NOTICE_H * HOUR_MS) {
    const seen = await tx.$queryRawUnsafe<unknown[]>(
      `SELECT 1 FROM outbox WHERE event_type = 'shop.subscription.past_due'
          AND payload->>'subscription_id' = $1 AND (payload->>'period_no')::int = $2::int LIMIT 1`,
      subscription_id,
      n,
    );
    if (seen.length === 0) {
      await emitSubscriptionEvent(tx, 'past_due', {
        ...base,
        next_period_no: n + 1,
        due_since: paidEnd.toISOString(),
      });
    }
  }
  return out;
}

/** F-12 statistics: the number of live subscriptions (no MRR: it is not in the specification). */
export async function countActiveSubscriptions(db: ShopTx, merchant_id: string): Promise<number> {
  const r = await db.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT count(*)::int AS n FROM shop_subscriptions
      WHERE merchant_id = $1::uuid AND status = 'active'`,
    merchant_id,
  );
  return r[0]?.n ?? 0;
}

// ---------------------------------------------------------------------------
// T-INT-49 (UC-9 on Tempo): the merchant's renewal key (address only) and the payer's setup
// ---------------------------------------------------------------------------

/**
 * The renewal key of a merchant: its ADDRESS and expiry only. The private key is generated and kept
 * by the merchant (`packages/merchant-renewer`); this server never receives or stores one. Kept in
 * `shop_merchants.limits.renewer_key` (migration 0027 has no `renewer_key` column).
 */
export interface RenewerKey {
  key_id: string;
  expires_at: string;
}

export async function renewerKeyOf(db: ShopTx, merchant_id: string): Promise<RenewerKey | null> {
  const rows = await db.$queryRawUnsafe<Array<{ k: RenewerKey | null }>>(
    `SELECT limits->'renewer_key' AS k FROM shop_merchants WHERE merchant_id = $1::uuid`,
    merchant_id,
  );
  const k = rows[0]?.k;
  return k && typeof k.key_id === 'string' && typeof k.expires_at === 'string' ? k : null;
}

export interface PullSetup {
  method: 'tempo_keychain';
  key_id: string;
  token: string;
  /** micro-USDC (6 decimals) as a decimal string: price x remaining periods. */
  limit: string;
  /** unix seconds */
  expiry: number;
  how: string;
}

/** The periods after `last` that still start before `until` (and inside max_periods). */
export function remainingPeriods(
  sub: Pick<SubscriptionRow, 'plan' | 'max_periods'>,
  last: Pick<PeriodRow, 'period_no' | 'period_end'>,
  until: Date,
): number {
  let n = 0;
  let cursor = new Date(last.period_end);
  for (let no = last.period_no + 1; no <= last.period_no + 400; no++) {
    if (sub.max_periods != null && no > sub.max_periods) break;
    if (cursor.getTime() >= until.getTime()) break;
    n++;
    cursor = addPeriod(cursor, sub.plan.period_unit, sub.plan.period_count);
  }
  return n;
}

/** What the payer's agent must authorize for the merchant's key, or null (no key / nothing left). */
export function tempoPullSetup(
  sub: Pick<SubscriptionRow, 'plan' | 'max_periods' | 'expires_at' | 'rail_pref' | 'status'>,
  last: Pick<PeriodRow, 'period_no' | 'period_end'> | null,
  key: RenewerKey | null,
  nowMs: number,
): PullSetup | null {
  if (!key || !last || sub.rail_pref !== 'tempo') return null;
  if (sub.status !== 'active' && sub.status !== 'past_due') return null;
  let until = new Date(key.expires_at);
  if (sub.expires_at && new Date(sub.expires_at).getTime() < until.getTime()) {
    until = new Date(sub.expires_at);
  }
  if (until.getTime() <= nowMs) return null;
  const periods = remainingPeriods(sub, last, until);
  if (periods < 1) return null;
  const limit = (BigInt(toMicroUsdc(sub.plan.amount_usd)) * BigInt(periods)).toString();
  const expiry = Math.floor(until.getTime() / 1000);
  const token = getMppConfig().usdcAddress;
  return {
    method: 'tempo_keychain',
    key_id: key.key_id,
    token,
    limit,
    expiry,
    how: `call accessKey.authorize({accessKey: '${key.key_id}', expiry: ${expiry}, limits: [{token: '${token}', amount: ${limit}n}]}) from the payer account (viem/tempo), then call shop.subscription.confirm_pull`,
  };
}
