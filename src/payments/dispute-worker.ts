import {
  atomicToUsd,
  isAtomic,
  isClaimType,
  isTxHash,
  judgePayment,
  judgeReceipt,
  sameRefund,
  type ByTxIndex,
  type ClaimType,
  type RuleOutcome,
  type UsdcTransfer,
} from './dispute-rules';
import type { RefundOwedInput } from '../services/refund-ledger.service';

/**
 * A-GD-01 (GENLAYER-DISPUTE-1102 ruling-1, REFUND-WALLET-1026 ruling-2): the verdict lane of the
 * refund worker. It changes nothing about how money moves.
 *
 *  - READ: `list_recent` / `get_dispute` of the dispute contract for ids not judged yet.
 *  - JUDGE: a REFUND verdict is never trusted alone. The same rule is recomputed locally from the
 *    receipt store, the by-tx index and Base (dispute-rules.ts). Match -> the debt is BOOKED in the
 *    refund ledger (`source_kind 'request'`, `source_id` = dispute id, `original_tx` = payment tx);
 *    the weekly payout (T-0553) pays it under its caps. Mismatch -> no row, an incident.
 *  - ONE refund per payment transaction, ever: a ledger row for the same original_tx (or receipt)
 *    makes a second verdict a no-op.
 *  - CONFIRM (off until Provek v1.1 ships `confirm_refund`; cfg.confirm): when the booked row is
 *    `sent`, `confirm_refund(dispute_id)` closes the loop on chain.
 *  - FILE: billed-5xx receipts (and paid-without-receipt payments flagged by a watcher) are filed as
 *    `dispute_receipt` / `dispute_payment` from APIbase's own key. The flag line and its time are
 *    stored BEFORE the filing transaction. Filing never pays anything.
 * No transaction of the refund wallet is sent here; GL writes are testnet calls from GL_DISPUTE_KEY.
 */

export interface DisputeCfg {
  /** ApibaseReceiptDispute address (claim upstream_failed_but_billed). */
  receiptContract: string;
  /** ApibasePaymentDispute address (claim paid_without_receipt). Both empty = the lane is off. */
  paymentContract: string;
  /** Empty key = reads only (no filing, no confirm). */
  hasKey: boolean;
  /** `confirm_refund` exists in neither merged contract (Provek v1.1); off until it ships. */
  confirm: boolean;
  /** Per-refund cap, atomic USDC: a verdict above it waits for the operator. */
  perRefundAtomic: string;
  payee: string;
  refundWindowHours: number;
}

/** Contract port: reads and signed writes. Tests pass a stub; production uses genlayer-js. */
export type GlTarget = 'receipt' | 'payment';

export interface GlPort {
  call(target: GlTarget, fn: string, args: unknown[]): Promise<unknown>;
  send(target: GlTarget, fn: string, args: unknown[]): Promise<string>;
}

export interface Facts {
  receiptBody(receiptId: string): Promise<string | null>;
  index(tx: string): Promise<ByTxIndex>;
  /** Base transaction receipt: status + USDC transfers; null = unknown to the node. */
  baseTx(tx: string): Promise<{ status: number; transfers: UsdcTransfer[] } | null>;
}

export interface VerdictRow {
  dispute_id: string;
  claim: string;
  verdict: string;
  payment_tx: string | null;
  receipt_id: string | null;
  outcome: 'released' | 'booked' | 'mismatch' | 'over_cap' | 'duplicate_tx' | 'unreadable';
  detail: Record<string, unknown>;
  refund_id: string | null;
}

export interface FlagRow {
  flag_id: string;
  claim: ClaimType;
  subject: string;
}

export interface WorkerStore {
  judged(ids: string[]): Promise<Set<string>>;
  saveVerdict(row: VerdictRow): Promise<void>;
  /** A live (non-cancelled) refund_ledger row for this payment tx or receipt id. */
  refundExistsFor(paymentTx: string | null, receiptId: string | null): Promise<boolean>;
  /** The refund_id of the row booked for this dispute, if any. */
  bookedFor(disputeId: string): Promise<string | null>;
  /** Another booked verdict (different dispute id) on this payment tx. */
  otherBookedVerdict(paymentTx: string, disputeId: string): Promise<string | null>;
  book(row: RefundOwedInput): Promise<void>;
  confirmable(): Promise<string[]>;
  setConfirm(disputeId: string, state: 'done' | 'failed', detail?: string): Promise<void>;
  overdue(hours: number): Promise<string[]>;
  markOverdueAlerted(disputeId: string): Promise<void>;
  newReceiptFlags(): Promise<number>;
  unfiledFlags(): Promise<FlagRow[]>;
  markFiled(flagId: string, filedTx: string): Promise<void>;
  markFileError(flagId: string, error: string): Promise<void>;
  alert(kind: string, payload: Record<string, unknown>): Promise<void>;
}

export interface WorkerDeps {
  cfg: DisputeCfg;
  gl: GlPort;
  facts: Facts;
  store: WorkerStore;
  log: (level: 'info' | 'warn' | 'error', msg: string, extra?: Record<string, unknown>) => void;
}

export interface RunSummary {
  disabled?: boolean;
  seen: number;
  judged: number;
  booked: number;
  mismatches: number;
  overCap: number;
  duplicates: number;
  released: number;
  confirmed: number;
  filed: number;
}

const emptySummary = (): RunSummary => ({
  seen: 0,
  judged: 0,
  booked: 0,
  mismatches: 0,
  overCap: 0,
  duplicates: 0,
  released: 0,
  confirmed: 0,
  filed: 0,
});

/** A contract view returns JSON text; accept text or an already decoded value. */
function decode(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

interface DisputeRecord {
  dispute_id: string;
  claim: string;
  receipt_id: string;
  payment_tx: string;
  payer: string;
  amount_atomic: string;
  verdict: string;
}

function toRecord(raw: unknown, id: string): DisputeRecord | null {
  const v = decode(raw);
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  return {
    dispute_id: id,
    claim: str(o.claim),
    receipt_id: str(o.receipt_id),
    payment_tx: str(o.payment_tx).toLowerCase(),
    payer: str(o.payer).toLowerCase(),
    amount_atomic: str(o.amount_atomic),
    verdict: str(o.verdict),
  };
}

async function recompute(d: DisputeRecord, deps: WorkerDeps): Promise<RuleOutcome> {
  if (!isClaimType(d.claim)) return { verdict: 'UNREADABLE', reason: `unknown claim ${d.claim}` };
  if (d.claim === 'upstream_failed_but_billed') {
    const body = await deps.facts.receiptBody(d.receipt_id);
    if (body === null) return { verdict: 'UNREADABLE', reason: 'receipt not in the store' };
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return { verdict: 'UNREADABLE', reason: 'receipt body is not JSON' };
    }
    return judgeReceipt(parsed);
  }
  if (!isTxHash(d.payment_tx)) return { verdict: 'UNREADABLE', reason: 'payment_tx malformed' };
  const [index, chain] = await Promise.all([
    deps.facts.index(d.payment_tx),
    deps.facts.baseTx(d.payment_tx),
  ]);
  return judgePayment({ tx: d.payment_tx, index, chain, payee: deps.cfg.payee });
}

/** Judge one dispute id. Returns the row to remember, or null to retry on the next pass. */
async function judgeOne(
  id: string,
  target: GlTarget,
  deps: WorkerDeps,
  sum: RunSummary,
): Promise<VerdictRow | null> {
  const d = toRecord(await deps.gl.call(target, 'get_dispute', [id]), id);
  if (!d) {
    deps.log('warn', 'dispute: get_dispute returned no record', { dispute_id: id });
    return null;
  }
  const base = {
    dispute_id: id,
    claim: d.claim,
    verdict: d.verdict,
    payment_tx: d.payment_tx || null,
    receipt_id: d.receipt_id || null,
    refund_id: null,
  };
  if (d.verdict !== 'REFUND') {
    sum.released += 1;
    return { ...base, outcome: 'released', detail: { verdict: d.verdict } };
  }
  // One refund per payment transaction, ever: a second REFUND verdict on a tx that already has a
  // booked verdict is a no-op (checked before the recompute, which would now see our own booking).
  const earlier = d.payment_tx ? await deps.store.otherBookedVerdict(d.payment_tx, id) : null;
  if (earlier) {
    sum.duplicates += 1;
    deps.log('info', 'dispute: a verdict for this payment transaction is already booked; no-op', {
      dispute_id: id,
      booked_dispute_id: earlier,
    });
    return { ...base, outcome: 'duplicate_tx', detail: { booked_dispute_id: earlier } };
  }
  const local = await recompute(d, deps);
  const claimOk = isClaimType(d.claim) && isAtomic(d.amount_atomic);
  if (
    !claimOk ||
    !sameRefund(
      {
        verdict: 'REFUND',
        claim: d.claim as ClaimType,
        payer: d.payer,
        amount_atomic: d.amount_atomic,
      },
      local,
    )
  ) {
    sum.mismatches += 1;
    const detail = { contract: d, local };
    await deps.store.alert('DISPUTE_VERDICT_MISMATCH', {
      severity: 'critical',
      dispute_id: id,
      ...detail,
    });
    deps.log('error', 'DISPUTE_VERDICT_MISMATCH: no payment, incident raised', { dispute_id: id });
    return { ...base, outcome: 'mismatch', detail };
  }
  // The verdict is confirmed locally. One refund per payment transaction, ever.
  if (await deps.store.refundExistsFor(d.payment_tx || null, d.receipt_id || null)) {
    sum.duplicates += 1;
    deps.log('info', 'dispute: a refund already exists for this payment; verdict is a no-op', {
      dispute_id: id,
      payment_tx: d.payment_tx,
    });
    return { ...base, outcome: 'duplicate_tx', detail: {} };
  }
  if (BigInt(d.amount_atomic) > BigInt(deps.cfg.perRefundAtomic)) {
    sum.overCap += 1;
    await deps.store.alert('dispute_over_cap', {
      severity: 'warning',
      dispute_id: id,
      amount_atomic: d.amount_atomic,
      cap_atomic: deps.cfg.perRefundAtomic,
    });
    deps.log('warn', 'dispute: verdict above the per-refund cap waits for the operator', {
      dispute_id: id,
    });
    return { ...base, outcome: 'over_cap', detail: { amount_atomic: d.amount_atomic } };
  }
  await deps.store.book({
    rail: 'base',
    payer: d.payer,
    amount_usd: atomicToUsd(d.amount_atomic),
    reason: d.claim,
    source_kind: 'request',
    source_id: id,
    receipt_id: d.receipt_id || null,
    original_tx: d.payment_tx || null,
    note: { dispute_id: id, claim: d.claim, via: 'genlayer_dispute' },
  });
  const refundId = await deps.store.bookedFor(id);
  if (!refundId) return null; // the ledger write failed (logged by the ledger); retry next pass
  sum.booked += 1;
  return {
    ...base,
    outcome: 'booked',
    detail: { amount_atomic: d.amount_atomic },
    refund_id: refundId,
  };
}

async function fileLane(deps: WorkerDeps, sum: RunSummary): Promise<void> {
  await deps.store.newReceiptFlags();
  if (!deps.cfg.hasKey) return;
  for (const f of await deps.store.unfiledFlags()) {
    try {
      const isReceipt = f.claim === 'upstream_failed_but_billed';
      // A claim whose contract is not configured stays flagged (unfiled) until it is.
      if (!(isReceipt ? deps.cfg.receiptContract : deps.cfg.paymentContract)) continue;
      const tx = await deps.gl.send(
        isReceipt ? 'receipt' : 'payment',
        isReceipt ? 'dispute_receipt' : 'dispute_payment',
        isReceipt ? [f.subject] : ['8453', f.subject],
      );
      await deps.store.markFiled(f.flag_id, tx);
      sum.filed += 1;
    } catch (e) {
      // Never retried blindly: every attempt costs test GEN. The operator resets the flag.
      const msg = String((e as Error)?.message ?? e).slice(0, 300);
      await deps.store.markFileError(f.flag_id, msg);
      await deps.store.alert('dispute_filing_failed', {
        severity: 'warning',
        subject: f.subject,
        error: msg,
      });
      deps.log('warn', 'dispute: filing failed', { claim: f.claim });
    }
  }
}

async function confirmLane(deps: WorkerDeps, sum: RunSummary): Promise<void> {
  if (!deps.cfg.hasKey || !deps.cfg.confirm) return;
  for (const id of await deps.store.confirmable()) {
    try {
      await deps.gl.send('receipt', 'confirm_refund', [id]);
      await deps.store.setConfirm(id, 'done');
      sum.confirmed += 1;
    } catch (e) {
      const msg = String((e as Error)?.message ?? e).slice(0, 300);
      await deps.store.setConfirm(id, 'failed', msg);
      await deps.store.alert('dispute_confirm_failed', {
        severity: 'warning',
        dispute_id: id,
        error: msg,
      });
      deps.log('warn', 'dispute: confirm_refund failed; not retried automatically', {
        dispute_id: id,
      });
    }
  }
}

/** One pass of the lane. Never throws: a failing read ends the pass with a log line. */
export async function runDisputeVerdicts(deps: WorkerDeps): Promise<RunSummary> {
  const sum = emptySummary();
  if (!deps.cfg.receiptContract && !deps.cfg.paymentContract) {
    deps.log('info', 'dispute verdict lane disabled: no GL_DISPUTE_*CONTRACT is set');
    return { ...sum, disabled: true };
  }
  try {
    await fileLane(deps, sum);
    const targets: GlTarget[] = [];
    if (deps.cfg.receiptContract) targets.push('receipt');
    if (deps.cfg.paymentContract) targets.push('payment');
    for (const target of targets) {
      const list = decode(await deps.gl.call(target, 'list_recent', []));
      const ids = Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
      sum.seen += ids.length;
      const known = await deps.store.judged(ids);
      for (const id of ids.filter((i) => !known.has(i))) {
        try {
          const row = await judgeOne(id, target, deps, sum);
          if (row) {
            await deps.store.saveVerdict(row);
            sum.judged += 1;
          }
        } catch (e) {
          deps.log('error', 'dispute: judging failed, retried next pass', {
            dispute_id: id,
            err: String((e as Error)?.message ?? e).slice(0, 200),
          });
        }
      }
    }
    await confirmLane(deps, sum);
    for (const id of await deps.store.overdue(deps.cfg.refundWindowHours)) {
      await deps.store.alert('dispute_refund_overdue', { severity: 'warning', dispute_id: id });
      await deps.store.markOverdueAlerted(id);
    }
  } catch (e) {
    deps.log('error', 'dispute verdict pass failed', {
      err: String((e as Error)?.message ?? e).slice(0, 200),
    });
  }
  return sum;
}
