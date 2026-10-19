import { createHash } from 'node:crypto';
import { logger } from '../config/logger';
import { getMppConfig } from '../config/mpp.config';
import { toMicroUsdc } from '../config/x402.config';
import { currentPayout } from './auth/identity.service';
import type { ShopDeps } from './merchant-lifecycle.service';
import { transition } from './order-state';
import { mppSubscriptionAllowed, type Buyer } from './quote.service';
import {
  addPeriod,
  emitSubscriptionEvent,
  latestPeriod,
  reachedEnd,
  SUBSCRIPTION_COLS,
  type SubscriptionPlan,
  type SubscriptionRow,
} from './subscription-core';
import {
  tempoLegs,
  viemTransferReader,
  type TransferReader,
} from './subscription-keychain.service';
import { periodRefusal, renewalQuote } from './subscription.service';

/**
 * T-0431 (UC-9 on Tempo, R-5): the THIRD pull mode `mpp_subscription`.
 *
 * Period 1 of a day/week plan is paid at `POST /quotes/:id/pay?intent=subscription` with an MPP
 * challenge of intent `subscription` (mppx `tempo.subscription`). The payer's client authorizes a
 * periodic Tempo access key (TIP-1011) whose ADDRESS belongs to APIbase; mppx charges period 1
 * with it. Each later period is charged by `shop-subscription-sweep` through mppx `renew`: APIbase
 * signs with its own key and pays the gas. APIbase never receives or stores a payer's key; the
 * only secret behind a subscription is APIbase's own server-owned access key (mppx store).
 *
 * The renewal is recorded through the period order exactly like INT-47 / INT-49: a Tempo payment
 * row, the order PAYING, `finalizeConfirmed` -> PAID + `subscription.renewed`. The subscription
 * intent moves the whole period price to the merchant in one transfer (no splits), so the
 * platform fee is invoiced as a receivable. Cancel never touches the chain: the payer revokes the
 * key (`accessKey.revoke`).
 */

/** The key of a plan without `max_periods` lives this long; the subscription then needs a re-subscribe. */
const KEY_HORIZON_DAYS = 365;
const RENEW_BATCH = 100;
/** A renewal attempt that never reported back is treated as unknown after this long. */
const SUBMITTED_STALE_MS = 15 * 60_000;
/** An unknown outcome without a transaction hash is given up (operator alert) after this long. */
const UNKNOWN_GIVE_UP_MS = 2 * 3_600_000;
/** A reported transaction the chain does not show after this long was never mined. */
const TX_NOT_FOUND_MS = 30 * 60_000;
const TX_RE = /0x[0-9a-fA-F]{64}/;

const walletIdentity = (w: string) =>
  `wallet:${createHash('sha256').update(w.toLowerCase()).digest('hex')}`;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// ---------------------------------------------------------------------------
// 1. Quote stage: who may use the intent, and with what terms
// ---------------------------------------------------------------------------

export interface MppSubscriptionTerms {
  quote_id: string;
  merchant_id: string;
  plan: SubscriptionPlan;
  /** decimal USD, equals the plan price and the quote total */
  amount_usd: number;
  /** merchant payout wallet on Tempo (the whole period price goes there) */
  recipient: string;
  /** end of the periodic key authorization */
  key_expires_at: Date;
}

export type MppSubscriptionTermsResult =
  | { ok: true; terms: MppSubscriptionTerms }
  | { ok: false; reason: string };

/**
 * Server data only. The quote must be an open period-1 quote (`subscribe`) of a day/week plan,
 * payable on Tempo, and the mode must be offered (fee on and covering 10x the renewal gas, PAY-5).
 */
export async function mppSubscriptionTerms(
  quote_id: string,
  deps?: Pick<ShopDeps, 'db' | 'now'>,
): Promise<MppSubscriptionTermsResult> {
  const db = deps?.db ?? (await defaultDb());
  const at = (deps?.now ?? Date.now)();
  const rows = await db.$queryRawUnsafe<
    Array<{
      merchant_id: string;
      status: string;
      is_test: boolean;
      total_usd: number;
      rails_offered: string[];
      expires_at: Date;
      sub: { subscribe?: boolean; plan?: SubscriptionPlan } | null;
      payout_wallet_base: string;
      payout_wallet_tempo: string;
      payout_pending: { rail: 'base' | 'tempo'; wallet: string; effective_at: string } | null;
    }>
  >(
    `SELECT q.merchant_id, q.status, q.is_test, q.total_usd::float8 AS total_usd, q.rails_offered,
            q.expires_at,
            (SELECT e.payload->'subscription' FROM shop_orders o
               JOIN shop_order_events e ON e.order_id = o.order_id AND e.seq = 1
              WHERE o.quote_id = q.quote_id LIMIT 1) AS sub,
            m.payout_wallet_base, m.payout_wallet_tempo, m.payout_pending
       FROM shop_quotes q JOIN shop_merchants m ON m.merchant_id = q.merchant_id
      WHERE q.quote_id = $1::uuid`,
    quote_id,
  );
  const q = rows[0];
  if (!q) return { ok: false, reason: 'quote not found' };
  if (q.status !== 'open') return { ok: false, reason: 'the quote is no longer open' };
  if (!q.rails_offered.includes('tempo'))
    return { ok: false, reason: 'the quote is not payable on Tempo' };
  const plan = q.sub?.plan;
  if (!q.sub?.subscribe || !plan) {
    return { ok: false, reason: 'the quote is not period 1 of a subscription' };
  }
  if (plan.period_unit !== 'day' && plan.period_unit !== 'week') {
    return { ok: false, reason: 'the MPP subscription intent supports day and week plans only' };
  }
  if (!mppSubscriptionAllowed(plan, q.is_test)) {
    return { ok: false, reason: 'the mode is not offered for this plan' };
  }
  if (toMicroUsdc(plan.amount_usd) !== toMicroUsdc(q.total_usd)) {
    return { ok: false, reason: 'the quote total differs from the plan price' };
  }
  const end =
    plan.max_periods != null
      ? addPeriod(new Date(at), plan.period_unit, plan.period_count * plan.max_periods)
      : new Date(at + KEY_HORIZON_DAYS * 86_400_000);
  // mppx refuses an expiry that is not a whole number of seconds
  const horizon = new Date(Math.floor(end.getTime() / 1000) * 1000);
  return {
    ok: true,
    terms: {
      quote_id,
      merchant_id: q.merchant_id,
      plan,
      amount_usd: plan.amount_usd,
      recipient: currentPayout(q, 'tempo', at),
      key_expires_at: horizon,
    },
  };
}

async function defaultDb(): Promise<ShopDeps['db']> {
  const { defaultShopDeps } = await import('./merchant-lifecycle.service');
  return defaultShopDeps().db;
}

// ---------------------------------------------------------------------------
// 2. Activation record (written by the mppx `activated` hook, before period 1 is PAID)
// ---------------------------------------------------------------------------

export interface MppActivation {
  receipt: { reference: string };
  subscription: {
    subscriptionId: string;
    lookupKey: string;
    recipient: string;
    payer?: { address: string };
    accessKey?: { accessKeyAddress: string };
    subscriptionExpires: string;
  };
}

/** `subscription-core.applySubscriptionPayment` links the row to the shop subscription at PAID. */
export async function recordActivation(
  db: Pick<ShopDeps['db'], '$executeRawUnsafe'>,
  a: MppActivation,
): Promise<void> {
  const quote_id = /^quote:([0-9a-f-]{36})$/.exec(a.subscription.lookupKey)?.[1];
  const payer = a.subscription.payer?.address;
  const key = a.subscription.accessKey?.accessKeyAddress;
  if (!quote_id || !payer || !key) throw new Error('activation record is incomplete');
  await db.$executeRawUnsafe(
    `INSERT INTO shop_subscription_mpp (quote_id, mppx_subscription_id, payer, recipient,
                                        access_key, activation_tx, key_expires_at)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::timestamptz)
     ON CONFLICT (quote_id) DO NOTHING`,
    quote_id,
    a.subscription.subscriptionId,
    payer.toLowerCase(),
    a.subscription.recipient.toLowerCase(),
    key.toLowerCase(),
    a.receipt.reference,
    a.subscription.subscriptionExpires,
  );
}

// ---------------------------------------------------------------------------
// 3. Renewal (shop-subscription-sweep step)
// ---------------------------------------------------------------------------

/** Thrown by a renewer when nothing was sent (safe to try again on the next tick). */
export class MppNotSentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MppNotSentError';
  }
}

export interface MppRenewer {
  /** `null`: mppx declined (not renewable now). Throws on failure. */
  renew(mppxSubscriptionId: string): Promise<{ reference: string } | null>;
  /** testnet sandbox hook */
  rewind?(mppxSubscriptionId: string, ms: number): Promise<boolean>;
}

export const mppxRenewer: MppRenewer = {
  async renew(id) {
    const { getMppSubscriptionRuntime } = await import('../middleware/mpp.middleware');
    const rt = await getMppSubscriptionRuntime();
    if (!rt) throw new MppNotSentError('the MPP subscription runtime is not available');
    return rt.renew(id);
  },
  async rewind(id, ms) {
    const { getMppSubscriptionRuntime } = await import('../middleware/mpp.middleware');
    const rt = await getMppSubscriptionRuntime();
    return rt ? rt.rewindAnchor(id, ms) : false;
  },
};

export interface MppRenewDeps extends ShopDeps {
  renewer?: MppRenewer;
  transfers?: TransferReader;
}

export type RenewFailure = 'unknown' | 'limit_exceeded' | 'key_revoked' | 'renew_failed';

/** mppx throws plain errors; only the message tells what happened. */
export function classifyRenewError(err: unknown): { kind: RenewFailure; tx_hash?: string } {
  const e = err instanceof Error ? err : new Error(String(err));
  const text = `${e.name} ${e.message}`;
  const carried = (e as unknown as { transactionHash?: unknown }).transactionHash;
  const hash = typeof carried === 'string' ? carried : TX_RE.exec(text)?.[0];
  const tx_hash = hash && TX_RE.test(hash) ? hash.toLowerCase() : undefined;
  // The transaction may be (or have been) mined: never submit this period again.
  if (
    e.name === 'PaymentOutcomeUnknownError' ||
    /confirmation timeout|timed out waiting for .*receipt|receipt.*timed out|not credited|receive policy/i.test(
      text,
    )
  ) {
    return { kind: 'unknown', tx_hash };
  }
  if (/limit|exceed|spending|allowance|insufficient|reverted/i.test(text)) {
    return { kind: 'limit_exceeded', tx_hash };
  }
  if (/revoked|not authorized|unauthorized|expired|key.*missing/i.test(text)) {
    return { kind: 'key_revoked', tx_hash };
  }
  return { kind: 'renew_failed', tx_hash };
}

export interface MppRenewReport {
  due: number;
  renewed: number;
  failed: number;
  unknown: number;
  skipped: number;
}

interface DueRow extends SubscriptionRow {
  mppx_subscription_id: string;
  payer: string;
  recipient: string;
  key_expires_at: Date;
}

/** `mpp_subscription` -> `none` and ONE `pull_failed` event; the period stays due (INT-41 past_due). */
async function pullFailed(
  d: ShopDeps,
  sub: Pick<SubscriptionRow, 'subscription_id' | 'merchant_id' | 'sku'>,
  period_no: number,
  reason: string,
): Promise<void> {
  await d.transaction(async (tx) => {
    const n = await tx.$executeRawUnsafe(
      `UPDATE shop_subscriptions SET pull_mode = 'none'
        WHERE subscription_id = $1::uuid AND pull_mode = 'mpp_subscription'`,
      sub.subscription_id,
    );
    if (n === 0) return;
    await emitSubscriptionEvent(tx, 'pull_failed', {
      subscription_id: sub.subscription_id,
      merchant_id: sub.merchant_id,
      sku: sub.sku,
      period_no,
      reason,
    });
  });
}

async function setRenewal(
  d: ShopDeps,
  subscription_id: string,
  period_no: number,
  status: 'unknown' | 'confirmed' | 'failed',
  extra: { tx_hash?: string; reason?: string } = {},
): Promise<void> {
  await d.db.$executeRawUnsafe(
    `UPDATE shop_subscription_mpp_renewals
        SET status = $3, tx_hash = COALESCE($4, tx_hash), reason = COALESCE($5, reason),
            updated_at = now()
      WHERE subscription_id = $1::uuid AND period_no = $2::int`,
    subscription_id,
    period_no,
    status,
    extra.tx_hash ?? null,
    extra.reason ?? null,
  );
}

/** The same outbox row the MPP middleware writes for an unknown settlement (operator digest). */
async function alertUnknown(
  d: ShopDeps,
  sub: Pick<SubscriptionRow, 'subscription_id'>,
  period_no: number,
  amount_usd: number,
  tx_hash?: string,
): Promise<void> {
  await d.db.$executeRawUnsafe(
    `INSERT INTO outbox (event_type, payload) VALUES ('mpp_settle_unknown', $1::jsonb)`,
    JSON.stringify({
      request_id: `sub-renew:${sub.subscription_id}:${period_no}`,
      url: `subscription:${sub.subscription_id}`,
      amount: String(amount_usd),
      ...(tx_hash ? { tx_hash } : {}),
    }),
  );
}

/**
 * The period's order (INT-41), as INT-49 does it: renewal quote -> a confirmed Tempo payment row
 * -> PAYING -> `finalizeConfirmed` (PAID, delivery, `subscription.renewed`). Idempotent: a period
 * that is already paid is refused by `periodRefusal` and counts as done.
 */
async function recordPeriod(
  d: ShopDeps,
  sub: SubscriptionRow,
  payer: string,
  recipient: string,
  period_no: number,
  tx_hash: string,
): Promise<boolean> {
  const nowMs = (d.now ?? Date.now)();
  const legs = tempoLegs(sub.plan.amount_usd);
  const buyer: Buyer = { identity: sub.buyer_agent_id ?? walletIdentity(payer) };
  const quote = await renewalQuote(d, sub, buyer, period_no, nowMs);
  const order = await d.transaction(async (tx) => {
    const refusal = await periodRefusal(tx, quote.quote_id);
    if (refusal) return { done: true as const };
    const o = await tx.$queryRawUnsafe<Array<{ order_id: string; state: string }>>(
      `SELECT order_id, state FROM shop_orders WHERE quote_id = $1::uuid FOR UPDATE`,
      quote.quote_id,
    );
    if (!o[0] || (o[0].state !== 'QUOTED' && o[0].state !== 'PAYMENT_FAILED')) {
      return { done: true as const };
    }
    const feeUsd = Number(legs.fee) / 1e6;
    const pay = await tx.$queryRawUnsafe<Array<{ payment_id: string }>>(
      `INSERT INTO shop_payments (order_id, rail, nonce_or_challenge_id, payer, pay_to, amount_usd,
                                  splits, tx_hash, chain_status, confirmed_at)
       VALUES ($1::uuid, 'tempo', $2, $3, $4, $5::numeric, $6::jsonb, $7, 'confirmed', now())
       RETURNING payment_id`,
      o[0].order_id,
      tx_hash,
      payer,
      recipient,
      quote.total_usd,
      // the subscription intent has no splits: the fee leg is owed by the merchant
      JSON.stringify(
        legs.fee_to
          ? [
              {
                wallet: legs.fee_to,
                amount_usd: feeUsd,
                fee_to: legs.fee_to,
                fee: feeUsd,
                mode: 'receivable',
                tx_hashes: [tx_hash],
              },
            ]
          : [],
      ),
      tx_hash,
    );
    await transition(tx, o[0].order_id, 'PAYING', {
      actor: 'system',
      reason: 'mpp_subscription_renewal',
      payload: { payer_wallet: payer, rail: 'tempo', tx_hashes: [tx_hash] },
    });
    await tx.$executeRawUnsafe(
      `UPDATE shop_orders SET payer_wallet = $2, rail = 'tempo' WHERE order_id = $1::uuid`,
      o[0].order_id,
      payer,
    );
    return { done: false as const, order_id: o[0].order_id, payment_id: pay[0].payment_id };
  });
  if (order.done) return true;
  // loaded on demand: the settle stage pulls the x402 server, which tool listing must not need
  const { finalizeConfirmed } = await import('../pipeline/stages/shop-settle');
  const done = await finalizeConfirmed(d, {
    order_id: order.order_id,
    payment_id: order.payment_id,
    tx_hash,
    payer,
    rail: 'tempo',
    request_id: `sub-renew:${sub.subscription_id}:${period_no}`,
  });
  return Boolean(done);
}

async function dueRows(d: ShopDeps, nowMs: number): Promise<DueRow[]> {
  return d.db.$queryRawUnsafe<DueRow[]>(
    `SELECT ${SUBSCRIPTION_COLS.split(',')
      .map((c) => `s.${c.trim()}`)
      .join(', ')}, m.mppx_subscription_id, m.payer, m.recipient, m.key_expires_at
       FROM shop_subscriptions s
       JOIN shop_subscription_mpp m ON m.subscription_id = s.subscription_id
      WHERE s.pull_mode = 'mpp_subscription' AND s.status IN ('active', 'past_due')
        AND s.next_charge_at <= $1::timestamptz
      ORDER BY s.next_charge_at LIMIT ${RENEW_BATCH}`,
    new Date(nowMs).toISOString(),
  );
}

/**
 * Unknown / stale attempts are resolved against the chain and NEVER submitted again:
 * a reported transaction that shows the transfer completes the period; a reverted or never-mined
 * one frees the period for the usual past_due path; no hash at all is given up after 2 h with an
 * operator alert.
 */
async function reconcile(d: MppRenewDeps, nowMs: number, report: MppRenewReport): Promise<void> {
  const rows = await d.db.$queryRawUnsafe<
    Array<{
      subscription_id: string;
      period_no: number;
      status: string;
      tx_hash: string | null;
      age_ms: number;
    }>
  >(
    `SELECT subscription_id, period_no, status, tx_hash,
            (extract(epoch FROM ($1::timestamptz - updated_at)) * 1000)::float8 AS age_ms
       FROM shop_subscription_mpp_renewals
      WHERE (status IN ('submitted', 'unknown')
             OR (status = 'confirmed' AND NOT EXISTS (
                   SELECT 1 FROM shop_subscription_periods p
                    WHERE p.subscription_id = shop_subscription_mpp_renewals.subscription_id
                      AND p.period_no = shop_subscription_mpp_renewals.period_no
                      AND p.status = 'paid')))
      ORDER BY updated_at LIMIT ${RENEW_BATCH}`,
    new Date(nowMs).toISOString(),
  );
  for (const r of rows) {
    try {
      await reconcileRow(d, r, report);
    } catch (err) {
      // one poisoned row must not stop the others (nor the renewals of this tick)
      logger.error(
        {
          subscription_id: r.subscription_id,
          period_no: r.period_no,
          err: err instanceof Error ? err.message : String(err),
        },
        'mpp subscription: reconcile failed for one renewal',
      );
    }
  }
}

interface RenewalRow {
  subscription_id: string;
  period_no: number;
  status: string;
  tx_hash: string | null;
  age_ms: number;
}

async function reconcileRow(d: MppRenewDeps, r: RenewalRow, report: MppRenewReport): Promise<void> {
  const subs = await d.db.$queryRawUnsafe<DueRow[]>(
    `SELECT ${SUBSCRIPTION_COLS.split(',')
      .map((c) => `s.${c.trim()}`)
      .join(', ')}, m.mppx_subscription_id, m.payer, m.recipient, m.key_expires_at
         FROM shop_subscriptions s JOIN shop_subscription_mpp m ON m.subscription_id = s.subscription_id
        WHERE s.subscription_id = $1::uuid`,
    r.subscription_id,
  );
  const sub = subs[0];
  if (!sub) return;
  const amountUsd = sub.plan.amount_usd;
  if (r.status === 'confirmed') {
    // paid on chain but the period was not recorded (crash / DB error): record it now
    const last = await latestPeriod(d.db, sub.subscription_id);
    if (r.tx_hash && (last?.period_no ?? 0) < r.period_no) {
      if (await recordPeriod(d, sub, sub.payer, sub.recipient, r.period_no, r.tx_hash)) {
        report.renewed++;
      }
    }
    return;
  }
  if (r.status === 'submitted') {
    if (r.age_ms < SUBMITTED_STALE_MS) return;
    await setRenewal(d, r.subscription_id, r.period_no, 'unknown', { reason: 'no_report' });
    r.status = 'unknown';
    report.unknown++;
  }
  if (r.tx_hash) {
    let proof;
    try {
      proof = await (d.transfers ?? viemTransferReader).read(r.tx_hash);
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'mpp subscription: renewal proof could not be read',
      );
      return;
    }
    if (proof.found && proof.success) {
      const micro = BigInt(toMicroUsdc(amountUsd));
      const ok = proof.transfers.some(
        (t) => same(t.from, sub.payer) && same(t.to, sub.recipient) && t.value === micro,
      );
      if (!ok) {
        await setRenewal(d, r.subscription_id, r.period_no, 'failed', {
          reason: 'transfer_not_proven',
        });
        await alertUnknown(d, sub, r.period_no, amountUsd, r.tx_hash);
        await pullFailed(d, sub, r.period_no, 'renew_failed');
        return;
      }
      await setRenewal(d, r.subscription_id, r.period_no, 'confirmed');
      if (await recordPeriod(d, sub, sub.payer, sub.recipient, r.period_no, r.tx_hash)) {
        report.renewed++;
      }
    } else if (proof.found) {
      await setRenewal(d, r.subscription_id, r.period_no, 'failed', { reason: 'tx_reverted' });
      await pullFailed(d, sub, r.period_no, 'renew_failed');
      report.failed++;
    } else if (r.age_ms >= TX_NOT_FOUND_MS) {
      await setRenewal(d, r.subscription_id, r.period_no, 'failed', { reason: 'tx_not_found' });
      await pullFailed(d, sub, r.period_no, 'renew_failed');
      report.failed++;
    }
  } else if (r.age_ms >= UNKNOWN_GIVE_UP_MS) {
    await setRenewal(d, r.subscription_id, r.period_no, 'failed', {
      reason: 'outcome_unresolved',
    });
    await alertUnknown(d, sub, r.period_no, amountUsd);
    await pullFailed(d, sub, r.period_no, 'renew_failed');
    report.failed++;
  }
}

/**
 * Sandbox hook (testnet only): `SHOP_SUB_FORCE_DUE_ID=<subscription_id>` makes the next period of
 * that subscription due now — the mppx billing anchor and the stored period move back by one
 * period. Run the sweep once, then unset the variable.
 */
export async function forceDue(
  d: MppRenewDeps,
  subscription_id: string,
  nowMs: number,
): Promise<boolean> {
  if (getMppConfig().testnet !== true) return false;
  const rows = await d.db.$queryRawUnsafe<DueRowLite[]>(
    `SELECT s.subscription_id, s.plan, m.mppx_subscription_id
       FROM shop_subscriptions s JOIN shop_subscription_mpp m ON m.subscription_id = s.subscription_id
      WHERE s.subscription_id = $1::uuid AND s.pull_mode = 'mpp_subscription'`,
    subscription_id,
  );
  const r = rows[0];
  if (!r) return false;
  const now = new Date(nowMs);
  const backMs = now.getTime() - addPeriod(now, r.plan.period_unit, -r.plan.period_count).getTime();
  if (!(await (d.renewer ?? mppxRenewer).rewind?.(r.mppx_subscription_id, backMs))) return false;
  const shift = `-${Math.round(backMs / 1000)} seconds`;
  await d.db.$executeRawUnsafe(
    `UPDATE shop_subscriptions SET next_charge_at = next_charge_at + $2::interval
      WHERE subscription_id = $1::uuid`,
    subscription_id,
    shift,
  );
  await d.db.$executeRawUnsafe(
    `UPDATE shop_subscription_periods SET period_start = period_start + $2::interval,
            period_end = period_end + $2::interval
      WHERE subscription_id = $1::uuid AND status = 'paid' AND period_no = (
        SELECT max(period_no) FROM shop_subscription_periods
         WHERE subscription_id = $1::uuid AND status = 'paid')`,
    subscription_id,
    shift,
  );
  return true;
}

interface DueRowLite {
  subscription_id: string;
  plan: SubscriptionPlan;
  mppx_subscription_id: string;
}

/**
 * `shop-subscription-sweep` step: renews every due `mpp_subscription` period exactly once.
 * The (subscription_id, period_no) primary key of `shop_subscription_mpp_renewals` is the guard.
 */
export async function runMppRenewals(
  d: MppRenewDeps,
  nowMs: number = Date.now(),
): Promise<MppRenewReport> {
  const report: MppRenewReport = { due: 0, renewed: 0, failed: 0, unknown: 0, skipped: 0 };
  const renewer = d.renewer ?? mppxRenewer;
  await reconcile(d, nowMs, report);
  const rows = await dueRows(d, nowMs);
  report.due = rows.length;
  for (const sub of rows) {
    const last = await latestPeriod(d.db, sub.subscription_id);
    if (!last) continue;
    const period_no = last.period_no + 1;
    if (reachedEnd(sub, last.period_no, new Date(last.period_end))) {
      report.skipped++;
      continue; // the term is over: the sweep's advance step expires it
    }
    // the merchant moved its payout wallet: mppx would still pay the old one
    const m = (
      await d.db.$queryRawUnsafe<
        Array<{
          payout_wallet_base: string;
          payout_wallet_tempo: string;
          payout_pending: { rail: 'base' | 'tempo'; wallet: string; effective_at: string } | null;
        }>
      >(
        `SELECT payout_wallet_base, payout_wallet_tempo, payout_pending FROM shop_merchants
          WHERE merchant_id = $1::uuid`,
        sub.merchant_id,
      )
    )[0];
    if (!m || !same(currentPayout(m, 'tempo', nowMs), sub.recipient)) {
      await pullFailed(d, sub, period_no, 'payout_wallet_changed');
      report.failed++;
      continue;
    }
    if (new Date(sub.key_expires_at).getTime() <= nowMs) {
      await pullFailed(d, sub, period_no, 'key_expired');
      report.failed++;
      continue;
    }
    // One attempt per period, ever: a second worker, a retry or a crash loses this insert.
    const won = await d.db.$executeRawUnsafe(
      `INSERT INTO shop_subscription_mpp_renewals (subscription_id, period_no)
       VALUES ($1::uuid, $2::int) ON CONFLICT DO NOTHING`,
      sub.subscription_id,
      period_no,
    );
    if (won === 0) {
      report.skipped++;
      continue;
    }
    let out: { reference: string } | null;
    try {
      out = await renewer.renew(sub.mppx_subscription_id);
    } catch (err) {
      if (err instanceof MppNotSentError) {
        // nothing left the building: free the period for the next tick
        await d.db.$executeRawUnsafe(
          `DELETE FROM shop_subscription_mpp_renewals WHERE subscription_id = $1::uuid AND period_no = $2::int`,
          sub.subscription_id,
          period_no,
        );
        report.skipped++;
        continue;
      }
      const c = classifyRenewError(err);
      logger.warn(
        {
          subscription_id: sub.subscription_id,
          period_no,
          kind: c.kind,
          err: String((err as Error)?.message).slice(0, 200),
        },
        'mpp subscription: renewal did not complete',
      );
      if (c.kind === 'unknown') {
        await setRenewal(d, sub.subscription_id, period_no, 'unknown', {
          tx_hash: c.tx_hash,
          reason: 'outcome_unknown',
        });
        await alertUnknown(d, sub, period_no, sub.plan.amount_usd, c.tx_hash);
        report.unknown++;
      } else {
        await setRenewal(d, sub.subscription_id, period_no, 'failed', {
          tx_hash: c.tx_hash,
          reason: c.kind,
        });
        await pullFailed(d, sub, period_no, c.kind);
        report.failed++;
      }
      continue;
    }
    if (!out || !/^0x[0-9a-fA-F]{64}$/.test(out.reference)) {
      await setRenewal(d, sub.subscription_id, period_no, 'failed', { reason: 'mppx_declined' });
      await pullFailed(d, sub, period_no, 'renew_failed');
      report.failed++;
      continue;
    }
    const tx_hash = out.reference.toLowerCase();
    await setRenewal(d, sub.subscription_id, period_no, 'confirmed', { tx_hash });
    try {
      if (await recordPeriod(d, sub, sub.payer, sub.recipient, period_no, tx_hash)) {
        report.renewed++;
      }
    } catch (err) {
      // paid on chain; the 'confirmed' row makes the next tick record it (never renew again)
      logger.error(
        {
          subscription_id: sub.subscription_id,
          period_no,
          err: err instanceof Error ? err.message : String(err),
        },
        'mpp subscription: renewed on chain but the period could not be recorded yet',
      );
    }
  }
  return report;
}
