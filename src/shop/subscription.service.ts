import type { ShopTx } from './db';
import type { ShopDeps } from './merchant-lifecycle.service';
import { isPayer } from './order-payment.service';
import { QuoteError } from './quote.errors';
import { createQuote, getQuote, type Buyer, type QuoteResponse } from './quote.service';
import {
  advanceSubscription,
  bindingOfOrder,
  cancelPendingAuthorizations,
  emitSubscriptionEvent,
  latestPeriod,
  preauthorizedPeriods,
  reachedEnd,
  renewerKeyOf,
  RENEWAL_WINDOW_H,
  SUBSCRIPTION_COLS,
  type PeriodRow,
  type PreauthorizedPeriod,
  type PullSetup,
  type SubscriptionRow,
  type SubscriptionStatus,
  tempoPullSetup,
} from './subscription-core';

const DOCS = '/docs/integrator#subscriptions';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOUR_MS = 3_600_000;
const STATUSES: readonly SubscriptionStatus[] = ['active', 'past_due', 'canceled', 'expired'];
const MAX_LIST = 200;

const now = (d: ShopDeps) => (d.now ?? Date.now)();
const notFound = () =>
  new QuoteError(404, 'not_found', 'subscription not found', 'use_different_tool', {
    documentation_url: DOCS,
  });
const invalid = (message: string) =>
  new QuoteError(422, 'validation_failed', message, 'fix_request', { documentation_url: DOCS });

export interface RenewView {
  quote_id: string;
  expires_at: string;
  total_usd: number;
  period_no: number;
  pay: QuoteResponse['pay'];
}

export interface SubscriptionView {
  subscription_id: string;
  sku: string;
  status: SubscriptionStatus;
  status_reason: string | null;
  period_no: number;
  current_period_end: string | null;
  next_charge_at: string | null;
  max_periods: number | null;
  /** `base_preauth` (T-INT-47) or `tempo_keychain` (T-INT-49) while a pull is set up, else `none`. */
  pull_mode: string;
  preauthorized_periods?: PreauthorizedPeriod[];
  /** T-INT-49: Tempo subscription of a merchant that registered a renewal key: what to authorize. */
  pull_setup?: PullSetup;
  canceled_at?: string;
  /** A canceled subscription keeps the period that was paid for until here. */
  access_until?: string;
  renew?: RenewView;
}

export async function loadRow(db: ShopTx, id: unknown): Promise<SubscriptionRow> {
  if (typeof id !== 'string' || !UUID_RE.test(id)) throw notFound();
  const rows = await db.$queryRawUnsafe<SubscriptionRow[]>(
    `SELECT ${SUBSCRIPTION_COLS} FROM shop_subscriptions WHERE subscription_id = $1::uuid`,
    id,
  );
  if (!rows[0]) throw notFound();
  return rows[0];
}

/** The payer: the identity that quoted period 1, or the identity of the wallet that paid it. */
export async function assertPayer(
  db: ShopTx,
  sub: SubscriptionRow,
  identity: string,
): Promise<void> {
  if (sub.buyer_agent_id && sub.buyer_agent_id === identity) return;
  const first = await db.$queryRawUnsafe<
    Array<{ buyer_identity: string | null; payer_wallet: string | null }>
  >(
    `SELECT q.buyer_identity, o.payer_wallet
       FROM shop_subscription_periods p
       JOIN shop_orders o ON o.order_id = p.order_id
       JOIN shop_quotes q ON q.quote_id = o.quote_id
      WHERE p.subscription_id = $1::uuid`,
    sub.subscription_id,
  );
  if (!first.some((r) => isPayer(r, identity))) throw notFound();
}

/** The period that contains `at` (else the last paid one) and when the paid time runs out. */
async function currentPeriod(db: ShopTx, id: string, at: number): Promise<PeriodRow | null> {
  const rows = await db.$queryRawUnsafe<PeriodRow[]>(
    `SELECT period_no, period_start, period_end, order_id, status FROM shop_subscription_periods
      WHERE subscription_id = $1::uuid AND status = 'paid' AND period_start <= $2::timestamptz
      ORDER BY period_no DESC LIMIT 1`,
    id,
    new Date(at).toISOString(),
  );
  return rows[0] ?? (await latestPeriod(db, id));
}

async function viewOf(db: ShopTx, sub: SubscriptionRow, at: number): Promise<SubscriptionView> {
  const cur = await currentPeriod(db, sub.subscription_id, at);
  const end = cur ? new Date(cur.period_end).toISOString() : null;
  return {
    subscription_id: sub.subscription_id,
    sku: sub.sku,
    status: sub.status,
    status_reason: sub.status_reason,
    period_no: cur?.period_no ?? 1,
    current_period_end: end,
    next_charge_at: sub.next_charge_at ? new Date(sub.next_charge_at).toISOString() : null,
    max_periods: sub.max_periods,
    pull_mode: sub.pull_mode ?? 'none',
    ...(sub.pull_mode === 'base_preauth'
      ? { preauthorized_periods: await preauthorizedPeriods(db, sub.subscription_id) }
      : {}),
    ...(sub.canceled_at ? { canceled_at: new Date(sub.canceled_at).toISOString() } : {}),
    ...(sub.status === 'canceled' && sub.next_charge_at
      ? { access_until: new Date(sub.next_charge_at).toISOString() }
      : {}),
  };
}

/** The plain view of a subscription (no renew quote, no 402): for the services that changed it. */
export async function subscriptionViewById(
  d: ShopDeps,
  subscription_id: string,
): Promise<SubscriptionView> {
  return viewOf(d.db, await loadRow(d.db, subscription_id), now(d));
}

/**
 * The renewal quote of period n+1, created on demand and reused while it lives (15 min TTL by the
 * merchant's quote_ttl_s): a repeated `get` answers the same quote, an expired one is replaced.
 */
export async function renewalQuote(
  d: ShopDeps,
  sub: SubscriptionRow,
  buyer: Buyer,
  nextNo: number,
  at: number,
): Promise<RenewView> {
  const live = await d.db.$queryRawUnsafe<Array<{ quote_id: string }>>(
    `SELECT q.quote_id
       FROM shop_quotes q
       JOIN shop_orders o ON o.quote_id = q.quote_id AND o.state IN ('QUOTED', 'PAYING')
       JOIN shop_order_events e ON e.order_id = o.order_id AND e.seq = 1
      WHERE q.merchant_id = $1::uuid AND q.buyer_identity = $2 AND q.status = 'open'
        AND q.expires_at > $3::timestamptz
        AND e.payload->'subscription'->>'subscription_id' = $4
        AND (e.payload->'subscription'->>'period_no')::int = $5::int
      ORDER BY q.created_at DESC LIMIT 1`,
    sub.merchant_id,
    buyer.identity,
    new Date(at).toISOString(),
    sub.subscription_id,
    nextNo,
  );
  const q: QuoteResponse = live[0]
    ? await getQuote(d, live[0].quote_id, buyer)
    : await createQuote(
        d,
        sub.merchant_id,
        buyer,
        { items: [{ sku: sub.sku, qty: 1 }] },
        {
          subscription_id: sub.subscription_id,
          period_no: nextNo,
          plan: sub.plan,
        },
      );
  return {
    quote_id: q.quote_id,
    expires_at: q.expires_at,
    total_usd: q.total_usd,
    period_no: nextNo,
    pay: q.pay,
  };
}

const inWindow = (sub: SubscriptionRow, n: number, at: number): boolean => {
  if (!sub.next_charge_at || (sub.status !== 'active' && sub.status !== 'past_due')) return false;
  const end = new Date(sub.next_charge_at);
  if (reachedEnd(sub, n, end)) return false;
  const w = RENEWAL_WINDOW_H * HOUR_MS;
  return at >= end.getTime() - w && at <= end.getTime() + w;
};

/**
 * §6.1 shop.subscription.get / §6.3 GET /subscriptions/:id (the payer only; anyone else: 404).
 * Inside `[period_end - 72 h, period_end + 72 h]` the answer carries `renew`; past `period_end`
 * without payment the status is `past_due` and the answer is `402 subscription_renewal_due`
 * with the same `renew` (UC-9: the agent learns of it on its next call, there is no e-mail).
 */
export async function getSubscription(
  d: ShopDeps,
  buyer: Buyer,
  subscription_id: unknown,
  opts: { merchant_id?: string } = {},
): Promise<SubscriptionView> {
  const at = now(d);
  const row = await loadRow(d.db, subscription_id);
  if (opts.merchant_id && row.merchant_id !== opts.merchant_id) throw notFound();
  await assertPayer(d.db, row, buyer.identity);
  const sub =
    (await d.transaction((tx) => advanceSubscription(tx, row.subscription_id, at))) ?? row;
  const view = await viewOf(d.db, sub, at);
  const last = await latestPeriod(d.db, sub.subscription_id);
  const n = last?.period_no ?? 1;
  const setup = tempoPullSetup(sub, last, await renewerKeyOf(d.db, sub.merchant_id), at);
  if (setup) view.pull_setup = setup;
  if (inWindow(sub, n, at)) view.renew = await renewalQuote(d, sub, buyer, n + 1, at);
  if (sub.status === 'past_due') {
    throw new QuoteError(
      402,
      'subscription_renewal_due',
      'the paid period is over: pay the renewal quote to continue (it is canceled unpaid 72 h after the period end)',
      'add_payment',
      { subscription: view, renew: view.renew, documentation_url: DOCS },
    );
  }
  return view;
}

/** §6.1 shop.subscription.cancel: the payer ends the subscription; the paid period runs out. */
export async function cancelSubscription(
  d: ShopDeps,
  buyer: Buyer,
  subscription_id: unknown,
  reason: unknown,
  opts: { merchant_id?: string } = {},
): Promise<SubscriptionView> {
  if (reason != null && (typeof reason !== 'string' || reason.length > 500)) {
    throw invalid('reason must be a string up to 500 characters');
  }
  const row = await loadRow(d.db, subscription_id);
  if (opts.merchant_id && row.merchant_id !== opts.merchant_id) throw notFound();
  await assertPayer(d.db, row, buyer.identity);
  return endSubscription(d, row.subscription_id, 'buyer', (reason as string | null) ?? null);
}

/** Merchant side: `POST /merchants/me/subscriptions/:id/cancel {reason}` (another merchant's: 404). */
export async function merchantCancelSubscription(
  d: ShopDeps,
  merchant_id: string,
  subscription_id: unknown,
  reason: unknown,
): Promise<SubscriptionView> {
  if (reason != null && (typeof reason !== 'string' || reason.length > 500)) {
    throw invalid('reason must be a string up to 500 characters');
  }
  const row = await loadRow(d.db, subscription_id);
  if (row.merchant_id !== merchant_id) throw notFound();
  return endSubscription(d, row.subscription_id, 'merchant', (reason as string | null) ?? null);
}

async function endSubscription(
  d: ShopDeps,
  subscription_id: string,
  by: 'buyer' | 'merchant',
  reason: string | null,
): Promise<SubscriptionView> {
  const at = now(d);
  const sub = await d.transaction(async (tx) => {
    const s = await advanceSubscription(tx, subscription_id, at);
    if (!s || s.status === 'canceled' || s.status === 'expired') return s;
    const rows = await tx.$queryRawUnsafe<SubscriptionRow[]>(
      `UPDATE shop_subscriptions SET status = 'canceled', status_reason = $2, canceled_at = $3::timestamptz
        WHERE subscription_id = $1::uuid RETURNING ${SUBSCRIPTION_COLS}`,
      subscription_id,
      by,
      new Date(at).toISOString(),
    );
    // T-INT-47: a canceled subscription never executes a stored authorization.
    await cancelPendingAuthorizations(tx, subscription_id);
    const last = await latestPeriod(tx, subscription_id);
    await emitSubscriptionEvent(tx, 'canceled', {
      subscription_id,
      merchant_id: s.merchant_id,
      sku: s.sku,
      period_no: last?.period_no ?? 1,
      reason: by,
      ...(reason ? { note: reason } : {}),
      access_until: s.next_charge_at ? new Date(s.next_charge_at).toISOString() : null,
    });
    return rows[0];
  });
  return viewOf(d.db, sub ?? (await loadRow(d.db, subscription_id)), at);
}

/** `GET /merchants/me/subscriptions?status=&limit=&cursor=`: this merchant's, newest first. */
export async function listMerchantSubscriptions(
  d: ShopDeps,
  merchant_id: string,
  q: { status?: unknown; limit?: unknown; cursor?: unknown },
): Promise<{ subscriptions: Array<Record<string, unknown>>; next_cursor: string | null }> {
  if (q.status !== undefined && !STATUSES.includes(q.status as SubscriptionStatus)) {
    throw invalid(`status must be one of ${STATUSES.join(', ')}`);
  }
  const limit = q.limit === undefined ? 50 : Number(q.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIST) {
    throw invalid(`limit must be an integer 1..${MAX_LIST}`);
  }
  let after: { t: string; id: string } | undefined;
  if (q.cursor !== undefined) {
    try {
      const c = JSON.parse(Buffer.from(String(q.cursor), 'base64url').toString('utf8')) as {
        t?: unknown;
        id?: unknown;
      };
      if (typeof c.t !== 'string' || Number.isNaN(Date.parse(c.t)) || !UUID_RE.test(String(c.id))) {
        throw new Error('shape');
      }
      after = { t: c.t, id: String(c.id) };
    } catch {
      throw invalid('cursor must be a value returned by this endpoint');
    }
  }
  const rows = await d.db.$queryRawUnsafe<
    Array<
      Pick<
        SubscriptionRow,
        | 'subscription_id'
        | 'sku'
        | 'status'
        | 'status_reason'
        | 'max_periods'
        | 'next_charge_at'
        | 'rail_pref'
        | 'created_at'
        | 'canceled_at'
      > & { period_no: number | null; current_period_end: Date | null }
    >
  >(
    `SELECT s.subscription_id, s.sku, s.status, s.status_reason, s.max_periods, s.next_charge_at,
            s.rail_pref, s.created_at, s.canceled_at,
            (SELECT max(period_no) FROM shop_subscription_periods p
              WHERE p.subscription_id = s.subscription_id AND p.status = 'paid') AS period_no,
            s.next_charge_at AS current_period_end
       FROM shop_subscriptions s
      WHERE s.merchant_id = $1::uuid
        AND ($2::text IS NULL OR s.status = $2)
        AND ($3::timestamptz IS NULL OR (s.created_at, s.subscription_id) < ($3::timestamptz, $4::uuid))
      ORDER BY s.created_at DESC, s.subscription_id DESC LIMIT $5::int`,
    merchant_id,
    (q.status as string | undefined) ?? null,
    after?.t ?? null,
    after?.id ?? null,
    limit + 1,
  );
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    subscriptions: page.map((r) => ({
      subscription_id: r.subscription_id,
      sku: r.sku,
      status: r.status,
      status_reason: r.status_reason,
      period_no: r.period_no ?? 1,
      current_period_end: r.current_period_end,
      next_charge_at: r.next_charge_at,
      max_periods: r.max_periods,
      rail: r.rail_pref,
      created_at: r.created_at,
      canceled_at: r.canceled_at,
    })),
    next_cursor:
      rows.length > limit && last
        ? Buffer.from(
            JSON.stringify({
              t: new Date(last.created_at).toISOString(),
              id: last.subscription_id,
            }),
          ).toString('base64url')
        : null,
  };
}

/**
 * Before a period quote is paid (pay.service, ahead of ESCROW so no money moves): the subscription
 * must still be renewable and the period not yet paid. Returns a refusal or null.
 */
export async function periodRefusal(
  db: ShopTx,
  quote_id: string,
): Promise<{ code: 409; error: string; message: string } | null> {
  const o = await db.$queryRawUnsafe<Array<{ order_id: string }>>(
    `SELECT order_id FROM shop_orders WHERE quote_id = $1::uuid ORDER BY created_at DESC LIMIT 1`,
    quote_id,
  );
  if (!o[0]) return null;
  const b = await bindingOfOrder(db, o[0].order_id);
  if (!b?.subscription_id) return null;
  const sub = await db.$queryRawUnsafe<Array<{ status: string }>>(
    `SELECT status FROM shop_subscriptions WHERE subscription_id = $1::uuid`,
    b.subscription_id,
  );
  if (!sub[0] || (sub[0].status !== 'active' && sub[0].status !== 'past_due')) {
    return {
      code: 409,
      error: 'subscription_not_renewable',
      message: `the subscription is ${sub[0]?.status ?? 'gone'}: this period cannot be paid`,
    };
  }
  const paid = await db.$queryRawUnsafe<unknown[]>(
    `SELECT 1 FROM shop_subscription_periods
      WHERE subscription_id = $1::uuid AND period_no = $2::int AND status = 'paid'`,
    b.subscription_id,
    b.period_no,
  );
  if (paid.length > 0) {
    return {
      code: 409,
      error: 'subscription_period_paid',
      message: `period ${b.period_no} of this subscription is already paid`,
    };
  }
  return null;
}

/** `shop-subscription-sweep` body: moves every overdue subscription (events fire without a `get`). */
export async function runSubscriptionSweep(
  d: ShopDeps,
  nowMs: number = Date.now(),
): Promise<{ checked: number; changed: number }> {
  const due = await d.db.$queryRawUnsafe<Array<{ subscription_id: string; status: string }>>(
    `SELECT subscription_id, status FROM shop_subscriptions
      WHERE status IN ('active', 'past_due') AND next_charge_at <= $1::timestamptz
      ORDER BY next_charge_at LIMIT 500`,
    new Date(nowMs).toISOString(),
  );
  let changed = 0;
  for (const r of due) {
    const after = await d.transaction((tx) => advanceSubscription(tx, r.subscription_id, nowMs));
    if (after && after.status !== r.status) changed++;
  }
  return { checked: due.length, changed };
}
