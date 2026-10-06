import { createHash } from 'node:crypto';
import { logger } from '../config/logger';
import { getX402Config } from '../config/x402.config';
import { config } from '../config';
import { ensureRedisConnected } from '../services/redis.service';
import { decryptSecret } from '../services/secret-crypto.service';
import type { ChainReader } from '../jobs/shop-payment-reconcile.job';
import type { ShopDeps } from './merchant-lifecycle.service';
import { payQuote } from './pay.service';
import { integratorConfig } from './quote.service';
import {
  addPeriod,
  emitSubscriptionEvent,
  latestPeriod,
  SUBSCRIPTION_COLS,
  type SubscriptionRow,
} from './subscription-core';
import { renewalQuote } from './subscription.service';

/** A stored authorization is only executed while at least this long remains before `validBefore`. */
export const PULL_SAFETY_MARGIN_MS = 10 * 60_000;
const CLAIM_TTL_S = 600;
const BATCH = 200;

interface AuthRow {
  authorization_id: string;
  subscription_id: string;
  period_no: number;
  leg: 'merchant' | 'fee';
  from_address: string;
  to_address: string;
  value_micro: string;
  valid_after: Date;
  valid_before: Date;
  nonce: string;
  signature_enc: Buffer;
}

export interface PullReport {
  checked: number;
  paid: number;
  submitted: number;
  retry: number;
  canceled: number;
  failed: number;
}

const authCols = (a = '') =>
  [
    'authorization_id',
    'subscription_id',
    'period_no',
    'leg',
    'from_address',
    'to_address',
    'value_micro::text AS value_micro',
    'valid_after',
    'valid_before',
    'nonce',
    'signature_enc',
  ]
    .map((c) => `${a}${c}`)
    .join(', ');
const AUTH_COLS = authCols();

const unixS = (d: Date) => String(Math.floor(new Date(d).getTime() / 1000));
const walletIdentity = (w: string) =>
  `wallet:${createHash('sha256').update(w.toLowerCase()).digest('hex')}`;

/** Sets the status of the legs of ONE stored period (merchant + fee leg share period and validBefore). */
async function setLegs(
  d: ShopDeps,
  a: Pick<AuthRow, 'subscription_id' | 'period_no' | 'valid_before'>,
  to: string,
  from: string[],
): Promise<number> {
  return d.db.$executeRawUnsafe(
    `UPDATE shop_subscription_authorizations SET status = $4
      WHERE subscription_id = $1::uuid AND period_no = $2::int AND valid_before = $3::timestamptz
        AND status = ANY($5::text[])`,
    a.subscription_id,
    a.period_no,
    new Date(a.valid_before).toISOString(),
    to,
    from,
  );
}

const claimKey = (a: Pick<AuthRow, 'subscription_id' | 'period_no'>) =>
  `subscription-pull:${a.subscription_id}:${a.period_no}`;

/** A failed settle burned the replay-guard claim and the unique payment key of this nonce: free both for the retry. */
async function releaseForRetry(nonces: string[]): Promise<void> {
  await Promise.all(
    nonces.map((n) => ensureRedisConnected().then((r) => r.del(`payment-nonce:x402:${n}`))),
  );
}

/**
 * Executes the stored authorizations of one tick (T-INT-47). Never throws for a single row.
 *   1. `submitted` rows follow their payment (confirmed -> settled; failed -> pending again).
 *   2. `pending` rows inside [valid_after, valid_before - 10 min) of a due period: the chain says
 *      whether the authorization was already used or canceled (-> canceled / submitted); else a
 *      period quote is created server-side and paid through the SAME ESCROW -> settle path as
 *      `shop.order.pay` (the stored authorizations are the X-Payment payload).
 *   3. `pending` rows that ran out of time become `failed`: one `subscription.pull_failed` event
 *      per period and the period is marked `past_due` (the agent renews it explicitly).
 * A settle that was refused leaves the row `pending` (the migration has no `failed_retry` status):
 * it is retried on every tick until `valid_before - 10 min`.
 */
export async function runSubscriptionPull(
  d: ShopDeps,
  nowMs: number = (d.now ?? Date.now)(),
  opts: { chain?: Pick<ChainReader, 'authorizationUsed'> } = {},
): Promise<PullReport> {
  const report: PullReport = {
    checked: 0,
    paid: 0,
    submitted: 0,
    retry: 0,
    canceled: 0,
    failed: 0,
  };
  const nowIso = new Date(nowMs).toISOString();
  const cutoffIso = new Date(nowMs + PULL_SAFETY_MARGIN_MS).toISOString();

  await followSubmitted(d, report);

  const due = await d.db.$queryRawUnsafe<AuthRow[]>(
    `SELECT ${authCols('a.')}
       FROM shop_subscription_authorizations a
       JOIN shop_subscriptions s ON s.subscription_id = a.subscription_id
      WHERE a.leg = 'merchant' AND a.status = 'pending'
        AND s.status IN ('active', 'past_due') AND s.pull_mode = 'base_preauth'
        AND a.valid_after <= $1::timestamptz AND a.valid_before > $2::timestamptz
      ORDER BY a.valid_after, a.period_no LIMIT ${BATCH}`,
    nowIso,
    cutoffIso,
  );
  report.checked = due.length;
  for (const a of due) {
    try {
      await pullOne(d, a, nowMs, report, opts.chain);
    } catch (e) {
      logger.warn(
        {
          job: 'shop-subscription-pull',
          subscriptionId: a.subscription_id,
          period: a.period_no,
          err: (e as Error).message,
        },
        'subscription pull: row skipped, retried next tick',
      );
    }
  }

  await expireStale(d, nowMs, report);
  return report;
}

async function loadSub(d: ShopDeps, id: string): Promise<SubscriptionRow | undefined> {
  const rows = await d.db.$queryRawUnsafe<SubscriptionRow[]>(
    `SELECT ${SUBSCRIPTION_COLS} FROM shop_subscriptions WHERE subscription_id = $1::uuid`,
    id,
  );
  return rows[0];
}

async function pullOne(
  d: ShopDeps,
  a: AuthRow,
  nowMs: number,
  report: PullReport,
  injected?: Pick<ChainReader, 'authorizationUsed'>,
): Promise<void> {
  const sub = await loadSub(d, a.subscription_id);
  if (!sub) return;
  const last = await latestPeriod(d.db, sub.subscription_id);
  if (!last) return;
  if (a.period_no <= last.period_no) {
    // The agent renewed this period itself: the stored authorization must never run.
    report.canceled += await setLegs(d, a, 'canceled', ['pending']);
    return;
  }
  if (a.period_no > last.period_no + 1) return; // the period before it is not paid: wait (or expire)

  const legs = await d.db.$queryRawUnsafe<AuthRow[]>(
    `SELECT ${AUTH_COLS} FROM shop_subscription_authorizations
      WHERE subscription_id = $1::uuid AND period_no = $2::int AND valid_before = $3::timestamptz
        AND status = 'pending' ORDER BY leg`,
    a.subscription_id,
    a.period_no,
    new Date(a.valid_before).toISOString(),
  );
  const merchantLeg = legs.find((l) => l.leg === 'merchant');
  const feeLeg = legs.find((l) => l.leg === 'fee');
  if (!merchantLeg) return;

  // The Redis claim: one executor per period at a time (two workers, a slow tick, a duplicate row).
  const redis = await ensureRedisConnected();
  const claim = await redis.set(claimKey(a), '1', 'EX', CLAIM_TTL_S, 'NX');
  if (claim !== 'OK') return;

  // Reconcile by nonce: used or canceled on-chain (by anyone) -> never executed by us.
  const chain =
    injected ?? (await (await import('../jobs/shop-payment-reconcile.job')).viemChain());
  for (const l of legs) {
    let used: boolean;
    try {
      used = await chain.authorizationUsed(l.from_address, l.nonce);
    } catch (e) {
      logger.warn(
        { job: 'shop-subscription-pull', err: (e as Error).message },
        'authorizationState unreadable: skipped',
      );
      await redis.del(claimKey(a));
      return;
    }
    if (used) {
      const paid = await d.db.$queryRawUnsafe<unknown[]>(
        `SELECT 1 FROM shop_payments WHERE eip3009_nonce = $1 AND chain_status <> 'failed' LIMIT 1`,
        l.nonce,
      );
      // Our own settle that landed (receipt lost) stays `submitted` for reconcile; anyone else's is canceled.
      if (paid.length > 0) report.submitted += await setLegs(d, a, 'submitted', ['pending']);
      else report.canceled += await setLegs(d, a, 'canceled', ['pending']);
      return;
    }
  }

  const buyer = {
    identity: sub.buyer_agent_id ?? walletIdentity(merchantLeg.from_address),
  };
  const quote = await renewalQuote(d, sub, buyer, a.period_no, nowMs);
  const x = quote.pay.x402;
  if (!x) {
    await redis.del(claimKey(a));
    return;
  }
  const secret = (l: AuthRow) =>
    decryptSecret(Buffer.from(l.signature_enc).toString('utf8'), config.ENCRYPTION_KEY);
  const authorization = (l: AuthRow) => ({
    from: l.from_address,
    to: l.to_address,
    value: l.value_micro,
    validAfter: unixS(l.valid_after),
    validBefore: unixS(l.valid_before),
    nonce: l.nonce,
  });
  const cfg = getX402Config();
  const header = Buffer.from(
    JSON.stringify({
      x402Version: 2,
      accepted: {
        scheme: 'exact',
        network: x.network,
        amount: x.amount,
        maxAmountRequired: x.amount,
        asset: x.asset,
        payTo: x.payTo,
        maxTimeoutSeconds: cfg.maxTimeoutSeconds,
        extra: { name: 'USD Coin', version: '2', ...x.extra },
      },
      payload: {
        authorization: authorization(merchantLeg),
        signature: secret(merchantLeg),
        ...(feeLeg
          ? {
              feeAuthorization: { authorization: authorization(feeLeg), signature: secret(feeLeg) },
            }
          : {}),
      },
    }),
  ).toString('base64');

  // DB claim: pending -> submitted is atomic; whoever moves the rows owns this execution.
  const taken = await setLegs(d, a, 'submitted', ['pending']);
  if (taken === 0) return;

  const nonces = legs.map((l) => l.nonce);
  const res = await payQuote(d, {
    quote_id: quote.quote_id,
    x402PaymentHeader: header,
    buyer,
    requestId: `sub-pull:${sub.subscription_id}:${a.period_no}`,
    host: new URL(integratorConfig().public_url).host,
  });

  if (res.status === 200) {
    await setLegs(d, a, 'settled', ['submitted']);
    report.paid++;
    logger.info(
      { job: 'shop-subscription-pull', subscriptionId: sub.subscription_id, period: a.period_no },
      'period pulled',
    );
    return;
  }
  if (res.status === 202) {
    report.submitted++; // no receipt yet: reconcile (INT-09) decides, `followSubmitted` mirrors it
    return;
  }
  const code = String((res.body as { error_code?: unknown }).error_code ?? '');
  if (code === 'subscription_period_paid' || code === 'subscription_not_renewable') {
    report.canceled += await setLegs(d, a, 'canceled', ['submitted']);
    return;
  }
  // Refused or not settled: nothing was delivered. Free the nonces and try again on the next tick.
  await freePayment(d, nonces);
  await setLegs(d, a, 'pending', ['submitted']);
  await releaseForRetry(nonces);
  await redis.del(claimKey(a));
  report.retry++;
  logger.warn(
    {
      job: 'shop-subscription-pull',
      subscriptionId: sub.subscription_id,
      period: a.period_no,
      status: res.status,
      code,
    },
    'period not paid: authorization kept, retried next tick',
  );
}

/**
 * ESCROW keys a payment row by its nonce (UNIQUE); the retry of the same signed authorization needs
 * that key free. Only a payment that FAILED is touched, and it keeps its `eip3009_nonce` (reconcile
 * still looks for it on-chain inside its 24 h window).
 */
async function freePayment(d: ShopDeps, nonces: string[]): Promise<void> {
  await d.db.$executeRawUnsafe(
    `UPDATE shop_payments SET nonce_or_challenge_id = nonce_or_challenge_id || '#retry-' || payment_id::text
      WHERE eip3009_nonce = ANY($1::text[]) AND chain_status = 'failed'
        AND nonce_or_challenge_id = eip3009_nonce`,
    nonces,
  );
}

/** `submitted` rows follow the payment of their nonce (the receipt came late, reconcile confirmed or gave up). */
async function followSubmitted(d: ShopDeps, report: PullReport): Promise<void> {
  const rows = await d.db.$queryRawUnsafe<Array<AuthRow & { chain_status: string | null }>>(
    `SELECT ${authCols('a.')},
            (SELECT p.chain_status FROM shop_payments p WHERE p.eip3009_nonce = a.nonce
              ORDER BY p.created_at DESC LIMIT 1) AS chain_status
       FROM shop_subscription_authorizations a
      WHERE a.leg = 'merchant' AND a.status = 'submitted' LIMIT ${BATCH}`,
  );
  for (const r of rows) {
    if (r.chain_status === 'confirmed') {
      await setLegs(d, r, 'settled', ['submitted']);
      report.paid++;
    } else if (r.chain_status === 'failed') {
      const legs = await d.db.$queryRawUnsafe<Array<{ nonce: string }>>(
        `SELECT nonce FROM shop_subscription_authorizations
          WHERE subscription_id = $1::uuid AND period_no = $2::int AND valid_before = $3::timestamptz`,
        r.subscription_id,
        r.period_no,
        new Date(r.valid_before).toISOString(),
      );
      const nonces = legs.map((l) => l.nonce);
      await freePayment(d, nonces);
      await releaseForRetry(nonces);
      await setLegs(d, r, 'pending', ['submitted']);
      report.retry++;
    }
  }
}

/**
 * `pending` rows whose time is up (no executable moment is left before `validBefore - 10 min`):
 * `failed`, the period `past_due`, ONE `subscription.pull_failed` event per period. The incident
 * SUBSCRIPTION_PULL_FAILED is opened from these rows by the incident engine.
 */
async function expireStale(d: ShopDeps, nowMs: number, report: PullReport): Promise<void> {
  const cutoffIso = new Date(nowMs + PULL_SAFETY_MARGIN_MS).toISOString();
  const stale = await d.db.$queryRawUnsafe<
    Array<{ subscription_id: string; period_no: number; valid_before: Date }>
  >(
    `SELECT DISTINCT a.subscription_id, a.period_no, a.valid_before
       FROM shop_subscription_authorizations a
       JOIN shop_subscriptions s ON s.subscription_id = a.subscription_id
      WHERE a.status = 'pending' AND a.valid_before <= $1::timestamptz
        AND s.status IN ('active', 'past_due')`,
    cutoffIso,
  );
  for (const r of stale) {
    await d.transaction(async (tx) => {
      const moved = await tx.$queryRawUnsafe<Array<{ leg: string; valid_after: Date }>>(
        `UPDATE shop_subscription_authorizations SET status = 'failed'
          WHERE subscription_id = $1::uuid AND period_no = $2::int AND valid_before = $3::timestamptz
            AND status = 'pending' RETURNING leg, valid_after`,
        r.subscription_id,
        r.period_no,
        new Date(r.valid_before).toISOString(),
      );
      const merchant = moved.find((m) => m.leg === 'merchant');
      if (!merchant) return;
      const subs = await tx.$queryRawUnsafe<SubscriptionRow[]>(
        `SELECT ${SUBSCRIPTION_COLS} FROM shop_subscriptions WHERE subscription_id = $1::uuid FOR UPDATE`,
        r.subscription_id,
      );
      const sub = subs[0];
      if (!sub) return;
      const start = new Date(merchant.valid_after);
      await tx.$executeRawUnsafe(
        `INSERT INTO shop_subscription_periods (subscription_id, period_no, period_start, period_end, status)
         VALUES ($1::uuid, $2::int, $3::timestamptz, $4::timestamptz, 'past_due')
         ON CONFLICT (subscription_id, period_no) DO NOTHING`,
        r.subscription_id,
        r.period_no,
        start.toISOString(),
        addPeriod(start, sub.plan.period_unit, sub.plan.period_count).toISOString(),
      );
      await emitSubscriptionEvent(tx, 'pull_failed', {
        subscription_id: r.subscription_id,
        merchant_id: sub.merchant_id,
        sku: sub.sku,
        period_no: r.period_no,
        reason: 'authorization_not_executed',
      });
      report.failed++;
    });
  }
}
