import { logger } from '../config/logger';
import { getMppConfig } from '../config/mpp.config';
import { config } from '../config';
import { decryptSecret } from '../services/secret-crypto.service';
import type { ShopTx } from './db';
import type { ShopDeps } from './merchant-lifecycle.service';
import type { StreamTerms } from './catalog.service';
import { integratorConfig } from './quote.service';
import { reasonBlocks } from './auth/terms.guard';
import {
  createStreamClient,
  fromMicro,
  getStreamMethod,
  StreamError,
  toMicro,
  type StreamMerchant,
  type StreamMethod,
} from './stream-session';

/**
 * UC-7 / F-9 bookkeeping for `shop_stream_sessions` / `shop_stream_settlements`, the stream fee
 * (A3-1: a receivable, no `splits` in a session) and the `shop-stream-settle` job body.
 */

const SLUG_RE = /^[a-z0-9-]{3,40}$/;
const SKU_RE = /^[A-Za-z0-9._:-]{1,64}$/;
const HOUR_MS = 3_600_000;
/** F-9: settle once the unsettled amount reaches $0.50, or every hour, or at close. */
export const SETTLE_THRESHOLD_MICRO = 500_000n;
export const SETTLE_INTERVAL_MS = HOUR_MS;
/** Failure to settle for this long raises STREAM_SETTLE_OVERDUE (the engine reads `settle_error_since`). */
export const SETTLE_OVERDUE_AFTER_MS = HOUR_MS;
const JOB_BATCH = 200;
export const STREAM_TOOL_ID = 'shop.stream.consume';

export interface StreamProduct {
  sku: string;
  terms: StreamTerms;
  content: string;
}

export interface StreamTarget {
  merchant: StreamMerchant & { status: string };
  product: StreamProduct;
}

interface MerchantRow extends StreamMerchant {
  status: string;
  status_reason: string | null;
  agent_id: string | null;
}

/** Slug + sku -> merchant and product, always scoped to ONE merchant_id (§9.1 cross-tenant). */
export async function loadStreamTarget(
  db: ShopTx,
  slug: unknown,
  sku: unknown,
): Promise<StreamTarget> {
  const notFound = () => new StreamError(404, 'not_found', 'stream not found');
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) throw notFound();
  if (typeof sku !== 'string' || !SKU_RE.test(sku)) throw notFound();
  const m = (
    await db.$queryRawUnsafe<MerchantRow[]>(
      `SELECT merchant_id, slug, payout_wallet_tempo, stream_settler, status, status_reason, agent_id
         FROM shop_merchants WHERE slug = $1`,
      slug,
    )
  )[0];
  if (!m || m.status === 'pending') throw notFound();
  if (m.status !== 'active' || reasonBlocks(m.status_reason)) {
    throw new StreamError(410, 'stream_unavailable', 'this shop is no longer available');
  }
  const p = (
    await db.$queryRawUnsafe<
      Array<{
        sku: string;
        stream: StreamTerms | null;
        fulfillment_payload_encrypted: string | null;
      }>
    >(
      `SELECT sku, stream, fulfillment_payload_encrypted FROM shop_products
        WHERE merchant_id = $1::uuid AND sku = $2 AND fulfillment_mode = 'stream'
          AND moderation_status = 'ok' AND NOT is_test`,
      m.merchant_id,
      sku,
    )
  )[0];
  if (!p || !p.stream) throw notFound();
  const key = config.ENCRYPTION_KEY;
  if (!key || key.length < 32) {
    throw new StreamError(503, 'stream_unavailable', 'content key unavailable');
  }
  const content = p.fulfillment_payload_encrypted
    ? decryptSecret(p.fulfillment_payload_encrypted, key)
    : '';
  return { merchant: m, product: { sku: p.sku, terms: p.stream, content } };
}

export interface StreamSessionRow {
  session_id: string;
  merchant_id: string;
  sku: string;
  channel_id: string;
  deposit_usd: string;
  rate_per_s: string;
  consumed_usd: string;
  consumed_s: number;
  settled_usd: string;
  settler_mode: string;
  escrow_contract: string | null;
  chain_id: number | null;
  highest_voucher: { cumulativeAmount?: string } | null;
  close_requested_at: Date | null;
  last_settle_at: Date | null;
  settle_error_since: Date | null;
  opened_at: Date;
  min_fee_applied: boolean;
  status: string;
}

/** Session columns, qualified by the table alias (the job joins merchants and products). */
const sessionCols = (a: string) =>
  [
    'session_id',
    'merchant_id',
    'sku',
    'channel_id',
    'deposit_usd::text AS deposit_usd',
    'rate_per_s::text AS rate_per_s',
    'consumed_usd::text AS consumed_usd',
    'consumed_s',
    'settled_usd::text AS settled_usd',
    'settler_mode',
    'escrow_contract',
    'chain_id',
    'highest_voucher',
    'close_requested_at',
    'last_settle_at',
    'settle_error_since',
    'opened_at',
    'min_fee_applied',
    'status',
  ]
    .map((c) => `${a}.${c}`)
    .join(', ');

/** The merchant's own session by channel id (another merchant's channel is simply not found). */
export async function findSession(
  db: ShopTx,
  merchant_id: string,
  channel_id: string,
): Promise<StreamSessionRow | null> {
  const rows = await db.$queryRawUnsafe<StreamSessionRow[]>(
    `SELECT ${sessionCols('shop_stream_sessions')} FROM shop_stream_sessions
      WHERE merchant_id = $1::uuid AND channel_id = $2`,
    merchant_id,
    channel_id.toLowerCase(),
  );
  return rows[0] ?? null;
}

/** The slice of the mppx channel state this module reads (bigint fields as mppx keeps them). */
export interface ChannelView {
  channelId: string;
  payer?: string;
  deposit: bigint;
  highestVoucherAmount: bigint;
  highestVoucher: { channelId: string; cumulativeAmount: bigint; signature: string } | null;
  spent: bigint;
  escrowContract?: string;
  chainId?: number;
  closeRequestedAt?: bigint;
}

const voucherJson = (v: ChannelView['highestVoucher']) =>
  v ? JSON.stringify({ ...v, cumulativeAmount: v.cumulativeAmount.toString() }) : null;

/** First `open` of a channel: the row exists only after the deposit passed the minimum. */
export async function recordOpen(
  db: ShopTx,
  t: StreamTarget,
  ch: ChannelView,
  settler_mode: string,
): Promise<{ created: boolean }> {
  const n = await db.$executeRawUnsafe(
    `INSERT INTO shop_stream_sessions
       (merchant_id, sku, buyer_agent_id, channel_id, deposit_usd, rate_per_s, settler_mode,
        escrow_contract, chain_id, highest_voucher)
     VALUES ($1::uuid, $2, $3, $4, $5::numeric, $6::numeric, $7, $8, $9::int, $10::jsonb)
     ON CONFLICT (channel_id) DO NOTHING`,
    t.merchant.merchant_id,
    t.product.sku,
    ch.payer ?? null,
    ch.channelId.toLowerCase(),
    fromMicro(ch.deposit),
    t.product.terms.rate_per_s_usd,
    settler_mode,
    ch.escrowContract ?? null,
    ch.chainId ?? null,
    voucherJson(ch.highestVoucher),
  );
  return { created: n > 0 };
}

/** open / voucher: consumption, deposit and the highest voucher follow the channel state. */
export async function recordConsumption(
  db: ShopTx,
  s: { merchant_id: string; channel_id: string },
  ch: ChannelView,
  consumed_s: number,
): Promise<void> {
  await db.$executeRawUnsafe(
    `UPDATE shop_stream_sessions
        SET consumed_usd = GREATEST(consumed_usd, $3::numeric),
            consumed_s = GREATEST(consumed_s, $4::int),
            deposit_usd = $5::numeric,
            highest_voucher = COALESCE($6::jsonb, highest_voucher)
      WHERE merchant_id = $1::uuid AND channel_id = $2`,
    s.merchant_id,
    s.channel_id.toLowerCase(),
    fromMicro(ch.spent),
    consumed_s,
    fromMicro(ch.deposit),
    voucherJson(ch.highestVoucher),
  );
}

export async function recordTopUp(
  db: ShopTx,
  s: { merchant_id: string; channel_id: string },
  ch: ChannelView,
): Promise<void> {
  await db.$executeRawUnsafe(
    `UPDATE shop_stream_sessions SET deposit_usd = $3::numeric
      WHERE merchant_id = $1::uuid AND channel_id = $2`,
    s.merchant_id,
    s.channel_id.toLowerCase(),
    fromMicro(ch.deposit),
  );
}

const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

/** 1.5 % of the settled increment (rounded up to a micro-dollar); 0 while the fee is off. */
export function streamFeeMicro(deltaMicro: bigint, cfg = integratorConfig()): bigint {
  if (!cfg.fee_enabled || deltaMicro <= 0n) return 0n;
  return ceilDiv(deltaMicro * BigInt(Math.round(cfg.fee_bps)), 10_000n);
}

export interface SettlementInput {
  cumulative_micro: bigint;
  tx_hash: string | null;
  submitted_by: 'apibase' | 'merchant';
  closing: boolean;
}

export interface SettlementResult {
  fee_micro: bigint;
  delta_micro: bigint;
}

const insertFee = (tx: ShopTx, merchant_id: string, session_id: string, feeMicro: bigint) =>
  tx.$executeRawUnsafe(
    `INSERT INTO shop_fee_ledger (merchant_id, order_id, fee_usd, mode, status, source, source_ref)
     VALUES ($1::uuid, NULL, $2::numeric, 'receivable', 'owed', 'stream', $3)`,
    merchant_id,
    fromMicro(feeMicro),
    session_id,
  );

/**
 * One settle (or the close) of a channel, in ONE transaction: the settlement row, the session
 * totals, the fee receivable and — at close — the once-per-session minimum fee. Idempotent for a
 * closed session.
 */
export async function recordSettlement(
  tx: ShopTx,
  s: StreamSessionRow,
  p: SettlementInput,
  cfg = integratorConfig(),
): Promise<SettlementResult> {
  const settled = toMicro(s.settled_usd);
  const delta = p.cumulative_micro > settled ? p.cumulative_micro - settled : 0n;
  if (s.status === 'closed' || (delta === 0n && !p.closing)) {
    return { fee_micro: 0n, delta_micro: 0n };
  }
  await tx.$executeRawUnsafe(
    `INSERT INTO shop_stream_settlements
       (session_id, merchant_id, channel_id, cumulative_amount, tx_hash, submitted_by, verified)
     VALUES ($1::uuid, $2::uuid, $3, $4::numeric, $5, $6, $7)`,
    s.session_id,
    s.merchant_id,
    s.channel_id,
    fromMicro(p.cumulative_micro),
    p.tx_hash,
    p.submitted_by,
    p.submitted_by === 'apibase',
  );
  await tx.$executeRawUnsafe(
    `UPDATE shop_stream_sessions
        SET settled_usd = GREATEST(settled_usd, $2::numeric), last_settle_at = now(),
            settle_error_since = NULL,
            status = CASE WHEN $3::boolean THEN 'closed' ELSE status END,
            closed_at = CASE WHEN $3::boolean THEN now() ELSE closed_at END
      WHERE session_id = $1::uuid`,
    s.session_id,
    fromMicro(p.cumulative_micro),
    p.closing,
  );
  let fee = streamFeeMicro(delta, cfg);
  if (fee > 0n) await insertFee(tx, s.merchant_id, s.session_id, fee);
  if (p.closing) fee += await applyMinimumFee(tx, s, p.cumulative_micro, cfg);
  return { fee_micro: fee, delta_micro: delta };
}

/** The minimum fee, topped up once when a session closes; returns the amount added. */
async function applyMinimumFee(
  tx: ShopTx,
  s: StreamSessionRow,
  settledMicro: bigint,
  cfg: ReturnType<typeof integratorConfig>,
): Promise<bigint> {
  if (!(cfg.fee_enabled && !s.min_fee_applied && settledMicro > 0n)) return 0n;
  let added = 0n;
  const paid = await tx.$queryRawUnsafe<Array<{ fee: string }>>(
    `SELECT coalesce(sum(fee_usd), 0)::text AS fee FROM shop_fee_ledger
      WHERE source = 'stream' AND source_ref = $1`,
    s.session_id,
  );
  const minMicro = toMicro(String(cfg.fee_min_usd));
  const total = toMicro(paid[0]?.fee ?? '0');
  if (total < minMicro) {
    await insertFee(tx, s.merchant_id, s.session_id, minMicro - total);
    added = minMicro - total;
  }
  await tx.$executeRawUnsafe(
    `UPDATE shop_stream_sessions SET min_fee_applied = true WHERE session_id = $1::uuid`,
    s.session_id,
  );
  return added;
}

/**
 * The payer withdrew and the channel is finalized on-chain: close the session. No settlement row
 * (no settle/close tx happened) and no 1.5 % (no increment); the minimum fee applies as at any close.
 */
async function recordFinalized(
  tx: ShopTx,
  s: StreamSessionRow,
  cfg: ReturnType<typeof integratorConfig>,
): Promise<{ fee_micro: bigint; closed: boolean }> {
  const n = await tx.$executeRawUnsafe(
    `UPDATE shop_stream_sessions SET status = 'closed', closed_at = now(), settle_error_since = NULL
      WHERE session_id = $1::uuid AND status = 'open'`,
    s.session_id,
  );
  if (!n) return { fee_micro: 0n, closed: false };
  const fee_micro = await applyMinimumFee(tx, s, toMicro(s.settled_usd), cfg);
  return { fee_micro, closed: true };
}

/**
 * §5.4: `execution_ledger` keeps OUR revenue — a stream settle is `shop.stream.consume` with
 * `cost_usd` = the fee. Written after the commit and never allowed to fail a settle: the row needs
 * the `tools` row and a merchant agent, and the fee ledger above is the source of truth.
 */
export async function writeStreamLedger(
  db: ShopTx,
  s: StreamSessionRow,
  fee_micro: bigint,
  payer: string | null,
): Promise<void> {
  try {
    await db.$executeRawUnsafe(
      `INSERT INTO execution_ledger
         (agent_id, tool_id, status, billing_status, cost_usd, provider_called, payer)
       SELECT m.agent_id, $2, 'success', 'PAID', $3::numeric, false, $4
         FROM shop_merchants m WHERE m.merchant_id = $1::uuid AND m.agent_id IS NOT NULL`,
      s.merchant_id,
      STREAM_TOOL_ID,
      fromMicro(fee_micro),
      payer ? payer.slice(0, 64) : null,
    );
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), channel: s.channel_id },
      'stream: execution_ledger row not written (fee ledger is the source of truth)',
    );
  }
}

const emit = (db: ShopTx, event_type: string, payload: Record<string, unknown>) =>
  db.$executeRawUnsafe(
    `INSERT INTO outbox (event_type, payload) VALUES ($1, $2::jsonb)`,
    event_type,
    JSON.stringify(payload),
  );

/**
 * ST1: a settler key that does not control the payout wallet is an operator error. Incidents are
 * written only by the incident engine, so the signal is one `shop_connect_events` row per merchant
 * and hour (no identity: CONNECT_FAILED ignores it); the engine turns it into STREAM_SETTLE_OVERDUE.
 */
export async function noteSettlerMisconfigured(
  db: ShopTx,
  slug: string,
  sku: string,
): Promise<void> {
  const path = `/api/v1/shop/m/${slug}/stream/${sku}`;
  await db.$executeRawUnsafe(
    `INSERT INTO shop_connect_events (error_code, path)
     SELECT 'stream_settler_misconfigured', $1
      WHERE NOT EXISTS (SELECT 1 FROM shop_connect_events
                         WHERE error_code = 'stream_settler_misconfigured'
                           AND path LIKE $2 AND at > now() - interval '1 hour')`,
    path,
    `/api/v1/shop/m/${slug}/stream/%`,
  );
}

/** The close of a channel by mppx (`closeOnChain` already ran inside the session handler). */
export async function recordClose(
  d: Pick<ShopDeps, 'db' | 'transaction'>,
  s: StreamSessionRow,
  ch: ChannelView,
  tx_hash: string | null,
): Promise<SettlementResult> {
  const r = await d.transaction((tx) =>
    recordSettlement(tx, s, {
      cumulative_micro: ch.highestVoucherAmount,
      tx_hash,
      submitted_by: 'apibase',
      closing: true,
    }),
  );
  await writeStreamLedger(d.db, s, r.fee_micro, ch.payer ?? null);
  return r;
}

/** A merchant (or any caller) refused a channel the store has but the shop does not: removed from the store. */
export async function discardChannel(m: Pick<StreamMethod, 'channels'>, channelId: string) {
  await m.channels.updateChannel(channelId, () => null);
}

// ---------------------------------------------------------------------------
// Job body: `shop-stream-settle` (worker, every minute)
// ---------------------------------------------------------------------------

/** The two chain reads/writes of the job; the default talks to Tempo through mppx. */
export interface StreamChain {
  /** On-chain channel state: `closeRequestedAt` (0n = no close requested) and `finalized` (payer withdrew). */
  readChannel(
    m: StreamMethod,
    s: StreamSessionRow,
  ): Promise<{ closeRequestedAt: bigint; finalized: boolean }>;
  /** `tempo.settle(store, channelId, { account })` of the highest voucher; returns the tx hash. */
  settle(m: StreamMethod, s: StreamSessionRow): Promise<string>;
}

export const mppxChain: StreamChain = {
  async readChannel(m, s) {
    const { Session } = await import('mppx/tempo');
    const client = await createStreamClient(getMppConfig());
    const onChain = await Session.Chain.getOnChainChannel(
      client as never,
      (s.escrow_contract ?? undefined) as `0x${string}`,
      s.channel_id as `0x${string}`,
    );
    return { closeRequestedAt: onChain.closeRequestedAt, finalized: onChain.finalized === true };
  },
  async settle(m, s) {
    const { tempo } = await import('mppx/server');
    const client = await createStreamClient(getMppConfig());
    return tempo.settle(m.channels, client as never, s.channel_id as `0x${string}`, {
      account: m.account as never,
      ...(s.escrow_contract ? { escrowContract: s.escrow_contract as `0x${string}` } : {}),
    });
  },
};

interface JobRow extends StreamSessionRow {
  slug: string;
  payout_wallet_tempo: string;
  stream_settler: string | null;
  min_deposit_usd: string | null;
}

export interface StreamSettleReport {
  checked: number;
  settled: number;
  failed: number;
  close_requested: number;
  finalized: number;
}

/**
 * For every open `apibase_pilot` channel: settle when `highest - settled >= $0.50`, or when an hour
 * passed since the last settle and `highest > settled`, or at once when the payer asked to close
 * on-chain (`stream.close_requested`). A failing settle stamps `settle_error_since`; an hour of
 * that is STREAM_SETTLE_OVERDUE (raised by the incident engine, one incident per channel).
 */
export async function runStreamSettle(
  d: Pick<ShopDeps, 'db' | 'transaction'>,
  nowMs: number = Date.now(),
  chain: StreamChain = mppxChain,
  cfg = integratorConfig(),
): Promise<StreamSettleReport> {
  const report: StreamSettleReport = {
    checked: 0,
    settled: 0,
    failed: 0,
    close_requested: 0,
    finalized: 0,
  };
  if (!getMppConfig().enabled) return report;
  const rows = await d.db.$queryRawUnsafe<JobRow[]>(
    `SELECT ${sessionCols('s')}, m.slug, m.payout_wallet_tempo, m.stream_settler,
            (p.stream->>'min_deposit_usd') AS min_deposit_usd
       FROM shop_stream_sessions s
       JOIN shop_merchants m ON m.merchant_id = s.merchant_id
       LEFT JOIN shop_products p ON p.merchant_id = s.merchant_id AND p.sku = s.sku
      WHERE s.status = 'open' AND s.settler_mode = 'apibase_pilot'
      ORDER BY s.opened_at LIMIT ${JOB_BATCH}`,
  );
  for (const s of rows) {
    report.checked++;
    const highest = BigInt(s.highest_voucher?.cumulativeAmount ?? '0');
    const settled = toMicro(s.settled_usd);
    const lastMs = new Date(s.last_settle_at ?? s.opened_at).getTime();
    let due =
      highest > settled &&
      (highest - settled >= SETTLE_THRESHOLD_MICRO || nowMs - lastMs >= SETTLE_INTERVAL_MS);
    let method: StreamMethod | null = null;
    const merchant: StreamMerchant = {
      merchant_id: s.merchant_id,
      slug: s.slug,
      payout_wallet_tempo: s.payout_wallet_tempo,
      stream_settler: s.stream_settler,
    };
    const terms = { rate_per_s_usd: s.rate_per_s, min_deposit_usd: s.min_deposit_usd ?? '1' };
    try {
      method = await getStreamMethod(merchant, terms);
      const oc = await chain.readChannel(method, s);
      if (oc.finalized) {
        const r = await d.transaction((tx) => recordFinalized(tx, s, cfg));
        if (r.closed) {
          if (r.fee_micro > 0n) await writeStreamLedger(d.db, s, r.fee_micro, null);
          await emit(d.db, 'stream.closed', {
            merchant_id: s.merchant_id,
            session_id: s.session_id,
            channel_id: s.channel_id,
            reason: 'finalized_on_chain',
            settled_usd: s.settled_usd,
            unsettled_usd: fromMicro(highest > settled ? highest - settled : 0n),
          });
          if (highest > settled) {
            logger.warn(
              { channel: s.channel_id, unsettled_micro: (highest - settled).toString() },
              'stream: channel finalized on-chain with unsettled vouchers',
            );
          }
          report.finalized++;
        }
        continue;
      }
      if (!s.close_requested_at && oc.closeRequestedAt !== 0n) {
        await d.db.$executeRawUnsafe(
          `UPDATE shop_stream_sessions SET close_requested_at = now() WHERE session_id = $1::uuid`,
          s.session_id,
        );
        await emit(d.db, 'stream.close_requested', {
          merchant_id: s.merchant_id,
          session_id: s.session_id,
          channel_id: s.channel_id,
        });
        report.close_requested++;
      }
      if (s.close_requested_at || oc.closeRequestedAt !== 0n) due = highest > settled;
      if (!due) continue;
      const tx_hash = await chain.settle(method, s);
      const r = await d.transaction((tx) =>
        recordSettlement(
          tx,
          s,
          { cumulative_micro: highest, tx_hash, submitted_by: 'apibase', closing: false },
          cfg,
        ),
      );
      await writeStreamLedger(d.db, s, r.fee_micro, null);
      report.settled++;
    } catch (err) {
      report.failed++;
      logger.error(
        { err: err instanceof Error ? err.message : String(err), channel: s.channel_id },
        'stream: settle failed',
      );
      await d.db.$executeRawUnsafe(
        `UPDATE shop_stream_sessions SET settle_error_since = COALESCE(settle_error_since, now())
          WHERE session_id = $1::uuid`,
        s.session_id,
      );
    }
  }
  return report;
}
