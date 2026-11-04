/**
 * A-GD-01: the deterministic refund rule of the GenLayer dispute contract, written once.
 *
 * The contract (Provek ApibaseReceiptDispute) lets validators decide REFUND or RELEASE for two closed
 * claims. APIbase never pays on the testnet's word alone: before it books a debt it recomputes the
 * same rule from the same documents with these functions and compares. Pure: no I/O, no clock.
 *
 *  upstream_failed_but_billed  the receipt JSON alone: billed and upstream_status >= 500.
 *  paid_without_receipt        APIbase's by-tx index (no receipt, no refund) plus a successful USDC
 *                              Transfer to the configured payee on Base.
 */

/**
 * The published refund window (static/policy/refunds.json): the weekly payout (Monday) plus the
 * 24 h a young row waits. A booked verdict still unpaid after it raises an alert.
 */
export const REFUND_WINDOW_HOURS = 192;

export type ClaimType = 'upstream_failed_but_billed' | 'paid_without_receipt';
export const CLAIM_TYPES: readonly ClaimType[] = [
  'upstream_failed_but_billed',
  'paid_without_receipt',
];

export const isClaimType = (v: unknown): v is ClaimType =>
  typeof v === 'string' && (CLAIM_TYPES as readonly string[]).includes(v);

/** Outcome of the rule. `unreadable` = the inputs do not allow a decision (the contract reverts). */
export type RuleOutcome =
  | { verdict: 'REFUND'; reason: ClaimType; payer: string; amount_atomic: string }
  | { verdict: 'RELEASE'; reason: string }
  | { verdict: 'UNREADABLE'; reason: string };

const ADDR_RE = /^0x[0-9a-f]{40}$/;
const TX_RE = /^0x[0-9a-f]{64}$/;
const ATOMIC_RE = /^[0-9]{1,30}$/;

export const isTxHash = (v: unknown): v is string => typeof v === 'string' && TX_RE.test(v);
export const isAddress = (v: unknown): v is string => typeof v === 'string' && ADDR_RE.test(v);
export const isAtomic = (v: unknown): v is string => typeof v === 'string' && ATOMIC_RE.test(v);

/** upstream_failed_but_billed: decided from the receipt document alone. */
export function judgeReceipt(receipt: unknown): RuleOutcome {
  if (typeof receipt !== 'object' || receipt === null) {
    return { verdict: 'UNREADABLE', reason: 'receipt is not a JSON object' };
  }
  const r = receipt as Record<string, unknown>;
  if (r.schema !== 'apibase-receipt/1')
    return { verdict: 'UNREADABLE', reason: 'unsupported schema' };
  if (r.rail !== 'x402-base') return { verdict: 'UNREADABLE', reason: 'unsupported rail' };
  const payer = typeof r.payer === 'string' ? r.payer.toLowerCase() : '';
  if (!isAddress(payer) || !isAtomic(r.amount_atomic) || typeof r.upstream_status !== 'number') {
    return { verdict: 'UNREADABLE', reason: 'malformed receipt' };
  }
  if (r.billed !== true) return { verdict: 'RELEASE', reason: 'not_billed' };
  if (r.upstream_status >= 500) {
    return {
      verdict: 'REFUND',
      reason: 'upstream_failed_but_billed',
      payer,
      amount_atomic: r.amount_atomic,
    };
  }
  return { verdict: 'RELEASE', reason: `upstream_status_${r.upstream_status}` };
}

export interface ByTxIndex {
  payment_tx: string;
  receipt_ids: string[];
  refund_tx: string | null;
}

export interface UsdcTransfer {
  from: string;
  to: string;
  value_atomic: string;
}

export interface PaymentFacts {
  tx: string;
  index: ByTxIndex | null;
  /** The Base transaction receipt as read from the chain; null = the node does not know the tx. */
  chain: { status: number; transfers: UsdcTransfer[] } | null;
  payee: string;
  /** A REFUND verdict of this contract already exists for this payment tx (other dispute id). */
  otherRefundVerdict?: string | null;
}

/** paid_without_receipt: the same order of checks as the contract's `_judge_payment`. */
export function judgePayment(f: PaymentFacts): RuleOutcome {
  if (!f.index || f.index.payment_tx !== f.tx) {
    return { verdict: 'UNREADABLE', reason: 'index is not readable' };
  }
  if (f.index.refund_tx) return { verdict: 'RELEASE', reason: 'already_refunded' };
  if (f.index.receipt_ids.length > 0) {
    return { verdict: 'RELEASE', reason: `receipt_exists:${f.index.receipt_ids[0]}` };
  }
  if (f.otherRefundVerdict) {
    return { verdict: 'RELEASE', reason: `refund_verdict_exists:${f.otherRefundVerdict}` };
  }
  if (!f.chain) return { verdict: 'RELEASE', reason: 'tx_not_found' };
  if (f.chain.status !== 1) return { verdict: 'RELEASE', reason: 'tx_reverted' };
  const payee = f.payee.toLowerCase();
  const t = f.chain.transfers.find((x) => x.to.toLowerCase() === payee);
  if (!t) return { verdict: 'RELEASE', reason: 'no_payment_to_apibase' };
  return {
    verdict: 'REFUND',
    reason: 'paid_without_receipt',
    payer: t.from.toLowerCase(),
    amount_atomic: t.value_atomic,
  };
}

/** The fields of a dispute record the worker compares with its own computation. */
export interface VerdictClaim {
  verdict: 'REFUND';
  claim: ClaimType;
  payer: string;
  amount_atomic: string;
}

/** Do the on-chain verdict and the local recomputation agree on the money? */
export function sameRefund(claim: VerdictClaim, local: RuleOutcome): boolean {
  return (
    local.verdict === 'REFUND' &&
    local.reason === claim.claim &&
    local.payer === claim.payer.toLowerCase() &&
    local.amount_atomic === claim.amount_atomic
  );
}

/** USDC has 6 decimals on Base: atomic string -> decimal USD string for the refund ledger. */
export function atomicToUsd(atomic: string): string {
  const s = atomic.padStart(7, '0');
  return `${s.slice(0, -6)}.${s.slice(-6)}`;
}

/** Decimal USD -> atomic, for cap checks; null when not a plain non-negative decimal. */
export function capUsdToAtomic(usd: number): string {
  return String(Math.round(usd * 1_000_000));
}
