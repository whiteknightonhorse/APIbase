/**
 * T-0553 refund payout engine (REFUND-WALLET-1026). Pure orchestration over injected ports:
 * a Store (refund_ledger + refund_payouts), one RailChain per rail, a clock, and the flags.
 * It never reads a key and never imports a chain library; src/refunds/refund-chains.ts and
 * src/jobs/refund-payout.job.ts wire the real ports.
 *
 * State machine of refund_payouts:
 *   signing --sign--> signed --broadcast--> broadcast --receipt ok--> sent
 *   signing|signed|broadcast --recovery--> sent | expired (rows back to owed) | failed (rows back to owed)
 * The ledger rows of a payout go owed -> scheduled in the transaction that inserts the payout
 * (before any signature) and scheduled -> sent in the transaction that marks it sent.
 */

export type Rail = 'base' | 'tempo';
export type PayoutStatus = 'signing' | 'signed' | 'broadcast' | 'sent' | 'expired' | 'failed';

export interface OwedRow {
  refund_id: string;
  rail: Rail;
  payer: string;
  /** Integer micro-USD (amount_usd has 6 decimals). */
  micro: number;
  detected_at: Date;
}

export interface Payout {
  payout_id: string;
  rail: Rail;
  payer: string;
  micro: number;
  status: PayoutStatus;
  nonce: string | null;
  tx_hash: string | null;
  raw_tx: string | null;
  valid_before: Date | null;
  fee_usd_est: number;
  created_at: Date;
}

export interface Batch {
  payer: string;
  rowIds: string[];
  micro: number;
}

export interface RefundCfg {
  enabled: boolean;
  dryRun: boolean;
  minPayoutUsd: number;
  feeMultiple: number;
  runCapUsd: number;
  periodCapUsd: number;
  payerRunCapUsd: number;
  ceilingUsd: number;
  lowBalanceUsd: number;
  carryMaxDays: number;
}

export interface Alert {
  kind: string;
  rail?: Rail;
  [k: string]: unknown;
}

export interface Store {
  owedRows(rail: Rail): Promise<OwedRow[]>;
  /** Sum of micro-USD of payouts with status 'sent' since `since` (all rails). */
  sentMicroSince(since: Date): Promise<number>;
  /**
   * ONE transaction: insert the payout as 'signing' and move the rows owed -> scheduled.
   * Returns null (and changes nothing) when fewer rows than selected were still 'owed'.
   */
  createPayout(b: Batch, rail: Rail, feeUsd: number): Promise<Payout | null>;
  /** Payers of the ledger rows attached to a payout. */
  payoutRowPayers(payoutId: string): Promise<string[]>;
  livePayouts(): Promise<Payout[]>;
  patch(
    payoutId: string,
    p: Partial<Pick<Payout, 'status' | 'nonce' | 'tx_hash' | 'raw_tx' | 'valid_before'>> & {
      error?: string;
    },
  ): Promise<void>;
  /** ONE transaction: payout -> sent, its rows scheduled -> sent with refund_tx. */
  markSent(payoutId: string, txHash: string | null): Promise<void>;
  /** ONE transaction: payout -> status (expired|failed), its rows scheduled -> owed. */
  release(payoutId: string, status: 'expired' | 'failed', error: string): Promise<void>;
  writeOutbox(
    eventType: 'refund_payout_run' | 'refund_alert',
    payload: Record<string, unknown>,
  ): Promise<void>;
}

export type ChainStatus =
  | { state: 'sent'; txHash: string | null }
  | { state: 'expired' }
  | { state: 'failed'; reason: string }
  | { state: 'unsent' }
  | { state: 'pending' };

export interface SignResult {
  nonce: string;
  rawTx: string;
  /** Known before broadcast on tempo (hash of the raw tx); null on base. */
  txHash: string | null;
  validBefore: Date | null;
}

export class FeeUnavailableError extends Error {}

export interface RailChain {
  rail: Rail;
  /** True when the transfer fee is paid from the refund wallet balance (tempo). */
  feeFromRefundWallet: boolean;
  balanceUsd(): Promise<number>;
  /** Live fee estimate in USD for one payout. Throws FeeUnavailableError to skip the run. */
  feeUsd(): Promise<number>;
  sign(p: Payout): Promise<SignResult>;
  broadcast(p: Payout): Promise<{ txHash: string; success: boolean | null }>;
  status(p: Payout): Promise<ChainStatus>;
}

export type KeyState = 'ok' | 'missing' | 'mismatch';

export interface Deps {
  cfg: RefundCfg;
  store: Store;
  chains: Record<Rail, RailChain>;
  keyState: Record<Rail, KeyState>;
  killed(): boolean;
  now(): Date;
  log(level: 'info' | 'warn' | 'error', msg: string, extra?: Record<string, unknown>): void;
  metrics?: {
    payout(rail: Rail, result: string): void;
    fee(rail: Rail, usd: number): void;
    balance(rail: Rail, usd: number): void;
    alert(kind: string, rail?: Rail): void;
  };
}

const DAY_MS = 86_400_000;
const MIN_AGE_MS = 24 * 3600_000;
const PERIOD_MS = 30 * DAY_MS;
const CARRY_FEE_SHARE = 0.5;

export const usd = (micro: number): number => micro / 1e6;
export const toMicro = (v: string | number): number => Math.round(Number(v) * 1e6);

export function threshold(cfg: RefundCfg, feeUsd: number): number {
  return Math.max(cfg.minPayoutUsd, cfg.feeMultiple * feeUsd);
}

export interface SelectInput {
  rows: OwedRow[];
  now: Date;
  cfg: RefundCfg;
  feeUsd: number;
  feeFromRefundWallet: boolean;
  balanceUsd: number;
  /** Micro-USD already scheduled in this run (other rail) and sent in the last 30 days. */
  runMicroSoFar: number;
  periodMicroSent: number;
}

export interface Selection {
  batches: Batch[];
  alerts: Alert[];
}

/** Which payers are paid in this run, oldest first, inside every cap. Pure. */
export function selectBatches(i: SelectInput, rail: Rail): Selection {
  const { cfg, now } = i;
  const alerts: Alert[] = [];
  const thr = threshold(cfg, i.feeUsd);
  const byPayer = new Map<string, OwedRow[]>();
  for (const r of i.rows) {
    if (now.getTime() - r.detected_at.getTime() < MIN_AGE_MS) continue; // younger than 24 h waits
    const list = byPayer.get(r.payer) ?? [];
    list.push(r);
    byPayer.set(r.payer, list);
  }
  const due: Array<Batch & { oldest: number }> = [];
  for (const [payer, rows] of byPayer) {
    const micro = rows.reduce((a, r) => a + r.micro, 0);
    const oldest = Math.min(...rows.map((r) => r.detected_at.getTime()));
    const carry =
      now.getTime() - oldest > cfg.carryMaxDays * DAY_MS &&
      i.feeUsd <= CARRY_FEE_SHARE * usd(micro);
    if (usd(micro) >= thr || carry) {
      due.push({ payer, rowIds: rows.map((r) => r.refund_id), micro, oldest });
    }
  }
  due.sort((a, b) => a.oldest - b.oldest);

  const sumDue = due.reduce((a, b) => a + b.micro, 0);
  const reserve = i.feeFromRefundWallet ? i.feeUsd : 0;
  let balanceLeft = i.balanceUsd;
  let run = i.runMicroSoFar;
  const out: Batch[] = [];
  let lowAlerted = false;
  if (usd(sumDue) > i.balanceUsd && due.length) {
    alerts.push({
      kind: 'refund_wallet_low',
      rail,
      balance_usd: i.balanceUsd,
      due_usd: usd(sumDue),
    });
    lowAlerted = true;
  }
  for (const b of due) {
    if (usd(b.micro) > cfg.payerRunCapUsd) {
      alerts.push({
        kind: 'refund_payer_over_cap',
        rail,
        payer: b.payer,
        amount_usd: usd(b.micro),
      });
      continue;
    }
    if (usd(run + b.micro) > cfg.runCapUsd) break;
    if (usd(i.periodMicroSent + run + b.micro) > cfg.periodCapUsd) break;
    if (balanceLeft < usd(b.micro) + reserve) {
      if (!lowAlerted) {
        alerts.push({
          kind: 'refund_wallet_low',
          rail,
          balance_usd: i.balanceUsd,
          due_usd: usd(sumDue),
        });
      }
      break;
    }
    balanceLeft -= usd(b.micro) + reserve;
    run += b.micro;
    out.push({ payer: b.payer, rowIds: b.rowIds, micro: b.micro });
  }
  return { batches: out, alerts };
}

async function alertOnce(d: Deps, seen: Set<string>, a: Alert): Promise<void> {
  const key = `${a.kind}:${a.rail ?? ''}:${String(a.payer ?? '')}`;
  if (seen.has(key)) return;
  seen.add(key);
  d.metrics?.alert(a.kind, a.rail);
  d.log('error', `refund alert ${a.kind}`, { ...a });
  try {
    await d.store.writeOutbox('refund_alert', { ...a });
  } catch (e) {
    d.log('error', 'refund alert outbox write failed', { kind: a.kind, err: String(e) });
  }
}

export interface RunSummary {
  skipped?: string;
  dry_run: boolean;
  rails: Record<string, { payers: number; usd: number; paid: number; note?: string }>;
  recovered: number;
}

/** Start of every run and worker boot: settle payouts a crash left in signing/signed/broadcast. */
export async function recoverPayouts(d: Deps, seen = new Set<string>()): Promise<number> {
  let n = 0;
  for (const p of await d.store.livePayouts()) {
    try {
      n += (await recoverOne(d, p, seen)) ? 1 : 0;
    } catch (e) {
      d.log('error', 'refund payout recovery failed', { payout_id: p.payout_id, err: String(e) });
    }
  }
  return n;
}

async function recoverOne(d: Deps, p: Payout, seen: Set<string>): Promise<boolean> {
  if (p.status === 'signing' && !p.raw_tx) {
    // Crashed before a signature existed: nothing can be on chain.
    await d.store.release(p.payout_id, 'expired', 'crashed before signature');
    d.metrics?.payout(p.rail, 'expired');
    return true;
  }
  const chain = d.chains[p.rail];
  const st = await chain.status(p);
  switch (st.state) {
    case 'sent':
      await d.store.markSent(p.payout_id, st.txHash ?? p.tx_hash);
      d.metrics?.payout(p.rail, 'sent');
      return true;
    case 'expired':
      await d.store.release(p.payout_id, 'expired', 'authorization expired unused');
      d.metrics?.payout(p.rail, 'expired');
      return true;
    case 'failed':
      await d.store.release(p.payout_id, 'failed', st.reason);
      d.metrics?.payout(p.rail, 'failed');
      await alertOnce(d, seen, {
        kind: 'refund_payout_failed',
        rail: p.rail,
        payout_id: p.payout_id,
        reason: st.reason,
      });
      return true;
    case 'pending':
      return false;
    case 'unsent': {
      if (d.killed()) {
        d.log('warn', 'refund kill switch: recovery re-broadcast held', { payout_id: p.payout_id });
        return false;
      }
      // Same authorization / same raw tx: the chain rejects a second execution.
      const r = await chain.broadcast(p);
      await d.store.patch(p.payout_id, { status: 'broadcast', tx_hash: r.txHash });
      if (r.success === true) {
        await d.store.markSent(p.payout_id, r.txHash);
        d.metrics?.payout(p.rail, 'sent');
        return true;
      }
      return false;
    }
  }
}

function railUsable(d: Deps, rail: Rail): boolean {
  return d.keyState[rail] === 'ok';
}

/** One weekly run. Each rail is independent: a failure on one never stops the other. */
export async function runPayout(d: Deps): Promise<RunSummary> {
  const seen = new Set<string>();
  const summary: RunSummary = { dry_run: d.cfg.dryRun, rails: {}, recovered: 0 };
  summary.recovered = await recoverPayouts(d, seen);

  if (!d.cfg.enabled || d.killed()) {
    summary.skipped = !d.cfg.enabled ? 'disabled' : 'kill switch';
    d.log('info', 'refund payout run skipped', { reason: summary.skipped });
    if (d.killed() && d.cfg.enabled) await alertOnce(d, seen, { kind: 'refund_kill_switch' });
    return summary;
  }

  let runMicro = 0;
  const periodSent = await d.store.sentMicroSince(new Date(d.now().getTime() - PERIOD_MS));
  for (const rail of ['base', 'tempo'] as const) {
    const rs = (summary.rails[rail] = {
      payers: 0,
      usd: 0,
      paid: 0,
    } as RunSummary['rails'][string]);
    if (!railUsable(d, rail)) {
      rs.note = `key ${d.keyState[rail]}`;
      continue;
    }
    try {
      const chain = d.chains[rail];
      let fee: number;
      try {
        fee = await chain.feeUsd();
      } catch (e) {
        rs.note = 'fee unavailable';
        await alertOnce(d, seen, {
          kind: 'refund_fee_unavailable',
          rail,
          reason: String(e instanceof Error ? e.message : e),
        });
        continue;
      }
      d.metrics?.fee(rail, fee);
      const balance = await chain.balanceUsd();
      d.metrics?.balance(rail, balance);
      if (balance > d.cfg.ceilingUsd) {
        await alertOnce(d, seen, {
          kind: 'refund_wallet_over_ceiling',
          rail,
          balance_usd: balance,
          ceiling_usd: d.cfg.ceilingUsd,
        });
      }
      if (balance < d.cfg.lowBalanceUsd) {
        await alertOnce(d, seen, {
          kind: 'refund_wallet_low',
          rail,
          balance_usd: balance,
          low_usd: d.cfg.lowBalanceUsd,
        });
      }
      const sel = selectBatches(
        {
          rows: await d.store.owedRows(rail),
          now: d.now(),
          cfg: d.cfg,
          feeUsd: fee,
          feeFromRefundWallet: chain.feeFromRefundWallet,
          balanceUsd: balance,
          runMicroSoFar: runMicro,
          periodMicroSent: periodSent,
        },
        rail,
      );
      for (const a of sel.alerts) await alertOnce(d, seen, a);
      rs.payers = sel.batches.length;
      rs.usd = usd(sel.batches.reduce((a, b) => a + b.micro, 0));
      if (d.cfg.dryRun) {
        d.log('info', `would pay ${rs.payers} payers ${rs.usd} on ${rail}`);
        runMicro += sel.batches.reduce((a, b) => a + b.micro, 0);
        continue;
      }
      for (const b of sel.batches) {
        if (d.killed()) {
          await alertOnce(d, seen, { kind: 'refund_kill_switch', rail });
          break;
        }
        const ok = await payOne(d, rail, b, fee, seen);
        if (ok === 'abort') break;
        if (ok === 'sent') {
          rs.paid += 1;
          runMicro += b.micro;
        }
      }
    } catch (e) {
      rs.note = 'error';
      d.log('error', 'refund payout rail failed', {
        rail,
        err: String(e instanceof Error ? e.message : e),
      });
      await alertOnce(d, seen, { kind: 'refund_run_error', rail });
    }
  }
  try {
    await d.store.writeOutbox('refund_payout_run', { ...summary, at: d.now().toISOString() });
  } catch (e) {
    d.log('error', 'refund_payout_run outbox write failed', { err: String(e) });
  }
  return summary;
}

async function payOne(
  d: Deps,
  rail: Rail,
  b: Batch,
  fee: number,
  seen: Set<string>,
): Promise<'sent' | 'pending' | 'abort'> {
  const chain = d.chains[rail];
  const p = await d.store.createPayout(b, rail, fee);
  if (!p) {
    await alertOnce(d, seen, { kind: 'refund_rows_not_owed', rail, payer: b.payer });
    return 'abort';
  }
  // Recipient is only ever the ledger payer of the rows in this payout.
  const payers = await d.store.payoutRowPayers(p.payout_id);
  if (payers.length === 0 || payers.some((x) => x !== p.payer)) {
    await d.store.release(p.payout_id, 'failed', 'recipient mismatch');
    d.metrics?.payout(rail, 'failed');
    await alertOnce(d, seen, { kind: 'refund_recipient_mismatch', rail, payout_id: p.payout_id });
    return 'abort';
  }
  const signed = await chain.sign(p);
  await d.store.patch(p.payout_id, {
    status: 'signed',
    nonce: signed.nonce,
    raw_tx: signed.rawTx,
    tx_hash: signed.txHash,
    valid_before: signed.validBefore,
  });
  const live: Payout = {
    ...p,
    status: 'signed',
    nonce: signed.nonce,
    raw_tx: signed.rawTx,
    tx_hash: signed.txHash,
    valid_before: signed.validBefore,
  };
  if (d.killed()) {
    await alertOnce(d, seen, { kind: 'refund_kill_switch', rail });
    return 'abort'; // stays 'signed': the next run recovers it (expiry returns the rows)
  }
  const r = await chain.broadcast(live);
  await d.store.patch(p.payout_id, { status: 'broadcast', tx_hash: r.txHash });
  if (r.success === true) {
    await d.store.markSent(p.payout_id, r.txHash);
    d.metrics?.payout(rail, 'sent');
    return 'sent';
  }
  if (r.success === false) {
    await d.store.release(p.payout_id, 'failed', 'transaction reverted');
    d.metrics?.payout(rail, 'failed');
    await alertOnce(d, seen, { kind: 'refund_payout_failed', rail, payout_id: p.payout_id });
    return 'abort';
  }
  return 'pending'; // receipt not seen in time: recovery decides next run
}
