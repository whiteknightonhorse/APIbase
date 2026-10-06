import { logger } from '../config/logger';
import { getMppConfig } from '../config/mpp.config';
import type { ShopTx } from './db';
import type { ShopDeps } from './merchant-lifecycle.service';
import { QuoteError } from './quote.errors';
import { createStreamClient, fromMicro, toMicro, type StreamMethod } from './stream-session';
import {
  recordSettlement,
  sessionCols,
  SETTLE_INTERVAL_MS,
  SETTLE_OVERDUE_AFTER_MS,
  SETTLE_THRESHOLD_MICRO,
  writeStreamLedger,
  type StreamSessionRow,
} from './stream.service';

/**
 * T-INT-46 (UC-7 variant b / F-9 / F-10): `stream_settler = 'merchant'`. APIbase keeps the
 * accounting and verifies the vouchers; the merchant holds the only key that can settle/close its
 * channels (escrow `NotPayee`) and runs it through `packages/stream-settler`. This module never
 * signs or sends anything: it queues work for the merchant and READS the chain to verify it.
 */

const DOCS = '/docs/integrator#streaming-for-your-shop-run-the-settler-with-your-own-key';
const TX_RE = /^0x[0-9a-fA-F]{64}$/;
const CHANNEL_RE = /^0x[0-9a-fA-F]{64}$/;
const QUEUE_LIMIT = 200;

export const CLOSE_PENDING_NOTE =
  'merchant settles within grace; you may requestClose/withdraw on-chain after CLOSE_GRACE_PERIOD';

const bad = (code: string, message: string, extra: Record<string, unknown> = {}) =>
  new QuoteError(400, code, message, 'fix_request', { documentation_url: DOCS, ...extra });

// ---------------------------------------------------------------------------
// 1. PATCH /merchants/me/stream-settings
// ---------------------------------------------------------------------------

/** The merchant opts in to settling its own channels. `apibase_pilot` is operator-only. */
export async function patchStreamSettings(
  d: Pick<ShopDeps, 'db'>,
  merchant_id: string,
  body: unknown,
): Promise<{ settler: 'merchant' }> {
  const settler = (body as { settler?: unknown } | null | undefined)?.settler;
  if (settler !== 'merchant') {
    throw new QuoteError(422, 'validation_failed', "settler must be 'merchant'", 'fix_request', {
      documentation_url: DOCS,
    });
  }
  const m = (
    await d.db.$queryRawUnsafe<Array<{ status: string; stream_settler: string | null }>>(
      `SELECT status, stream_settler FROM shop_merchants WHERE merchant_id = $1::uuid`,
      merchant_id,
    )
  )[0];
  if (!m) throw new QuoteError(404, 'not_found', 'merchant not found', 'use_different_tool');
  if (m.status !== 'active') {
    throw new QuoteError(
      409,
      'merchant_not_active',
      'the shop must be active (run the connection check first)',
      'use_different_tool',
      { documentation_url: DOCS },
    );
  }
  if (m.stream_settler === 'apibase_pilot') {
    throw new QuoteError(
      409,
      'settler_operator_managed',
      'streaming for this shop is operated by APIbase',
      'use_different_tool',
    );
  }
  await d.db.$executeRawUnsafe(
    `UPDATE shop_merchants SET stream_settler = 'merchant' WHERE merchant_id = $1::uuid`,
    merchant_id,
  );
  return { settler: 'merchant' };
}

// ---------------------------------------------------------------------------
// 2. close of a merchant-settled channel: 202 close_pending
// ---------------------------------------------------------------------------

/**
 * The payer's close voucher (already verified by mppx before it tried to sign) becomes the highest
 * voucher, and the session waits for the merchant. `settle_error_since` starts the one-hour clock
 * the overdue sweep and the incident engine read.
 */
export async function recordDeferredClose(
  d: Pick<ShopDeps, 'db'>,
  s: { merchant_id: string; channel_id: string },
  m: Pick<StreamMethod, 'channels'>,
  voucher: { cumulativeAmount: bigint; signature: string },
): Promise<void> {
  const channelId = s.channel_id.toLowerCase();
  await m.channels.updateChannel(channelId, (cur: { highestVoucherAmount?: bigint } | null) => {
    if (!cur || voucher.cumulativeAmount <= (cur.highestVoucherAmount ?? 0n)) return cur;
    return {
      ...cur,
      highestVoucherAmount: voucher.cumulativeAmount,
      highestVoucher: {
        channelId,
        cumulativeAmount: voucher.cumulativeAmount,
        signature: voucher.signature,
      },
    };
  });
  await d.db.$executeRawUnsafe(
    `UPDATE shop_stream_sessions
        SET status = 'close_pending',
            settle_error_since = COALESCE(settle_error_since, now()),
            highest_voucher = CASE
              WHEN COALESCE((highest_voucher->>'cumulativeAmount')::numeric, 0) < $3::numeric
              THEN $4::jsonb ELSE highest_voucher END
      WHERE merchant_id = $1::uuid AND channel_id = $2 AND status IN ('open', 'close_pending')`,
    s.merchant_id,
    channelId,
    voucher.cumulativeAmount.toString(),
    JSON.stringify({
      channelId,
      cumulativeAmount: voucher.cumulativeAmount.toString(),
      signature: voucher.signature,
    }),
  );
}

// ---------------------------------------------------------------------------
// 3. GET /merchants/me/streams/settle-queue
// ---------------------------------------------------------------------------

export interface SettleQueueItem {
  channel_id: string;
  escrow_contract: string | null;
  chain_id: number | null;
  /** micro-USD (6 decimals) as a decimal string: the voucher's `cumulativeAmount`. */
  cumulative_amount: string;
  /** the payer's voucher signature: public channel data, nothing secret. */
  signature: string;
  action: 'settle' | 'close';
}

type QueueRow = StreamSessionRow & {
  highest_voucher: { cumulativeAmount?: string; signature?: string } | null;
};

/** The merchant's own channels that need an on-chain settle or close right now. */
export async function listSettleQueue(
  d: Pick<ShopDeps, 'db'>,
  merchant_id: string,
  nowMs: number = Date.now(),
): Promise<{ queue: SettleQueueItem[] }> {
  const rows = await d.db.$queryRawUnsafe<QueueRow[]>(
    `SELECT ${sessionCols('s')} FROM shop_stream_sessions s
      WHERE s.merchant_id = $1::uuid AND s.settler_mode = 'merchant'
        AND s.status IN ('open', 'close_pending')
      ORDER BY s.opened_at LIMIT ${QUEUE_LIMIT}`,
    merchant_id,
  );
  const queue: SettleQueueItem[] = [];
  for (const s of rows) {
    const v = s.highest_voucher;
    if (!v?.signature || v.cumulativeAmount === undefined) continue;
    const highest = BigInt(v.cumulativeAmount);
    const settled = toMicro(s.settled_usd);
    const lastMs = new Date(s.last_settle_at ?? s.opened_at).getTime();
    const item = (action: 'settle' | 'close'): SettleQueueItem => ({
      channel_id: s.channel_id,
      escrow_contract: s.escrow_contract,
      chain_id: s.chain_id,
      cumulative_amount: highest.toString(),
      signature: v.signature as string,
      action,
    });
    if (s.status === 'close_pending') {
      queue.push(item('close'));
      continue;
    }
    if (highest <= settled) continue;
    if (
      highest - settled >= SETTLE_THRESHOLD_MICRO ||
      nowMs - lastMs >= SETTLE_INTERVAL_MS ||
      s.close_requested_at
    ) {
      queue.push(item('settle'));
    }
  }
  return { queue };
}

// ---------------------------------------------------------------------------
// 4. POST /merchants/me/streams/:channel_id/settled {tx_hash}
// ---------------------------------------------------------------------------

/** What the chain says about the merchant's transaction and the channel (viem, read-only). */
export interface SettleProof {
  /** false: the transaction is unknown or not yet mined. */
  found: boolean;
  success: boolean;
  from: string | null;
  /** `getChannel(channelId).settled` in micro-USD. */
  settled: bigint;
  finalized: boolean;
}

export interface SettleReader {
  read(
    s: { channel_id: string; escrow_contract: string | null },
    tx_hash: string,
  ): Promise<SettleProof>;
}

export const mppxSettleReader: SettleReader = {
  async read(s, tx_hash) {
    const { getTransaction, getTransactionReceipt } = await import('viem/actions');
    const { Session } = await import('mppx/tempo');
    const client = await createStreamClient(getMppConfig());
    let from: string | null = null;
    let success = false;
    try {
      const tx = await getTransaction(client as never, { hash: tx_hash as `0x${string}` });
      from = tx.from;
      const rc = await getTransactionReceipt(client as never, { hash: tx_hash as `0x${string}` });
      success = rc.status === 'success';
    } catch (err) {
      if (!/NotFound/i.test(err instanceof Error ? err.name : '')) throw err;
      return { found: false, success: false, from: null, settled: 0n, finalized: false };
    }
    const oc = await Session.Chain.getOnChainChannel(
      client as never,
      (s.escrow_contract ?? undefined) as `0x${string}`,
      s.channel_id as `0x${string}`,
    );
    return {
      found: true,
      success,
      from,
      settled: oc.settled,
      finalized: oc.finalized === true,
    };
  },
};

export interface SettledDeps extends ShopDeps {
  reader?: SettleReader;
}

export interface SettledResult {
  channel_id: string;
  status: 'open' | 'closed';
  settled_usd: string;
  verified: true;
  fee_usd: string;
}

/**
 * The merchant reports the transaction it sent. Accepted only if the chain shows: the transaction
 * succeeded, its sender is the merchant payout wallet, and the escrow's `settled` moved up (for a
 * close: the channel is finalized and fully settled). Nothing the merchant says is taken on trust.
 */
export async function confirmMerchantSettled(
  d: SettledDeps,
  merchant_id: string,
  channel_id: unknown,
  input: { tx_hash?: unknown },
): Promise<SettledResult> {
  if (typeof channel_id !== 'string' || !CHANNEL_RE.test(channel_id)) {
    throw new QuoteError(404, 'not_found', 'channel not found', 'use_different_tool');
  }
  if (typeof input.tx_hash !== 'string' || !TX_RE.test(input.tx_hash)) {
    throw bad('validation_failed', 'tx_hash must be a 0x-prefixed 32-byte transaction hash');
  }
  const tx_hash = input.tx_hash.toLowerCase();
  const s = (
    await d.db.$queryRawUnsafe<Array<StreamSessionRow & { payout_wallet_tempo: string }>>(
      `SELECT ${sessionCols('s')}, m.payout_wallet_tempo
         FROM shop_stream_sessions s JOIN shop_merchants m ON m.merchant_id = s.merchant_id
        WHERE s.merchant_id = $1::uuid AND s.channel_id = $2 AND s.settler_mode = 'merchant'`,
      merchant_id,
      channel_id.toLowerCase(),
    )
  )[0];
  if (!s) throw new QuoteError(404, 'not_found', 'channel not found', 'use_different_tool');

  const done = await d.db.$queryRawUnsafe<unknown[]>(
    `SELECT 1 FROM shop_stream_settlements WHERE lower(tx_hash) = $1 LIMIT 1`,
    tx_hash,
  );
  if (done.length > 0) {
    // the same report again is harmless; the transaction of another channel is not
    const mine = await d.db.$queryRawUnsafe<unknown[]>(
      `SELECT 1 FROM shop_stream_settlements WHERE lower(tx_hash) = $1 AND session_id = $2::uuid LIMIT 1`,
      tx_hash,
      s.session_id,
    );
    if (mine.length === 0) {
      throw new QuoteError(
        409,
        'tx_already_used',
        'this transaction was already reported',
        'fix_request',
      );
    }
    return result(s, 0n);
  }

  let proof: SettleProof;
  try {
    proof = await (d.reader ?? mppxSettleReader).read(s, tx_hash);
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), channel: s.channel_id },
      'stream: settle proof could not be read',
    );
    throw new QuoteError(
      503,
      'chain_unavailable',
      'the chain could not be read right now; repeat the call',
      'retry_after_delay',
    );
  }
  const reject = (reason: string) =>
    bad('settle_not_proven', `the transaction does not prove this settlement: ${reason}`, {
      reject_reason: reason,
      channel_id: s.channel_id,
    });
  if (!proof.found) throw reject('tx_not_found_or_unconfirmed');
  if (!proof.success) throw reject('tx_reverted');
  if (!proof.from || proof.from.toLowerCase() !== s.payout_wallet_tempo.toLowerCase()) {
    throw reject('tx_not_sent_from_payout_wallet');
  }
  const highest = BigInt(s.highest_voucher?.cumulativeAmount ?? '0');
  const closing = s.status === 'close_pending';
  if (closing && !(proof.finalized && proof.settled >= highest)) {
    throw reject('channel_not_closed_on_chain');
  }
  const recorded = toMicro(s.settled_usd);
  const cumulative = proof.settled < highest ? proof.settled : highest;
  if (!closing && cumulative <= recorded) throw reject('settled_not_advanced');

  const fee = await d.transaction(async (tx: ShopTx) => {
    const locked = (
      await tx.$queryRawUnsafe<StreamSessionRow[]>(
        `SELECT ${sessionCols('shop_stream_sessions')} FROM shop_stream_sessions
          WHERE session_id = $1::uuid FOR UPDATE`,
        s.session_id,
      )
    )[0];
    return recordSettlement(tx, locked, {
      cumulative_micro: cumulative,
      tx_hash,
      submitted_by: 'merchant',
      closing,
    });
  });
  await writeStreamLedger(d.db, s, fee.fee_micro, null);
  const after = (
    await d.db.$queryRawUnsafe<Array<{ status: string; settled_usd: string }>>(
      `SELECT status, settled_usd::text AS settled_usd FROM shop_stream_sessions WHERE session_id = $1::uuid`,
      s.session_id,
    )
  )[0];
  return {
    channel_id: s.channel_id,
    status: after.status === 'closed' ? 'closed' : 'open',
    settled_usd: after.settled_usd,
    verified: true,
    fee_usd: fromMicro(fee.fee_micro),
  };
}

const result = (s: StreamSessionRow, fee: bigint): SettledResult => ({
  channel_id: s.channel_id,
  status: s.status === 'closed' ? 'closed' : 'open',
  settled_usd: s.settled_usd,
  verified: true,
  fee_usd: fromMicro(fee),
});

// ---------------------------------------------------------------------------
// 5. overdue sweep
// ---------------------------------------------------------------------------

export interface SettleDueReport {
  notified: number;
}

/**
 * A `close_pending` channel (or one whose payer asked to close on-chain) with no confirmed settle
 * for an hour: ONE `shop.stream.settle_due` event per channel (webhook / events feed). The
 * incident (STREAM_SETTLE_OVERDUE, one per channel) and the merchant mail come from the incident
 * engine, which reads the same `settle_error_since` stamp.
 */
export async function runMerchantSettleDue(
  d: Pick<ShopDeps, 'db' | 'transaction'>,
  nowMs: number = Date.now(),
): Promise<SettleDueReport> {
  const cutoff = new Date(nowMs - SETTLE_OVERDUE_AFTER_MS);
  const due = await d.db.$queryRawUnsafe<
    Array<{ session_id: string; merchant_id: string; channel_id: string; status: string }>
  >(
    `SELECT session_id, merchant_id, channel_id, status FROM shop_stream_sessions
      WHERE settler_mode = 'merchant' AND status IN ('open', 'close_pending')
        AND settle_error_since IS NOT NULL AND settle_error_since < $1::timestamptz
        AND settle_due_at IS NULL
      ORDER BY settle_error_since LIMIT ${QUEUE_LIMIT}`,
    cutoff,
  );
  let notified = 0;
  for (const s of due) {
    notified += await d.transaction(async (tx) => {
      const n = await tx.$executeRawUnsafe(
        `UPDATE shop_stream_sessions SET settle_due_at = $2::timestamptz
          WHERE session_id = $1::uuid AND settle_due_at IS NULL`,
        s.session_id,
        new Date(nowMs),
      );
      if (n === 0) return 0;
      await tx.$executeRawUnsafe(
        `INSERT INTO outbox (event_type, payload) VALUES ('shop.stream.settle_due', $1::jsonb)`,
        JSON.stringify({
          merchant_id: s.merchant_id,
          session_id: s.session_id,
          channel_id: s.channel_id,
          status: s.status,
        }),
      );
      return 1;
    });
  }
  return { notified };
}
