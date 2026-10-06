import { createHash } from 'node:crypto';
import { logger } from '../config/logger';
import { getMppConfig } from '../config/mpp.config';
import { toMicroUsdc } from '../config/x402.config';
import { currentPayout } from './auth/identity.service';
import type { ShopDeps } from './merchant-lifecycle.service';
import { transition } from './order-state';
import { QuoteError } from './quote.errors';
import { computeFeeCents, integratorConfig, type Buyer } from './quote.service';
import {
  emitSubscriptionEvent,
  latestPeriod,
  reachedEnd,
  renewerKeyOf,
  SUBSCRIPTION_COLS,
  type RenewerKey,
  type SubscriptionRow,
} from './subscription-core';
import {
  assertPayer,
  loadRow,
  periodRefusal,
  renewalQuote,
  subscriptionViewById,
  type SubscriptionView,
} from './subscription.service';

/**
 * T-INT-49 (UC-9 on Tempo / F-8 / F-10): the merchant renews with its OWN access key.
 * The merchant generates and keeps the key (`packages/merchant-renewer`); the payer authorizes its
 * ADDRESS on Tempo (`accessKey.authorize`, limit = price x periods, expiry). APIbase holds the
 * schedule, verifies by RPC and does the accounting. It never receives, stores or uses a private
 * key and never sends a transaction.
 */

const DOCS = '/docs/integrator#tempo-keychain-subscriptions';
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const TX_RE = /^0x[0-9a-fA-F]{64}$/;
const QUEUE_LIMIT = 200;

const invalid = (message: string) =>
  new QuoteError(422, 'validation_failed', message, 'fix_request', { documentation_url: DOCS });
const bad = (code: string, message: string, extra: Record<string, unknown> = {}) =>
  new QuoteError(400, code, message, 'fix_request', { documentation_url: DOCS, ...extra });
const conflict = (code: string, message: string) =>
  new QuoteError(409, code, message, 'fix_request', { documentation_url: DOCS });
const notFound = () =>
  new QuoteError(404, 'not_found', 'subscription not found', 'use_different_tool', {
    documentation_url: DOCS,
  });

// ---------------------------------------------------------------------------
// Chain readers (viem/tempo, read-only). Injected in tests; no transaction is ever sent.
// ---------------------------------------------------------------------------

export interface KeyState {
  /** false: the key was never authorized by this account. */
  found: boolean;
  revoked: boolean;
  /** unix seconds */
  expiry: bigint;
  /** remaining spending limit for the token, micro-USDC */
  remaining: bigint;
}

export interface KeychainReader {
  key(payer: string, key_id: string, token: string): Promise<KeyState>;
}

export interface ChainTransfer {
  from: string;
  to: string;
  value: bigint;
  memo: string;
}

export interface TransferProof {
  /** false: the transaction is unknown or not yet mined. */
  found: boolean;
  success: boolean;
  /** TIP-20 `TransferWithMemo` events of the USDC token in this transaction. */
  transfers: ChainTransfer[];
}

export interface TransferReader {
  read(tx_hash: string): Promise<TransferProof>;
}

export interface KeychainDeps extends ShopDeps {
  keychain?: KeychainReader;
  transfers?: TransferReader;
}

const tempoClient = async () => {
  const { createStreamClient } = await import('./stream-session');
  return createStreamClient(getMppConfig());
};

export const viemKeychainReader: KeychainReader = {
  async key(payer, key_id, token) {
    const { Actions } = await import('viem/tempo');
    const client = await tempoClient();
    const meta = await Actions.accessKey.getMetadata(client as never, {
      account: payer as `0x${string}`,
      accessKey: key_id as `0x${string}`,
    });
    const remaining = await Actions.accessKey.getRemainingLimit(client as never, {
      account: payer as `0x${string}`,
      accessKey: key_id as `0x${string}`,
      token: token as `0x${string}`,
    });
    const found = meta.expiry > 0n && meta.address.toLowerCase() === key_id.toLowerCase();
    return { found, revoked: meta.isRevoked, expiry: meta.expiry, remaining };
  },
};

export const viemTransferReader: TransferReader = {
  async read(tx_hash) {
    const { getTransactionReceipt } = await import('viem/actions');
    const { parseEventLogs } = await import('viem');
    const { Abis } = await import('viem/tempo');
    const client = await tempoClient();
    let rc;
    try {
      rc = await getTransactionReceipt(client as never, { hash: tx_hash as `0x${string}` });
    } catch (err) {
      if (!/NotFound/i.test(err instanceof Error ? err.name : '')) throw err;
      return { found: false, success: false, transfers: [] };
    }
    const token = getMppConfig().usdcAddress.toLowerCase();
    const logs = parseEventLogs({
      abi: Abis.tip20,
      eventName: 'TransferWithMemo',
      logs: rc.logs,
    }) as unknown as Array<{
      address: string;
      args: { from: string; to: string; amount: bigint; memo: string };
    }>;
    return {
      found: true,
      success: rc.status === 'success',
      transfers: logs
        .filter((l) => l.address.toLowerCase() === token)
        .map((l) => ({
          from: l.args.from,
          to: l.args.to,
          value: l.args.amount,
          memo: l.args.memo,
        })),
    };
  },
};

// ---------------------------------------------------------------------------
// 1. PUT / DELETE /merchants/me/renewer-key
// ---------------------------------------------------------------------------

/**
 * The merchant registers the ADDRESS of its renewal key. Only `key_id` (a 20-byte address) and
 * `expires_at` are accepted: a 32-byte private key fails the address pattern, and any other field
 * is refused, so a key pasted into the wrong field is never stored (and never echoed back).
 */
export async function putRenewerKey(
  d: Pick<ShopDeps, 'db'>,
  merchant_id: string,
  body: unknown,
  nowMs: number = Date.now(),
): Promise<RenewerKey> {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw invalid('the body must be {key_id, expires_at}');
  }
  const extra = Object.keys(b).filter((k) => k !== 'key_id' && k !== 'expires_at');
  if (extra.length > 0) {
    throw invalid('only key_id and expires_at are accepted; never send a private key');
  }
  if (typeof b.key_id !== 'string' || !ADDR_RE.test(b.key_id)) {
    throw invalid('key_id must be a 20-byte 0x address (the public address of the key)');
  }
  const exp = typeof b.expires_at === 'string' ? Date.parse(b.expires_at) : NaN;
  if (Number.isNaN(exp) || exp <= nowMs) {
    throw invalid('expires_at must be a future ISO 8601 timestamp');
  }
  const key: RenewerKey = {
    key_id: b.key_id.toLowerCase(),
    expires_at: new Date(exp).toISOString(),
  };
  const n = await d.db.$executeRawUnsafe(
    `UPDATE shop_merchants
        SET limits = jsonb_set(COALESCE(limits, '{}'::jsonb), '{renewer_key}', $2::jsonb, true)
      WHERE merchant_id = $1::uuid`,
    merchant_id,
    JSON.stringify(key),
  );
  if (n === 0) throw new QuoteError(404, 'not_found', 'merchant not found', 'use_different_tool');
  return key;
}

export async function deleteRenewerKey(
  d: Pick<ShopDeps, 'db'>,
  merchant_id: string,
): Promise<{ deleted: true }> {
  await d.db.$executeRawUnsafe(
    `UPDATE shop_merchants SET limits = COALESCE(limits, '{}'::jsonb) - 'renewer_key'
      WHERE merchant_id = $1::uuid`,
    merchant_id,
  );
  return { deleted: true };
}

// ---------------------------------------------------------------------------
// shared maths
// ---------------------------------------------------------------------------

export const periodMemo = (subscription_id: string, period_no: number): string =>
  `0x${createHash('sha256').update(`${subscription_id}:${period_no}`).digest('hex')}`;

/** One period's money, from server data only: total, and the fee leg when it is on. */
export function tempoLegs(planAmountUsd: number): {
  total: bigint;
  fee: bigint;
  fee_to: string | null;
} {
  const cfg = integratorConfig();
  const totalCents = Math.round(planAmountUsd * 100);
  const feeCents = computeFeeCents(totalCents, false, cfg);
  const feeTo = process.env['INTEGRATOR_FEE_WALLET'];
  const total = BigInt(toMicroUsdc(planAmountUsd));
  if (!(cfg.fee_enabled && feeCents > 0 && feeCents < totalCents && feeTo)) {
    return { total, fee: 0n, fee_to: null };
  }
  return { total, fee: BigInt(toMicroUsdc(feeCents / 100)), fee_to: feeTo.toLowerCase() };
}

async function payerWallet(
  db: ShopDeps['db'],
  sub: Pick<SubscriptionRow, 'subscription_id'>,
): Promise<string | null> {
  const last = await latestPeriod(db, sub.subscription_id);
  if (!last?.order_id) return null;
  const r = await db.$queryRawUnsafe<Array<{ payer_wallet: string | null }>>(
    `SELECT payer_wallet FROM shop_orders WHERE order_id = $1::uuid`,
    last.order_id,
  );
  return r[0]?.payer_wallet?.toLowerCase() ?? null;
}

// ---------------------------------------------------------------------------
// 2. shop.subscription.confirm_pull
// ---------------------------------------------------------------------------

/**
 * The payer's agent says it authorized the merchant's key. Accepted only if the keychain says so:
 * the key is known to the payer account, not revoked, not expired and its remaining limit for USDC
 * covers one period. `tx_hash` is the authorize transaction (shape-checked; the state read is what
 * counts).
 */
export async function confirmPull(
  d: KeychainDeps,
  buyer: Buyer,
  subscription_id: unknown,
  input: { tx_hash?: unknown },
  opts: { merchant_id?: string } = {},
): Promise<SubscriptionView> {
  const row = await loadRow(d.db, subscription_id);
  if (opts.merchant_id && row.merchant_id !== opts.merchant_id) throw notFound();
  await assertPayer(d.db, row, buyer.identity);
  if (typeof input.tx_hash !== 'string' || !TX_RE.test(input.tx_hash)) {
    throw invalid('tx_hash must be a 0x-prefixed 32-byte transaction hash');
  }
  if (row.status !== 'active' && row.status !== 'past_due') {
    throw conflict('subscription_not_renewable', `the subscription is ${row.status}`);
  }
  if (row.rail_pref !== 'tempo') {
    throw invalid('the keychain pull is available for subscriptions paid on Tempo only');
  }
  const key = await renewerKeyOf(d.db, row.merchant_id);
  if (!key) throw conflict('renewer_key_not_registered', 'this merchant has no renewal key');
  const payer = await payerWallet(d.db, row);
  if (!payer) throw conflict('payer_unknown', 'the paying wallet of this subscription is unknown');

  const token = getMppConfig().usdcAddress;
  let st: KeyState;
  try {
    st = await (d.keychain ?? viemKeychainReader).key(payer, key.key_id, token);
  } catch (err) {
    logger.warn(
      {
        err: err instanceof Error ? err.message : String(err),
        subscription_id: row.subscription_id,
      },
      'subscription keychain: state could not be read',
    );
    throw new QuoteError(
      503,
      'chain_unavailable',
      'the chain could not be read right now; repeat the call',
      'retry_after_delay',
    );
  }
  const now = (d.now ?? Date.now)();
  const price = BigInt(toMicroUsdc(row.plan.amount_usd));
  if (!st.found || st.revoked) {
    throw bad('keychain_not_authorized', 'the renewal key is not authorized by the paying wallet');
  }
  if (Number(st.expiry) * 1000 <= now)
    throw bad('keychain_expired', 'the key authorization expired');
  if (st.remaining < price) {
    throw bad('keychain_limit_too_low', 'the remaining limit does not cover one period', {
      remaining: st.remaining.toString(),
      required: price.toString(),
    });
  }
  await d.db.$executeRawUnsafe(
    `UPDATE shop_subscriptions SET pull_mode = 'tempo_keychain'
      WHERE subscription_id = $1::uuid AND status IN ('active', 'past_due')`,
    row.subscription_id,
  );
  return subscriptionViewById(d, row.subscription_id);
}

// ---------------------------------------------------------------------------
// 3. GET /merchants/me/subscriptions/renew-queue
// ---------------------------------------------------------------------------

export interface RenewQueueItem {
  subscription_id: string;
  period_no: number;
  payer: string;
  /** micro-USDC, the whole period price */
  amount: string;
  /** bytes32: sha256(subscription_id:period_no) */
  memo: string;
  recipient: string;
  token: string;
  /** the platform fee leg (amount - fee goes to `recipient`); absent when the fee is off */
  splits?: Array<{ wallet: string; amount: string }>;
}

/** `tempo_keychain` -> `none` and ONE `pull_failed` event (the period stays due for INT-41). */
async function pullFailed(
  d: ShopDeps,
  sub: SubscriptionRow,
  period_no: number,
  reason: string,
): Promise<void> {
  await d.transaction(async (tx) => {
    const n = await tx.$executeRawUnsafe(
      `UPDATE shop_subscriptions SET pull_mode = 'none'
        WHERE subscription_id = $1::uuid AND pull_mode = 'tempo_keychain'`,
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

/**
 * The merchant's own `tempo_keychain` periods that are due now (`period_start <= now`). Every item
 * is checked against the keychain first: a revoked / expired / exhausted key becomes `pull_failed`
 * and the item is not queued (the agent renews explicitly, INT-41 `past_due` applies). A canceled
 * or expired subscription is never queued, so the CLI has nothing to sign.
 */
export async function listRenewQueue(
  d: KeychainDeps,
  merchant_id: string,
): Promise<{ queue: RenewQueueItem[] }> {
  const nowMs = (d.now ?? Date.now)();
  const key = await renewerKeyOf(d.db, merchant_id);
  const subs = await d.db.$queryRawUnsafe<SubscriptionRow[]>(
    `SELECT ${SUBSCRIPTION_COLS} FROM shop_subscriptions
      WHERE merchant_id = $1::uuid AND pull_mode = 'tempo_keychain'
        AND status IN ('active', 'past_due') AND next_charge_at <= $2::timestamptz
      ORDER BY next_charge_at LIMIT ${QUEUE_LIMIT}`,
    merchant_id,
    new Date(nowMs).toISOString(),
  );
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
      merchant_id,
    )
  )[0];
  const queue: RenewQueueItem[] = [];
  if (!m) return { queue };
  const token = getMppConfig().usdcAddress;
  for (const sub of subs) {
    const last = await latestPeriod(d.db, sub.subscription_id);
    if (!last) continue;
    const period_no = last.period_no + 1;
    if (reachedEnd(sub, last.period_no, new Date(last.period_end))) continue;
    const payer = await payerWallet(d.db, sub);
    if (!payer) continue;
    const amount = BigInt(toMicroUsdc(sub.plan.amount_usd));
    if (!key || Date.parse(key.expires_at) <= nowMs) {
      await pullFailed(d, sub, period_no, 'key_expired');
      continue;
    }
    let st: KeyState;
    try {
      st = await (d.keychain ?? viemKeychainReader).key(payer, key.key_id, token);
    } catch (err) {
      logger.warn(
        {
          err: err instanceof Error ? err.message : String(err),
          subscription_id: sub.subscription_id,
        },
        'subscription keychain: state unreadable, item skipped',
      );
      continue;
    }
    if (!st.found || st.revoked) {
      await pullFailed(d, sub, period_no, 'key_revoked');
      continue;
    }
    if (Number(st.expiry) * 1000 <= nowMs) {
      await pullFailed(d, sub, period_no, 'key_expired');
      continue;
    }
    if (st.remaining < amount) {
      await pullFailed(d, sub, period_no, 'limit_exceeded');
      continue;
    }
    const legs = tempoLegs(sub.plan.amount_usd);
    queue.push({
      subscription_id: sub.subscription_id,
      period_no,
      payer,
      amount: amount.toString(),
      memo: periodMemo(sub.subscription_id, period_no),
      recipient: currentPayout(m, 'tempo', nowMs).toLowerCase(),
      token,
      ...(legs.fee_to ? { splits: [{ wallet: legs.fee_to, amount: legs.fee.toString() }] } : {}),
    });
  }
  return { queue };
}

// ---------------------------------------------------------------------------
// 4. POST /merchants/me/subscriptions/:id/renewed {period_no, tx_hashes[]}
// ---------------------------------------------------------------------------

export interface RenewedResult {
  subscription_id: string;
  period_no: number;
  status: 'paid';
  order_id: string;
  tx_hashes: string[];
  fee_settlement: 'in_tx' | 'receivable' | 'none';
  verified: true;
}

const sameAddr = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const walletIdentity = (w: string) =>
  `wallet:${createHash('sha256').update(w.toLowerCase()).digest('hex')}`;

/**
 * The merchant reports the transfers its key sent. Nothing it says is taken on trust: every
 * transaction is read from the chain and must show, for the memo of THIS period, `from == payer`,
 * one transfer of `amount - fee` to the merchant payout wallet and (fee on) one of `fee` to the
 * fee wallet. A missing fee transfer is accepted and recorded as a receivable. The period is then
 * paid through an order (INT-41 path, rail tempo).
 */
export async function recordRenewal(
  d: KeychainDeps,
  merchant_id: string,
  subscription_id: unknown,
  input: { period_no?: unknown; tx_hashes?: unknown },
): Promise<RenewedResult> {
  const row = await loadRow(d.db, subscription_id);
  if (row.merchant_id !== merchant_id) throw notFound();
  const period_no = input.period_no;
  if (!Number.isInteger(period_no) || (period_no as number) < 2) {
    throw invalid('period_no must be an integer >= 2');
  }
  const n = period_no as number;
  const raw = input.tx_hashes;
  if (
    !Array.isArray(raw) ||
    raw.length < 1 ||
    raw.length > 2 ||
    !raw.every((h) => typeof h === 'string' && TX_RE.test(h))
  ) {
    throw invalid('tx_hashes must hold 1..2 transaction hashes');
  }
  const hashes = [...new Set((raw as string[]).map((h) => h.toLowerCase()))];
  if (row.status !== 'active' && row.status !== 'past_due') {
    throw conflict('subscription_not_renewable', `the subscription is ${row.status}`);
  }
  if (row.pull_mode !== 'tempo_keychain') {
    throw conflict(
      'subscription_not_renewable',
      'this subscription is not set up for a keychain pull',
    );
  }
  const last = await latestPeriod(d.db, row.subscription_id);
  if (!last) throw conflict('subscription_not_renewable', 'the subscription has no paid period');
  if (n <= last.period_no) {
    throw conflict('subscription_period_paid', `period ${n} of this subscription is already paid`);
  }
  if (n !== last.period_no + 1)
    throw bad('period_not_next', `the next period is ${last.period_no + 1}`);

  const used = await d.db.$queryRawUnsafe<unknown[]>(
    `SELECT 1 FROM shop_payments WHERE lower(nonce_or_challenge_id) = ANY($1::text[])
        OR lower(tx_hash) = ANY($1::text[]) LIMIT 1`,
    hashes,
  );
  if (used.length > 0) throw conflict('tx_already_used', 'a transaction was already reported');

  const payer = await payerWallet(d.db, row);
  if (!payer) throw conflict('payer_unknown', 'the paying wallet of this subscription is unknown');
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
      merchant_id,
    )
  )[0];
  if (!m) throw notFound();
  const nowMs = (d.now ?? Date.now)();
  const recipient = currentPayout(m, 'tempo', nowMs).toLowerCase();
  const legs = tempoLegs(row.plan.amount_usd);
  const memo = periodMemo(row.subscription_id, n);

  const reject = (reason: string) =>
    bad('renewal_not_proven', `the transactions do not prove this renewal: ${reason}`, {
      reject_reason: reason,
    });
  const transfers: ChainTransfer[] = [];
  for (const h of hashes) {
    let proof: TransferProof;
    try {
      proof = await (d.transfers ?? viemTransferReader).read(h);
    } catch (err) {
      logger.warn(
        {
          err: err instanceof Error ? err.message : String(err),
          subscription_id: row.subscription_id,
        },
        'subscription keychain: renewal proof could not be read',
      );
      throw new QuoteError(
        503,
        'chain_unavailable',
        'the chain could not be read right now; repeat the call',
        'retry_after_delay',
      );
    }
    if (!proof.found) throw reject('tx_not_found_or_unconfirmed');
    if (!proof.success) throw reject('tx_reverted');
    transfers.push(...proof.transfers);
  }
  let toMerchant = 0n;
  let toFee = 0n;
  let merchantCount = 0;
  let feeCount = 0;
  for (const t of transfers) {
    if (t.memo.toLowerCase() !== memo) continue; // other transfers in the same batch are not ours
    if (!sameAddr(t.from, payer)) throw reject('transfer_not_from_payer');
    if (sameAddr(t.to, recipient)) {
      toMerchant += t.value;
      merchantCount++;
    } else if (legs.fee_to && sameAddr(t.to, legs.fee_to)) {
      toFee += t.value;
      feeCount++;
    } else {
      throw reject('transfer_to_unexpected_recipient');
    }
  }
  if (merchantCount !== 1) throw reject('transfer_to_payout_wallet_missing');
  if (feeCount > 1) throw reject('more_than_one_fee_transfer');
  const feePaid = feeCount === 1;
  if (feePaid) {
    if (toFee !== legs.fee) throw reject('fee_value_mismatch');
    if (toMerchant !== legs.total - legs.fee) throw reject('payout_value_mismatch');
  } else if (toMerchant !== legs.total) {
    // fee on and no fee transfer: the merchant took the whole amount, the fee is owed (A3-2)
    throw reject('payout_value_mismatch');
  }

  // The period's order (INT-41): quote -> PAYING with a confirmed Tempo payment -> PAID + delivery.
  const buyer: Buyer = { identity: row.buyer_agent_id ?? walletIdentity(payer) };
  const quote = await renewalQuote(d, row, buyer, n, nowMs);
  const order = await d.transaction(async (tx) => {
    const refusal = await periodRefusal(tx, quote.quote_id);
    if (refusal) return { refusal };
    const o = await tx.$queryRawUnsafe<Array<{ order_id: string; state: string }>>(
      `SELECT order_id, state FROM shop_orders WHERE quote_id = $1::uuid FOR UPDATE`,
      quote.quote_id,
    );
    if (!o[0] || (o[0].state !== 'QUOTED' && o[0].state !== 'PAYMENT_FAILED')) {
      return {
        refusal: { code: 409, error: 'order_not_payable', message: 'the period order is busy' },
      };
    }
    const feeUsd = Number(legs.fee) / 1e6;
    const pay = await tx.$queryRawUnsafe<Array<{ payment_id: string }>>(
      `INSERT INTO shop_payments (order_id, rail, nonce_or_challenge_id, payer, pay_to, amount_usd,
                                  splits, tx_hash, chain_status, confirmed_at)
       VALUES ($1::uuid, 'tempo', $2, $3, $4, $5::numeric, $6::jsonb, $7, 'confirmed', now())
       RETURNING payment_id`,
      o[0].order_id,
      hashes[0],
      payer,
      recipient,
      quote.total_usd,
      JSON.stringify(
        legs.fee_to
          ? [
              {
                wallet: legs.fee_to,
                amount_usd: feeUsd,
                fee_to: legs.fee_to,
                fee: feeUsd,
                mode: feePaid ? 'in_tx' : 'receivable',
                tx_hashes: hashes,
              },
            ]
          : [],
      ),
      hashes[0],
    );
    await transition(tx, o[0].order_id, 'PAYING', {
      actor: 'system',
      reason: 'keychain_renewal_reported',
      payload: { payer_wallet: payer, rail: 'tempo', tx_hashes: hashes },
    });
    await tx.$executeRawUnsafe(
      `UPDATE shop_orders SET payer_wallet = $2, rail = 'tempo' WHERE order_id = $1::uuid`,
      o[0].order_id,
      payer,
    );
    return { order_id: o[0].order_id, payment_id: pay[0].payment_id };
  });
  if ('refusal' in order && order.refusal) {
    throw new QuoteError(
      order.refusal.code as 409,
      order.refusal.error,
      order.refusal.message,
      'fix_request',
      {
        documentation_url: DOCS,
      },
    );
  }
  const paying = order as { order_id: string; payment_id: string };
  // loaded on demand: the settle stage pulls the x402 server, which tool listing must not need
  const { finalizeConfirmed } = await import('../pipeline/stages/shop-settle');
  const done = await finalizeConfirmed(d, {
    order_id: paying.order_id,
    payment_id: paying.payment_id,
    tx_hash: hashes[0],
    payer,
    rail: 'tempo',
    request_id: `sub-renew:${row.subscription_id}:${n}`,
  });
  if (!done) throw conflict('order_not_payable', 'the period order could not be completed');
  const settled = await d.db.$queryRawUnsafe<Array<{ fee_settlement: string | null }>>(
    `SELECT fee_settlement FROM shop_orders WHERE order_id = $1::uuid`,
    paying.order_id,
  );
  return {
    subscription_id: row.subscription_id,
    period_no: n,
    status: 'paid',
    order_id: paying.order_id,
    tx_hashes: hashes,
    fee_settlement: (settled[0]?.fee_settlement as RenewedResult['fee_settlement']) ?? 'none',
    verified: true,
  };
}
