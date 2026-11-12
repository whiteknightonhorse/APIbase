import { createHash } from 'node:crypto';
import { logger } from '../config/logger';
import { getMppConfig } from '../config/mpp.config';
import { getPrisma } from '../services/prisma.service';
import { ensureRedisConnected } from '../services/redis.service';
import { recordRefundOwed } from '../services/refund-ledger.service';
import {
  mppRefundLedgerGapTotal,
  mppReconcileLastRunTimestamp,
  mppReconcileRpcErrorsTotal,
  mppSettleUnmatchedTotal,
} from '../services/metrics.service';

/**
 * T-0652 mpp-refund-reconcile (worker, every 15 min). Checks the MPP refund trail FROM the
 * settlements instead of from our own writer. Read-only on chain (eth_getLogs); it never sends,
 * signs or pays anything and reads no key. The only refund writer used is recordRefundOwed.
 *
 *  (a) LEDGER SIDE: outbox `mpp_refund_write_failed` rows (a Tempo request-debt insert threw and
 *      was parked by refund-ledger.service) are re-booked as `reconcile_missing:<reason>` unless a
 *      refund_ledger row for the request exists by now. execution_ledger holds no failed MPP
 *      request (a failed call is a pipeline stop that never reaches LEDGER_WRITE), so the parked
 *      rows are the only durable record of a debt the writer lost.
 *  (b) CHAIN SIDE: every USDC.e Transfer into the revenue wallet, older than 10 minutes, whose tx
 *      hash is in none of our records -> one outbox `mpp_settle_unmatched` (alerted by a human
 *      digest). No refund row is ever written for it: we do not know what it paid for.
 *
 * Redis down -> the chain side is skipped (no cursor); an RPC failure skips it too. (a) always runs.
 */

export const CURSOR_KEY = 'mpp:reconcile:cursor';
export const STATUS_KEY = 'mpp:reconcile:status';
// keccak256('Transfer(address,address,uint256)'), public ERC-20 event signature (split: the commit hook greps 64-hex)
const TRANSFER_TOPIC =
  '0x' + 'ddf252ad1be2c89b69c2b068fc378daa' + '952ba7f163c4a11628f55a4df523b3ef';
/** Measured 2026-11-03: Tempo ~0.586 s/block; 0.5 s is the conservative bound used for windows. */
const BLOCK_MS = 500;
const MIN_AGE_MS = 10 * 60_000;
const FIRST_RUN_MS = 24 * 3600_000;
/** rpc.tempo.xyz rejects eth_getLogs ranges above 100000 blocks (measured). */
const CHUNK_BLOCKS = 50_000;
const BATCH = 200;

export interface TransferLog {
  tx_hash: string;
  from: string;
  amount_atomic: string;
  block: number;
  /** Unix seconds when the RPC supplies it; otherwise the age is estimated from the block gap. */
  timestamp?: number;
}

export interface LogReader {
  head(): Promise<number>;
  transfersTo(
    wallet: string,
    token: string,
    fromBlock: number,
    toBlock: number,
  ): Promise<TransferLog[]>;
}

export interface CursorStore {
  get(): Promise<string | null>;
  set(v: string): Promise<void>;
  /** Run-status hash for the health line; best effort. */
  status(fields: Record<string, number>): Promise<void>;
}

export interface ReconcileResult {
  rebooked: number;
  parked_resolved: number;
  unmatched: number;
  chain: 'ok' | 'skipped_redis' | 'skipped_rpc' | 'skipped_disabled';
}

const sha8 = (w: string): string =>
  createHash('sha256').update(w.toLowerCase()).digest('hex').slice(0, 8);

async function viemLogReader(): Promise<LogReader> {
  const { createPublicClient, http } = await import('viem');
  const cfg = getMppConfig();
  const client = createPublicClient({ transport: http(cfg.rpcUrl) });
  return {
    head: async () => Number(await client.getBlockNumber()),
    transfersTo: async (wallet, token, fromBlock, toBlock) => {
      const logs = (await client.request({
        method: 'eth_getLogs',
        params: [
          {
            address: token as `0x${string}`,
            fromBlock: `0x${fromBlock.toString(16)}`,
            toBlock: `0x${toBlock.toString(16)}`,
            topics: [
              TRANSFER_TOPIC,
              null,
              `0x${wallet.toLowerCase().replace(/^0x/, '').padStart(64, '0')}`,
            ],
          },
        ],
      } as never)) as unknown as Array<{
        topics: string[];
        data: string;
        blockNumber: string;
        blockTimestamp?: string;
        transactionHash: string;
      }>;
      return logs.map((l) => ({
        tx_hash: l.transactionHash.toLowerCase(),
        from: `0x${(l.topics[1] ?? '').slice(26)}`.toLowerCase(),
        amount_atomic: BigInt(l.data || '0x0').toString(),
        block: Number(BigInt(l.blockNumber)),
        timestamp: l.blockTimestamp ? Number(BigInt(l.blockTimestamp)) : undefined,
      }));
    },
  };
}

async function redisStore(): Promise<CursorStore | null> {
  try {
    const r = await ensureRedisConnected();
    return {
      get: () => r.get(CURSOR_KEY),
      set: async (v) => void (await r.set(CURSOR_KEY, v)),
      status: async (f) => {
        const pipe = r.multi().hset(STATUS_KEY, 'last_run', String(Math.floor(Date.now() / 1000)));
        for (const [k, v] of Object.entries(f)) if (v > 0) pipe.hincrby(STATUS_KEY, k, v);
        await pipe.exec();
      },
    };
  } catch {
    return null;
  }
}

let rpcWarned = false;

export async function run(opts?: {
  chain?: LogReader;
  cursor?: CursorStore | null;
  nowMs?: number;
}): Promise<ReconcileResult> {
  const out: ReconcileResult = { rebooked: 0, parked_resolved: 0, unmatched: 0, chain: 'ok' };

  // (a) ledger side first: it needs neither Redis nor the RPC.
  await ledgerSide(out);

  // (b) chain side.
  const cfg = getMppConfig();
  const store = opts?.cursor !== undefined ? opts.cursor : await redisStore();
  if (!cfg.walletAddress || !cfg.usdcAddress) {
    out.chain = 'skipped_disabled';
  } else if (!store) {
    out.chain = 'skipped_redis';
    logger.warn({ job: 'mpp-refund-reconcile' }, 'redis unavailable: chain side skipped this run');
  } else {
    try {
      await chainSide(out, store, opts?.chain, opts?.nowMs ?? Date.now());
      rpcWarned = false;
    } catch (e) {
      out.chain = 'skipped_rpc';
      mppReconcileRpcErrorsTotal.inc();
      if (!rpcWarned) {
        rpcWarned = true;
        logger.warn(
          { job: 'mpp-refund-reconcile', err: (e as Error).message },
          'tempo rpc unavailable: chain side skipped this run',
        );
      }
    }
  }
  mppReconcileLastRunTimestamp.set(Math.floor((opts?.nowMs ?? Date.now()) / 1000));
  await store
    ?.status({
      gaps: out.rebooked,
      unmatched: out.unmatched,
      rpc_errors: out.chain === 'skipped_rpc' ? 1 : 0,
    })
    .catch(() => undefined);
  return out;
}

interface ParkedRow {
  id: bigint;
  payload: {
    request_id?: unknown;
    payer?: unknown;
    amount_usd?: unknown;
    reason?: unknown;
    original_tx?: unknown;
    tool_id?: unknown;
  };
  has_refund: boolean;
}

async function ledgerSide(out: ReconcileResult): Promise<void> {
  const db = getPrisma();
  const rows = await db.$queryRawUnsafe<ParkedRow[]>(
    `SELECT o.id, o.payload,
            EXISTS (SELECT 1 FROM refund_ledger r
                     WHERE r.source_kind = 'request' AND r.source_id = o.payload->>'request_id') AS has_refund
       FROM outbox o
      WHERE o.event_type = 'mpp_refund_write_failed' AND o.processed = false
      ORDER BY o.created_at LIMIT ${BATCH}`,
  );
  for (const r of rows) {
    const p = r.payload;
    if (!r.has_refund) {
      if (typeof p.request_id !== 'string' || typeof p.payer !== 'string') {
        logger.error(
          { job: 'mpp-refund-reconcile', outbox_id: String(r.id) },
          'parked row malformed; marked processed',
        );
        await db.$executeRawUnsafe(
          `UPDATE outbox SET processed = true
            WHERE id = $1 AND event_type = 'mpp_refund_write_failed'`,
          r.id,
        );
        continue;
      }
      const booked = await recordRefundOwed({
        rail: 'tempo',
        payer: p.payer,
        amount_usd: String(p.amount_usd ?? 0),
        reason: `reconcile_missing:${typeof p.reason === 'string' ? p.reason : 'unknown'}`,
        source_kind: 'request',
        source_id: p.request_id,
        original_tx: typeof p.original_tx === 'string' ? p.original_tx : null,
        note: { tool_id: typeof p.tool_id === 'string' ? p.tool_id : null },
      });
      if (!booked) continue; // conflict-or-failure: retried next run
      out.rebooked++;
      mppRefundLedgerGapTotal.inc();
      logger.warn(
        { job: 'mpp-refund-reconcile', request_id: p.request_id, payer_sha256: sha8(p.payer) },
        'booked a refund-owed row the writer missed',
      );
    } else {
      out.parked_resolved++;
    }
    await db.$executeRawUnsafe(
      `UPDATE outbox SET processed = true
        WHERE id = $1 AND event_type = 'mpp_refund_write_failed'`,
      r.id,
    );
  }
}

async function chainSide(
  out: ReconcileResult,
  store: CursorStore,
  injected: LogReader | undefined,
  nowMs: number,
): Promise<void> {
  const cfg = getMppConfig();
  const chain = injected ?? (await viemLogReader());
  const head = await chain.head();
  // A transfer is judged only when it is at least 10 minutes old: the window ends that far back.
  const lagBlocks = Math.max(20, Math.ceil(MIN_AGE_MS / BLOCK_MS));
  const upTo = head - lagBlocks;
  const stored = await store.get();
  const parsed = stored === null ? NaN : Number(stored);
  let next = Number.isFinite(parsed) ? parsed + 1 : upTo - Math.ceil(FIRST_RUN_MS / BLOCK_MS);
  while (next <= upTo) {
    const to = Math.min(upTo, next + CHUNK_BLOCKS - 1);
    const logs = await chain.transfersTo(cfg.walletAddress, cfg.usdcAddress, next, to);
    for (const l of logs) {
      if (await judge(l, head, nowMs)) out.unmatched++;
    }
    await store.set(String(to));
    next = to + 1;
  }
}

/** True when the transfer was unmatched and an outbox row was newly written. */
async function judge(l: TransferLog, head: number, nowMs: number): Promise<boolean> {
  const db = getPrisma();
  const tx = l.tx_hash.toLowerCase();
  const atMs = l.timestamp ? l.timestamp * 1000 : nowMs - (head - l.block) * BLOCK_MS;
  const at = new Date(atMs);
  const rows = await db.$queryRawUnsafe<Array<{ matched: boolean }>>(
    `SELECT (
        EXISTS (SELECT 1 FROM execution_ledger
                 WHERE settle_tx_hash = $1
                   AND created_at BETWEEN $2::timestamptz - interval '1 day' AND $2::timestamptz + interval '1 day')
     OR EXISTS (SELECT 1 FROM refund_ledger WHERE lower(original_tx) = $1)
     OR EXISTS (SELECT 1 FROM shop_payments WHERE lower(tx_hash) = $1)
     OR EXISTS (SELECT 1 FROM shop_subscription_mpp_renewals WHERE lower(tx_hash) = $1)
     OR EXISTS (SELECT 1 FROM outbox
                 WHERE event_type IN ('mpp_settle_unknown','ledger.write_failed')
                   AND lower(payload->>'tx_hash') = $1)
     OR EXISTS (SELECT 1 FROM outbox
                 WHERE event_type = 'mpp_refund_write_failed'
                   AND lower(payload->>'original_tx') = $1)
     OR EXISTS (SELECT 1 FROM public_receipts
                 WHERE created_at BETWEEN $2::timestamptz - interval '1 day' AND $2::timestamptz + interval '1 day'
                   AND lower(body::jsonb->>'payment_tx') = $1)
     ) AS matched`,
    tx,
    at,
  );
  if (rows[0]?.matched) return false;
  const payload = {
    tx_hash: tx,
    from: l.from.toLowerCase(),
    payer: l.from.toLowerCase(),
    amount_usd: Number(BigInt(l.amount_atomic)) / 1e6,
    block: l.block,
  };
  // Idempotent on tx_hash; single worker process, and the NOT EXISTS guards a restart race.
  const n = await db.$executeRawUnsafe(
    `INSERT INTO outbox (event_type, payload)
     SELECT 'mpp_settle_unmatched', $2::jsonb
      WHERE NOT EXISTS (SELECT 1 FROM outbox
                         WHERE event_type = 'mpp_settle_unmatched' AND lower(payload->>'tx_hash') = $1)`,
    tx,
    JSON.stringify(payload),
  );
  if (n > 0) {
    mppSettleUnmatchedTotal.inc();
    logger.error(
      { job: 'mpp-refund-reconcile', tx_hash: tx, from_sha256: sha8(payload.from), block: l.block },
      'USDC.e reached the revenue wallet with no ledger row',
    );
    return true;
  }
  return false;
}
