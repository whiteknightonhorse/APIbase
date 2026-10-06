import { verifyTypedData } from 'viem';
import { config } from '../config/index';
import { getX402Config, toMicroUsdc } from '../config/x402.config';
import { encryptSecret } from '../services/secret-crypto.service';
import { currentPayout } from './auth/identity.service';
import type { ShopDeps } from './merchant-lifecycle.service';
import { QuoteError } from './quote.errors';
import { computeFeeCents, integratorConfig, type Buyer } from './quote.service';
import {
  addPeriod,
  latestPeriod,
  preauthorizedPeriods,
  SUBSCRIPTION_COLS,
  type PreauthorizedPeriod,
  type SubscriptionRow,
} from './subscription-core';
import { assertPayer, loadRow } from './subscription.service';

const DOCS = '/docs/integrator#base-pull-subscriptions';
const HOUR_S = 3600;
/** One call stores 1..12 periods (a year of a monthly plan). */
export const PREAUTH_MAX_PERIODS = 12;
/** `validBefore` lies 1 h .. 72 h after the start of the period it pays. */
export const PREAUTH_MIN_VALID_S = HOUR_S;
export const PREAUTH_MAX_VALID_S = 72 * HOUR_S;

const invalid = (message: string, extra?: Record<string, unknown>) =>
  new QuoteError(422, 'validation_failed', message, 'fix_request', {
    documentation_url: DOCS,
    ...extra,
  });
const conflict = (code: string, message: string) =>
  new QuoteError(409, code, message, 'fix_request', { documentation_url: DOCS });

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const NONCE_RE = /^0x[0-9a-fA-F]{64}$/;
const SIG_RE = /^0x[0-9a-fA-F]{130}$/;
const UINT_RE = /^\d{1,20}$/;

const TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

interface Leg {
  from: string;
  to: string;
  value: string;
  validAfter: number;
  validBefore: number;
  nonce: string;
  signature: string;
}

/** One leg as the caller sent it (`{authorization, signature}`), shape-checked and normalized. */
function parseLeg(raw: unknown, label: string): Leg {
  const o = (raw ?? {}) as { authorization?: Record<string, unknown>; signature?: unknown };
  const a = o.authorization;
  if (!a || typeof a !== 'object') throw invalid(`${label}.authorization is required`);
  const str = (k: string, re: RegExp) => {
    const v = a[k];
    if (typeof v !== 'string' || !re.test(v))
      throw invalid(`${label}.authorization.${k} is invalid`);
    return v;
  };
  const secs = (k: string) => {
    const v = a[k];
    const n =
      typeof v === 'number' ? v : typeof v === 'string' && UINT_RE.test(v) ? Number(v) : NaN;
    if (!Number.isSafeInteger(n) || n < 0) throw invalid(`${label}.authorization.${k} is invalid`);
    return n;
  };
  if (typeof o.signature !== 'string' || !SIG_RE.test(o.signature)) {
    throw invalid(`${label}.signature must be a 65-byte hex signature`);
  }
  return {
    from: str('from', ADDR_RE).toLowerCase(),
    to: str('to', ADDR_RE).toLowerCase(),
    value: str('value', UINT_RE),
    validAfter: secs('validAfter'),
    validBefore: secs('validBefore'),
    nonce: str('nonce', NONCE_RE).toLowerCase(),
    signature: o.signature.toLowerCase(),
  };
}

/** Signature check by `verifyTypedData` against the USDC domain; independent of the clock (the SDK verify refuses `validAfter > now`). */
async function signedBy(l: Leg): Promise<boolean> {
  const x = getX402Config();
  try {
    return await verifyTypedData({
      address: l.from as `0x${string}`,
      domain: {
        name: 'USD Coin',
        version: '2',
        chainId: Number(x.network.split(':')[1]),
        verifyingContract: x.usdcAddress as `0x${string}`,
      },
      types: TYPES,
      primaryType: 'TransferWithAuthorization',
      message: {
        from: l.from as `0x${string}`,
        to: l.to as `0x${string}`,
        value: BigInt(l.value),
        validAfter: BigInt(l.validAfter),
        validBefore: BigInt(l.validBefore),
        nonce: l.nonce as `0x${string}`,
      },
      signature: l.signature as `0x${string}`,
    });
  } catch {
    return false;
  }
}

/** What one period's authorization(s) must be, from server data only (§8.2). */
export function expectedLegs(planAmountUsd: number): {
  total: string;
  merchant: string;
  fee: string | null;
  fee_to: string | null;
} {
  const cfg = integratorConfig();
  const totalCents = Math.round(planAmountUsd * 100);
  const feeCents = computeFeeCents(totalCents, false, cfg);
  const feeTo = process.env['INTEGRATOR_FEE_WALLET_BASE'];
  const total = toMicroUsdc(planAmountUsd);
  const split =
    cfg.fee_enabled &&
    feeCents > 0 &&
    feeCents < totalCents &&
    Boolean(feeTo) &&
    getX402Config().facilitatorMode === 'local';
  if (!split) return { total, merchant: total, fee: null, fee_to: null };
  const fee = toMicroUsdc(feeCents / 100);
  return {
    total,
    merchant: String(BigInt(total) - BigInt(fee)),
    fee,
    fee_to: String(feeTo).toLowerCase(),
  };
}

export interface PreauthView {
  subscription_id: string;
  pull_mode: 'base_preauth';
  preauthorized_periods: PreauthorizedPeriod[];
}

/**
 * §6.1 shop.subscription.preauthorize / `POST /subscriptions/:id/preauthorize` (UC-9 on Base: the
 * payer signs N EIP-3009 authorizations ahead of time, each for ONE future period, one fixed
 * recipient, one fixed amount, a fixed validity). The whole batch is checked first and stored in
 * one transaction: one bad authorization stores nothing. Signatures are kept only as
 * `secret-crypto` ciphertext and are never logged or returned.
 */
export async function preauthorizeSubscription(
  d: ShopDeps,
  buyer: Buyer,
  subscription_id: unknown,
  input: { authorizations?: unknown },
  opts: { merchant_id?: string } = {},
): Promise<PreauthView> {
  const row = await loadRow(d.db, subscription_id);
  if (opts.merchant_id && row.merchant_id !== opts.merchant_id) {
    throw new QuoteError(404, 'not_found', 'subscription not found', 'use_different_tool', {
      documentation_url: DOCS,
    });
  }
  await assertPayer(d.db, row, buyer.identity);

  const list = input.authorizations;
  if (!Array.isArray(list) || list.length < 1 || list.length > PREAUTH_MAX_PERIODS) {
    throw invalid(`authorizations must hold 1..${PREAUTH_MAX_PERIODS} items`);
  }
  const parsed = list.map((raw, i) => {
    const o = (raw ?? {}) as { period_no?: unknown; fee_authorization?: unknown };
    if (!Number.isInteger(o.period_no) || (o.period_no as number) < 2) {
      throw invalid(`authorizations[${i}].period_no must be an integer >= 2`);
    }
    return {
      period_no: o.period_no as number,
      merchant: parseLeg(raw, `authorizations[${i}]`),
      fee:
        o.fee_authorization == null
          ? null
          : parseLeg(o.fee_authorization, `authorizations[${i}].fee_authorization`),
    };
  });
  if (new Set(parsed.map((p) => p.period_no)).size !== parsed.length) {
    throw invalid('period_no must be unique within one call');
  }

  return d.transaction(async (tx) => {
    const subs = await tx.$queryRawUnsafe<SubscriptionRow[]>(
      `SELECT ${SUBSCRIPTION_COLS} FROM shop_subscriptions WHERE subscription_id = $1::uuid FOR UPDATE`,
      row.subscription_id,
    );
    const sub = subs[0];
    if (!sub) throw invalid('subscription not found');
    if (sub.status !== 'active' && sub.status !== 'past_due') {
      throw conflict('subscription_not_renewable', `the subscription is ${sub.status}`);
    }
    if (sub.rail_pref !== 'base') {
      throw invalid('pre-authorization is available for subscriptions paid on Base only');
    }
    const last = await latestPeriod(tx, sub.subscription_id);
    if (!last) throw conflict('subscription_not_renewable', 'the subscription has no paid period');
    const payer = await tx.$queryRawUnsafe<Array<{ payer_wallet: string | null }>>(
      `SELECT payer_wallet FROM shop_orders WHERE order_id = $1::uuid`,
      last.order_id,
    );
    const payerWallet = payer[0]?.payer_wallet?.toLowerCase();
    if (!payerWallet)
      throw conflict('payer_unknown', 'the paying wallet of this subscription is unknown');
    const m = await tx.$queryRawUnsafe<
      Array<{
        payout_wallet_base: string;
        payout_wallet_tempo: string;
        payout_pending: { rail: 'base' | 'tempo'; wallet: string; effective_at: string } | null;
      }>
    >(
      `SELECT payout_wallet_base, payout_wallet_tempo, payout_pending FROM shop_merchants
        WHERE merchant_id = $1::uuid`,
      sub.merchant_id,
    );
    if (!m[0]) throw invalid('merchant not found');

    // period_start(n): periods are contiguous, so n starts where n-1 ends (same chain as the payment hook).
    const starts = new Map<number, Date>();
    let cursor = new Date(last.period_end);
    for (let n = last.period_no + 1; n <= last.period_no + 400; n++) {
      starts.set(n, cursor);
      cursor = addPeriod(cursor, sub.plan.period_unit, sub.plan.period_count);
    }
    const want = expectedLegs(sub.plan.amount_usd);
    const feeWallet = process.env['INTEGRATOR_FEE_WALLET_BASE']?.toLowerCase();

    const rows: Array<{ leg: 'merchant' | 'fee'; period_no: number; l: Leg }> = [];
    for (const p of parsed) {
      const label = `period ${p.period_no}`;
      const start = starts.get(p.period_no);
      if (p.period_no <= last.period_no || !start) {
        throw invalid(
          `${label} is not a future period (the last paid period is ${last.period_no})`,
        );
      }
      if (sub.max_periods != null && p.period_no > sub.max_periods) {
        throw invalid(`${label} is beyond max_periods (${sub.max_periods})`);
      }
      if (sub.expires_at && start.getTime() >= new Date(sub.expires_at).getTime()) {
        throw invalid(`${label} starts after the end of the subscription term`);
      }
      const startS = Math.floor(start.getTime() / 1000);
      const payTo = currentPayout(m[0], 'base', start.getTime()).toLowerCase();
      const legs: Array<{ leg: 'merchant' | 'fee'; l: Leg; to: string; value: string }> = [
        { leg: 'merchant', l: p.merchant, to: payTo, value: want.fee ? want.merchant : want.total },
      ];
      if (p.fee) {
        if (!want.fee || !feeWallet) {
          throw invalid(`${label}: this subscription has no fee leg; remove fee_authorization`);
        }
        legs.push({ leg: 'fee', l: p.fee, to: feeWallet, value: want.fee });
      } else if (want.fee) {
        // Fee on, no fee leg: one authorization for the whole total; the fee stays a receivable (A3-2).
        legs[0].value = want.total;
      }
      for (const x of legs) {
        const who = x.leg === 'fee' ? `${label} fee leg` : label;
        if (x.l.from !== payerWallet)
          throw invalid(`${who}: from must be the paying wallet of the subscription`);
        if (x.l.to !== x.to) throw invalid(`${who}: to must be ${x.to}`);
        if (x.l.value !== x.value)
          throw invalid(`${who}: value must be exactly ${x.value} micro-USDC`);
        if (x.l.validAfter !== startS)
          throw invalid(`${who}: validAfter must be the period start (${startS})`);
        if (
          x.l.validBefore < startS + PREAUTH_MIN_VALID_S ||
          x.l.validBefore > startS + PREAUTH_MAX_VALID_S
        ) {
          throw invalid(`${who}: validBefore must be 1 h to 72 h after the period start`);
        }
        if (!(await signedBy(x.l))) throw invalid(`${who}: the signature does not match from`);
        rows.push({ leg: x.leg, period_no: p.period_no, l: x.l });
      }
      if (p.fee && p.fee.nonce === p.merchant.nonce)
        throw invalid(`${label}: the two nonces must differ`);
      if (p.fee && p.fee.validBefore !== p.merchant.validBefore) {
        throw invalid(`${label}: both legs need the same validBefore`);
      }
    }
    if (new Set(rows.map((r) => r.l.nonce)).size !== rows.length)
      throw invalid('nonces must be unique');

    const taken = await tx.$queryRawUnsafe<Array<{ nonce: string }>>(
      `SELECT nonce FROM shop_subscription_authorizations WHERE nonce = ANY($1::text[])`,
      rows.map((r) => r.l.nonce),
    );
    if (taken.length > 0)
      throw conflict('nonce_already_used', 'a nonce was already stored; sign a fresh one');
    const live = await tx.$queryRawUnsafe<Array<{ period_no: number }>>(
      `SELECT DISTINCT period_no FROM shop_subscription_authorizations
        WHERE subscription_id = $1::uuid AND period_no = ANY($2::int[]) AND status IN ('pending', 'submitted', 'settled')`,
      sub.subscription_id,
      parsed.map((p) => p.period_no),
    );
    if (live.length > 0) {
      throw conflict(
        'period_already_preauthorized',
        `period ${live.map((r) => r.period_no).join(', ')} already has a stored authorization; cancel the subscription or let it expire first`,
      );
    }

    for (const r of rows) {
      await tx.$executeRawUnsafe(
        `INSERT INTO shop_subscription_authorizations (subscription_id, period_no, leg, from_address,
            to_address, value_micro, valid_after, valid_before, nonce, signature_enc, status)
         VALUES ($1::uuid, $2::int, $3, $4, $5, $6::bigint, $7::timestamptz, $8::timestamptz, $9, $10::bytea, 'pending')`,
        sub.subscription_id,
        r.period_no,
        r.leg,
        r.l.from,
        r.l.to,
        r.l.value,
        new Date(r.l.validAfter * 1000).toISOString(),
        new Date(r.l.validBefore * 1000).toISOString(),
        r.l.nonce,
        Buffer.from(encryptSecret(r.l.signature, config.ENCRYPTION_KEY), 'utf8'),
      );
    }
    await tx.$executeRawUnsafe(
      `UPDATE shop_subscriptions SET pull_mode = 'base_preauth' WHERE subscription_id = $1::uuid`,
      sub.subscription_id,
    );
    return {
      subscription_id: sub.subscription_id,
      pull_mode: 'base_preauth' as const,
      preauthorized_periods: await preauthorizedPeriods(tx, sub.subscription_id),
    };
  });
}
