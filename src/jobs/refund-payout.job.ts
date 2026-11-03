import { existsSync } from 'node:fs';
import { privateKeyToAccount } from 'viem/accounts';
import { getRefundEnv } from '../config/env';
import { config } from '../config';
import { logger } from '../config/logger';
import { getPrisma } from '../services/prisma.service';
import { ensureRedisConnected } from '../services/redis.service';
import {
  refundAlertsTotal,
  refundLedgerOwedRows,
  refundLedgerOwedUsd,
  refundPayoutFeeUsd,
  refundPayoutLastRunTimestamp,
  refundPayoutsTotal,
  refundWalletBalanceUsd,
} from '../services/metrics.service';
import { evaluateKeys, type RailKey } from '../refunds/refund-keys';
import { makeBaseChain, makeTempoChain } from '../refunds/refund-chains';
import {
  recoverPayouts,
  runPayout,
  toMicro,
  usd,
  type Batch,
  type Deps,
  type OwedRow,
  type Payout,
  type Rail,
  type RailChain,
  type RefundCfg,
  type RunSummary,
  type Store,
} from '../refunds/refund-payout.core';

/**
 * T-0553 weekly refund payout job (REFUND_PAYOUT_CRON, default Monday 07:00 UTC).
 * Ships disabled: REFUND_PAYOUT_ENABLED=false and REFUND_PAYOUT_DRY_RUN=true by default.
 * Single-flight through the Redis lock `refund:payout:run` (1 h).
 */

const LOCK_KEY = 'refund:payout:run';
const LOCK_TTL_S = 3600;
const LAST_RUN_KEY = 'refund:payout:last_run';

type Row = Record<string, unknown>;

function toPayout(r: Row): Payout {
  return {
    payout_id: String(r.payout_id),
    rail: r.rail as Rail,
    payer: String(r.payer),
    micro: toMicro(String(r.amount_usd)),
    status: r.status as Payout['status'],
    nonce: (r.nonce as string | null) ?? null,
    tx_hash: (r.tx_hash as string | null) ?? null,
    raw_tx: (r.raw_tx as string | null) ?? null,
    valid_before: r.valid_before ? new Date(r.valid_before as string) : null,
    fee_usd_est: Number(r.fee_usd_est ?? 0),
    created_at: new Date(r.created_at as string),
  };
}

export function makePrismaStore(): Store {
  const db = () => getPrisma();
  return {
    async owedRows(rail) {
      const rows = await db().$queryRaw<Row[]>`
        SELECT refund_id::text AS refund_id, payer, amount_usd::text AS amount_usd, detected_at
          FROM refund_ledger WHERE status = 'owed' AND rail = ${rail} ORDER BY detected_at`;
      return rows.map((r): OwedRow => ({
        refund_id: String(r.refund_id),
        rail,
        payer: String(r.payer),
        micro: toMicro(String(r.amount_usd)),
        detected_at: new Date(r.detected_at as string),
      }));
    },
    async sentMicroSince(since) {
      const r = await db().$queryRaw<Row[]>`
        SELECT COALESCE(SUM(amount_usd), 0)::text AS s FROM refund_payouts
         WHERE status = 'sent' AND sent_at >= ${since}`;
      return toMicro(String(r[0]?.s ?? '0'));
    },
    async createPayout(b: Batch, rail, feeUsd) {
      return db()
        .$transaction(async (tx) => {
          const ins = await tx.$queryRaw<Row[]>`
          INSERT INTO refund_payouts (rail, payer, amount_usd, status, fee_usd_est)
          VALUES (${rail}, ${b.payer}, ${usd(b.micro).toFixed(6)}::numeric, 'signing', ${feeUsd}::numeric)
          RETURNING payout_id::text AS payout_id, rail, payer, amount_usd::text AS amount_usd, status,
                    nonce, tx_hash, raw_tx, valid_before, fee_usd_est::text AS fee_usd_est, created_at`;
          const p = toPayout(ins[0]);
          const n = await tx.$executeRaw`
          UPDATE refund_ledger SET status = 'scheduled', payout_id = ${p.payout_id}::uuid
           WHERE status = 'owed' AND rail = ${rail} AND refund_id = ANY(${b.rowIds}::uuid[])`;
          if (n !== b.rowIds.length) throw new RowsNotOwed();
          return p;
        })
        .catch((e) => {
          if (e instanceof RowsNotOwed) return null;
          throw e;
        });
    },
    async payoutRowPayers(payoutId) {
      const r = await db().$queryRaw<Row[]>`
        SELECT DISTINCT payer FROM refund_ledger WHERE payout_id = ${payoutId}::uuid`;
      return r.map((x) => String(x.payer));
    },
    async livePayouts() {
      const r = await db().$queryRaw<Row[]>`
        SELECT payout_id::text AS payout_id, rail, payer, amount_usd::text AS amount_usd, status, nonce,
               tx_hash, raw_tx, valid_before, fee_usd_est::text AS fee_usd_est, created_at
          FROM refund_payouts WHERE status IN ('signing','signed','broadcast') ORDER BY created_at`;
      return r.map(toPayout);
    },
    async patch(id, p) {
      await db().$executeRaw`
        UPDATE refund_payouts SET
          status = COALESCE(${p.status ?? null}, status),
          nonce = COALESCE(${p.nonce ?? null}, nonce),
          tx_hash = COALESCE(${p.tx_hash ?? null}, tx_hash),
          raw_tx = COALESCE(${p.raw_tx ?? null}, raw_tx),
          valid_before = COALESCE(${p.valid_before ?? null}, valid_before),
          error = COALESCE(${p.error ?? null}, error)
        WHERE payout_id = ${id}::uuid`;
    },
    async markSent(id, txHash) {
      await db().$transaction([
        db().$executeRaw`UPDATE refund_payouts SET status = 'sent', sent_at = now(),
          tx_hash = COALESCE(${txHash}, tx_hash) WHERE payout_id = ${id}::uuid`,
        db()
          .$executeRaw`UPDATE refund_ledger SET status = 'sent', refund_tx = ${txHash}, sent_at = now()
          WHERE payout_id = ${id}::uuid AND status = 'scheduled'`,
      ]);
    },
    async release(id, status, error) {
      await db().$transaction([
        db().$executeRaw`UPDATE refund_payouts SET status = ${status}, error = ${error}
          WHERE payout_id = ${id}::uuid`,
        db().$executeRaw`UPDATE refund_ledger SET status = 'owed', payout_id = NULL
          WHERE payout_id = ${id}::uuid AND status = 'scheduled'`,
      ]);
    },
    async writeOutbox(eventType, payload) {
      await db().outbox.create({ data: { event_type: eventType, payload: payload as object } });
    },
  };
}

class RowsNotOwed extends Error {}

export function cfgFromEnv(source: NodeJS.ProcessEnv = process.env): RefundCfg {
  const e = getRefundEnv(source);
  return {
    enabled: e.REFUND_PAYOUT_ENABLED,
    dryRun: e.REFUND_PAYOUT_DRY_RUN,
    minPayoutUsd: e.REFUND_MIN_PAYOUT_USD,
    feeMultiple: e.REFUND_FEE_MULTIPLE,
    runCapUsd: e.REFUND_RUN_CAP_USD,
    periodCapUsd: e.REFUND_PERIOD_CAP_USD,
    payerRunCapUsd: e.REFUND_PAYER_RUN_CAP_USD,
    ceilingUsd: e.REFUND_WALLET_CEILING_USD,
    lowBalanceUsd: e.REFUND_LOW_BALANCE_USD,
    carryMaxDays: e.REFUND_CARRY_MAX_DAYS,
  };
}

/** Addresses the refund wallets must differ from: operator gas wallet and the revenue wallets. */
function forbiddenAddresses(): string[] {
  const out: string[] = [];
  const derive = (k: string) => {
    try {
      return /^0x[0-9a-fA-F]{64}$/.test(k) ? privateKeyToAccount(k as `0x${string}`).address : '';
    } catch {
      return '';
    }
  };
  out.push(derive(config.X402_OPERATOR_PRIVATE_KEY), derive(config.TEMPO_PRIVATE_KEY));
  out.push(
    config.TEMPO_WALLET_ADDRESS,
    String((config as Record<string, unknown>).X402_PAYMENT_ADDRESS ?? ''),
  );
  return out.filter(Boolean);
}

const log: Deps['log'] = (level, msg, extra) => logger[level](extra ?? {}, msg);

export function currentKeys(): Record<Rail, RailKey> {
  return evaluateKeys({ forbidden: forbiddenAddresses(), log });
}

async function emitKeyAlerts(keys: Record<Rail, RailKey>, store: Store): Promise<void> {
  for (const rail of ['base', 'tempo'] as const) {
    const k = keys[rail];
    if (k.state !== 'mismatch') continue;
    refundAlertsTotal.inc({ kind: 'refund_wallet_key_mismatch', rail });
    logger.error(
      { rail, reason: k.reason },
      'refund_wallet_key_mismatch: payouts disabled for this rail',
    );
    try {
      await store.writeOutbox('refund_alert', {
        kind: 'refund_wallet_key_mismatch',
        rail,
        severity: 'critical',
        reason: k.reason ?? 'unknown',
      });
    } catch (e) {
      logger.error({ err: String(e) }, 'refund key-mismatch outbox write failed');
    }
  }
}

function buildDeps(keys: Record<Rail, RailKey>, store: Store): Deps {
  const cfg = cfgFromEnv();
  const killFile = getRefundEnv().REFUND_PAYOUT_KILL_FILE;
  const chains: Record<Rail, RailChain> = {
    base: lazyChain('base', keys.base.address, makeBaseChain),
    tempo: lazyChain('tempo', keys.tempo.address, makeTempoChain),
  };
  return {
    cfg,
    store,
    chains,
    keyState: { base: keys.base.state, tempo: keys.tempo.state },
    killed: () => !cfg.enabled || existsSync(killFile) || !getRefundEnv().REFUND_PAYOUT_ENABLED,
    now: () => new Date(),
    log,
    metrics: {
      payout: (rail, result) => refundPayoutsTotal.inc({ rail, result }),
      fee: (rail, v) => refundPayoutFeeUsd.observe({ rail }, v),
      balance: (rail, v) => refundWalletBalanceUsd.set({ rail }, v),
      alert: (kind, rail) => refundAlertsTotal.inc({ kind, rail: rail ?? 'none' }),
    },
  };
}

/** Chain ports are built on first use so a rail without a key never touches an RPC. */
function lazyChain(rail: Rail, address: string | null, make: (a: string) => RailChain): RailChain {
  let c: RailChain | null = null;
  const get = (): RailChain => {
    if (!address) throw new Error(`refund wallet ${rail}: no address`);
    return (c ??= make(address));
  };
  return {
    rail,
    feeFromRefundWallet: rail === 'tempo',
    balanceUsd: () => get().balanceUsd(),
    feeUsd: () => get().feeUsd(),
    sign: (p) => get().sign(p),
    broadcast: (p) => get().broadcast(p),
    status: (p) => get().status(p),
  };
}

async function refreshLedgerGauges(): Promise<void> {
  const rows = await getPrisma().$queryRaw<Row[]>`
    SELECT rail, status, COUNT(*)::int AS n, COALESCE(SUM(amount_usd),0)::float8 AS usd
      FROM refund_ledger GROUP BY rail, status`;
  for (const r of rows) {
    refundLedgerOwedRows.set({ rail: String(r.rail), status: String(r.status) }, Number(r.n));
    if (r.status === 'owed') refundLedgerOwedUsd.set({ rail: String(r.rail) }, Number(r.usd));
  }
}

/** Worker boot: key guard + recovery of payouts a crash left behind. Never throws. */
export async function bootRefundWallet(): Promise<void> {
  try {
    const store = makePrismaStore();
    const keys = currentKeys();
    await emitKeyAlerts(keys, store);
    await recoverPayouts(buildDeps(keys, store));
  } catch (e) {
    logger.error({ err: String(e) }, 'refund wallet boot pass failed');
  }
}

export async function runRefundPayoutSafe(): Promise<RunSummary | null> {
  let redis;
  try {
    redis = await ensureRedisConnected();
  } catch (e) {
    logger.warn({ err: String(e) }, 'refund payout: redis unavailable, run skipped');
    return null;
  }
  const got = await redis.set(LOCK_KEY, String(process.pid), 'EX', LOCK_TTL_S, 'NX');
  if (got !== 'OK') {
    logger.info({}, 'refund payout: another run holds the lock');
    return null;
  }
  try {
    const store = makePrismaStore();
    const keys = currentKeys();
    await emitKeyAlerts(keys, store);
    const summary = await runPayout(buildDeps(keys, store));
    await refreshLedgerGauges().catch((e) =>
      logger.warn({ err: String(e) }, 'refund gauges failed'),
    );
    refundPayoutLastRunTimestamp.set(Date.now() / 1000);
    await redis.set(LAST_RUN_KEY, JSON.stringify({ at: new Date().toISOString(), ...summary }));
    return summary;
  } catch (e) {
    logger.error({ err: String(e) }, 'refund payout run failed');
    return null;
  } finally {
    await redis.del(LOCK_KEY).catch(() => undefined);
  }
}

export { LAST_RUN_KEY };
