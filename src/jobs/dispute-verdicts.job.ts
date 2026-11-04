import { createPublicClient, decodeEventLog, parseAbiItem, type Hex } from 'viem';
import { base } from 'viem/chains';
import { getDisputeEnv, getRefundEnv } from '../config/env';
import { logger } from '../config/logger';
import { getX402Config } from '../config/x402.config';
import { baseTransport } from '../payments/base-transport';
import {
  runDisputeVerdicts,
  type DisputeCfg,
  type Facts,
  type FlagRow,
  type GlPort,
  type GlTarget,
  type RunSummary,
  type VerdictRow,
  type WorkerDeps,
  type WorkerStore,
} from '../payments/dispute-worker';
import { capUsdToAtomic, REFUND_WINDOW_HOURS, type ClaimType } from '../payments/dispute-rules';
import { genCall, type GenReadClient } from '../genlayer/gen-call';
import {
  makeReadClient,
  makeWriteClient,
  sendWrite,
  type GenWriteClient,
} from '../genlayer/gen-client';
import { getPrisma } from '../services/prisma.service';
import { ensureRedisConnected } from '../services/redis.service';
import { pgReceiptStore } from '../services/public-receipt.service';
import { receiptIndexForTx } from '../services/receipt-index.service';
import { recordRefundOwed } from '../services/refund-ledger.service';

/**
 * A-GD-01: wiring of the dispute verdict lane (src/payments/dispute-worker.ts) to Postgres, Base and
 * GenLayer. Runs every 10 minutes in the worker under a Redis single-flight lock. GL_DISPUTE_CONTRACT
 * unset -> the lane is off (one log line, no crash).
 */

const LOCK_KEY = 'dispute:verdicts:run';
const LOCK_TTL_S = 600;
/** A billed 5xx receipt is flagged only once it is this old (the settle has had time to land). */
const FLAG_MIN_AGE_MIN = 10;
const FLAG_LOOKBACK_DAYS = 30;

type Row = Record<string, unknown>;

export function disputeCfgFromEnv(source: NodeJS.ProcessEnv = process.env): DisputeCfg {
  const d = getDisputeEnv(source);
  const r = getRefundEnv(source);
  return {
    receiptContract: d.GL_DISPUTE_CONTRACT.trim(),
    paymentContract: d.GL_DISPUTE_PAYMENT_CONTRACT.trim(),
    confirm: d.GL_DISPUTE_CONFIRM.trim() === '1',
    hasKey: /^0x[0-9a-fA-F]{64}$/.test(d.GL_DISPUTE_KEY.trim()),
    perRefundAtomic: capUsdToAtomic(r.REFUND_PAYER_RUN_CAP_USD),
    payee: getX402Config().paymentAddress.toLowerCase(),
    refundWindowHours: REFUND_WINDOW_HOURS,
  };
}

function makePort(source: NodeJS.ProcessEnv = process.env): GlPort {
  const d = getDisputeEnv(source);
  const addr = (t: GlTarget) =>
    (t === 'receipt' ? d.GL_DISPUTE_CONTRACT : d.GL_DISPUTE_PAYMENT_CONTRACT).trim();
  let read: Promise<GenReadClient> | null = null;
  let writer: Promise<GenWriteClient> | null = null;
  return {
    call: async (target, fn, args) => {
      read ??= makeReadClient(d.GL_DISPUTE_RPC_URL);
      return genCall(await read, addr(target), fn, args, 15_000);
    },
    send: async (target, fn, args) => {
      writer ??= makeWriteClient(d.GL_DISPUTE_RPC_URL, d.GL_DISPUTE_KEY.trim());
      return sendWrite(await writer, addr(target), fn, args);
    },
  };
}

const TRANSFER = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

export function makeFacts(): Facts {
  const x = getX402Config();
  const client = createPublicClient({ chain: base, transport: baseTransport(x) });
  return {
    receiptBody: (id) => pgReceiptStore.get(id),
    index: (tx) => receiptIndexForTx(tx),
    async baseTx(tx) {
      let rc;
      try {
        rc = await client.getTransactionReceipt({ hash: tx as Hex });
      } catch (e) {
        if (/not.?found|could not be found/i.test(String((e as Error).message))) return null;
        throw e;
      }
      const usdc = x.usdcAddress.toLowerCase();
      const transfers = rc.logs
        .filter((l) => l.address.toLowerCase() === usdc)
        .flatMap((l) => {
          try {
            const ev = decodeEventLog({ abi: [TRANSFER], data: l.data, topics: l.topics });
            const a = ev.args as unknown as { from: string; to: string; value: bigint };
            return [{ from: a.from, to: a.to, value_atomic: a.value.toString() }];
          } catch {
            return [];
          }
        });
      return { status: rc.status === 'success' ? 1 : 0, transfers };
    },
  };
}

export function makePrismaStore(): WorkerStore {
  const db = () => getPrisma();
  return {
    async judged(ids) {
      if (ids.length === 0) return new Set();
      const r = await db().$queryRawUnsafe<Row[]>(
        `SELECT dispute_id FROM dispute_verdicts
          WHERE dispute_id = ANY($1::text[]) AND outcome <> 'over_cap'`,
        ids,
      );
      return new Set(r.map((x) => String(x.dispute_id)));
    },
    async overCapIds(ids) {
      if (ids.length === 0) return new Set();
      const r = await db().$queryRawUnsafe<Row[]>(
        `SELECT dispute_id FROM dispute_verdicts
          WHERE dispute_id = ANY($1::text[]) AND outcome = 'over_cap'`,
        ids,
      );
      return new Set(r.map((x) => String(x.dispute_id)));
    },
    async saveVerdict(v: VerdictRow) {
      await db().$executeRawUnsafe(
        `INSERT INTO dispute_verdicts
           (dispute_id, claim, verdict, payment_tx, receipt_id, outcome, detail, refund_id, confirm_state)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::uuid,$9)
         ON CONFLICT (dispute_id) DO UPDATE SET
           outcome = EXCLUDED.outcome, detail = EXCLUDED.detail, refund_id = EXCLUDED.refund_id,
           confirm_state = EXCLUDED.confirm_state, judged_at = now()
           WHERE dispute_verdicts.outcome = 'over_cap'`,
        v.dispute_id,
        v.claim,
        v.verdict,
        v.payment_tx,
        v.receipt_id,
        v.outcome,
        JSON.stringify(v.detail),
        v.refund_id,
        v.outcome === 'booked' ? 'pending' : 'none',
      );
    },
    async refundExistsFor(paymentTx, receiptId) {
      const r = await db().$queryRawUnsafe<Row[]>(
        `SELECT 1 FROM refund_ledger
          WHERE status <> 'cancelled'
            AND (($1::text IS NOT NULL AND original_tx = $1) OR ($2::text IS NOT NULL AND receipt_id = $2))
          LIMIT 1`,
        paymentTx,
        receiptId,
      );
      return r.length > 0;
    },
    async bookedFor(disputeId) {
      const r = await db().$queryRawUnsafe<Row[]>(
        `SELECT refund_id::text AS refund_id FROM refund_ledger
          WHERE source_kind = 'request' AND source_id = $1 LIMIT 1`,
        disputeId,
      );
      return r[0] ? String(r[0].refund_id) : null;
    },
    async otherBookedVerdict(paymentTx, disputeId) {
      const r = await db().$queryRawUnsafe<Row[]>(
        `SELECT dispute_id FROM dispute_verdicts
          WHERE payment_tx = $1 AND outcome = 'booked' AND dispute_id <> $2 LIMIT 1`,
        paymentTx,
        disputeId,
      );
      return r[0] ? String(r[0].dispute_id) : null;
    },
    async book(row) {
      await recordRefundOwed(row);
    },
    async confirmable() {
      const r = await db().$queryRawUnsafe<Row[]>(
        `SELECT v.dispute_id, v.claim FROM dispute_verdicts v
           JOIN refund_ledger l ON l.refund_id = v.refund_id
          WHERE v.outcome = 'booked' AND v.confirm_state = 'pending' AND l.status = 'sent'
          ORDER BY v.judged_at LIMIT 20`,
      );
      return r.map((x) => ({ dispute_id: String(x.dispute_id), claim: String(x.claim) }));
    },
    async setConfirm(disputeId, state, detail) {
      await db().$executeRawUnsafe(
        `UPDATE dispute_verdicts SET confirm_state = $2,
           detail = detail || jsonb_build_object('confirm', $3::text) WHERE dispute_id = $1`,
        disputeId,
        state,
        detail ?? state,
      );
    },
    async overdue(hours) {
      const r = await db().$queryRawUnsafe<Row[]>(
        `SELECT v.dispute_id FROM dispute_verdicts v
           LEFT JOIN refund_ledger l ON l.refund_id = v.refund_id
          WHERE v.outcome = 'booked' AND (l.refund_id IS NULL OR l.status = 'cancelled')
            AND v.judged_at < now() - make_interval(hours => $1::int)
            AND NOT (v.detail ? 'overdue_alerted') LIMIT 20`,
        hours,
      );
      return r.map((x) => String(x.dispute_id));
    },
    async markOverdueAlerted(disputeId) {
      await db().$executeRawUnsafe(
        `UPDATE dispute_verdicts SET detail = detail || '{"overdue_alerted":true}'::jsonb WHERE dispute_id = $1`,
        disputeId,
      );
    },
    async newReceiptFlags() {
      // The flag line (with its time) is written BEFORE any filing transaction. Only receipts that
      // are already billed with an upstream 5xx are flagged; no call is made to fail.
      return db().$executeRawUnsafe(
        `INSERT INTO dispute_flags (claim, subject, flag_line)
         SELECT 'upstream_failed_but_billed', r.receipt_id,
                'billed receipt with upstream_status ' || (r.body::jsonb ->> 'upstream_status')
                  || ' issued_at ' || (r.body::jsonb ->> 'issued_at')
           FROM public_receipts r
          WHERE (r.body::jsonb ->> 'rail') = 'x402-base'
            AND (r.body::jsonb ->> 'billed') = 'true'
            AND (r.body::jsonb ->> 'upstream_status') ~ '^[0-9]+$'
            AND (r.body::jsonb ->> 'upstream_status')::int >= 500
            AND r.created_at < now() - make_interval(mins => $1::int)
            AND r.created_at > now() - make_interval(days => $2::int)
         ON CONFLICT (claim, subject) DO NOTHING`,
        FLAG_MIN_AGE_MIN,
        FLAG_LOOKBACK_DAYS,
      );
    },
    async unfiledFlags() {
      const r = await db().$queryRawUnsafe<Row[]>(
        `SELECT flag_id::text AS flag_id, claim, subject FROM dispute_flags
          WHERE filed_tx IS NULL AND error IS NULL ORDER BY flagged_at LIMIT 10`,
      );
      return r.map((x): FlagRow => ({
        flag_id: String(x.flag_id),
        claim: x.claim as ClaimType,
        subject: String(x.subject),
      }));
    },
    async markFiled(flagId, filedTx) {
      await db().$executeRawUnsafe(
        `UPDATE dispute_flags SET filed_tx = $2, filed_at = now() WHERE flag_id = $1::uuid`,
        flagId,
        filedTx,
      );
    },
    async markFileError(flagId, error) {
      await db().$executeRawUnsafe(
        `UPDATE dispute_flags SET error = $2 WHERE flag_id = $1::uuid`,
        flagId,
        error,
      );
    },
    async alert(kind, payload) {
      try {
        await db().outbox.create({
          data: { event_type: 'refund_alert', payload: { kind, ...payload } as object },
        });
      } catch (e) {
        logger.error({ err: String(e), kind }, 'dispute alert outbox write failed');
      }
    },
  };
}

/**
 * Flag a payment that reached the payee wallet without a receipt (called by a chain-side watcher).
 * The flag line is stored before the filing; the worker files it on its next pass.
 */
export async function flagPaymentWithoutReceipt(tx: string, flagLine: string): Promise<void> {
  await getPrisma().$executeRawUnsafe(
    `INSERT INTO dispute_flags (claim, subject, flag_line) VALUES ('paid_without_receipt', $1, $2)
     ON CONFLICT (claim, subject) DO NOTHING`,
    tx.toLowerCase(),
    flagLine,
  );
}

export async function runDisputeVerdictsSafe(): Promise<RunSummary | null> {
  const cfg = disputeCfgFromEnv();
  if (!cfg.receiptContract && !cfg.paymentContract) {
    logger.info({}, 'dispute verdict lane disabled: no GL_DISPUTE_*CONTRACT is set');
    return null;
  }
  let redis;
  try {
    redis = await ensureRedisConnected();
  } catch (e) {
    logger.warn({ err: String(e) }, 'dispute verdicts: redis unavailable, run skipped');
    return null;
  }
  const got = await redis.set(LOCK_KEY, String(process.pid), 'EX', LOCK_TTL_S, 'NX');
  if (got !== 'OK') return null;
  try {
    const deps: WorkerDeps = {
      cfg,
      gl: makePort(),
      facts: makeFacts(),
      store: makePrismaStore(),
      log: (level, msg, extra) => logger[level](extra ?? {}, msg),
    };
    const summary = await runDisputeVerdicts(deps);
    logger.info({ ...summary }, 'dispute verdict pass done');
    return summary;
  } catch (e) {
    logger.error({ err: String(e) }, 'dispute verdict run failed');
    return null;
  } finally {
    await redis.del(LOCK_KEY).catch(() => undefined);
  }
}
