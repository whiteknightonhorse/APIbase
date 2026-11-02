/**
 * T-0428: an x402 settle has three outcomes, not two. `settlement_pending` (transaction broadcast,
 * receipt not seen) and a facilitator timeout (outcome indeterminate) are UNKNOWN: they are
 * resolved only by reading the chain, and nobody calls settle again for the same authorization.
 */

export const SETTLEMENT_PENDING_REASON = 'settlement_pending';

/** @x402/core FacilitatorTimeoutError, matched by name so a bundled/mocked copy still counts. */
export function isFacilitatorTimeout(e: unknown): boolean {
  return e instanceof Error && e.name === 'FacilitatorTimeoutError';
}

/** `success:false, errorReason:'settlement_pending'` carrying a broadcast hash. */
export function isSettlementPending(result: unknown): boolean {
  if (typeof result !== 'object' || result === null) return false;
  const r = result as Record<string, unknown>;
  const reason = r.errorReason ?? r.error;
  return (
    r.success === false &&
    reason === SETTLEMENT_PENDING_REASON &&
    typeof r.transaction === 'string' &&
    r.transaction.length > 0
  );
}

/** The EIP-3009 fields the reconcile job needs, read from a decoded payment payload. */
export function extractAuthorization(
  payload: unknown,
): { nonce: string; validBefore: string } | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const inner = (payload as { payload?: unknown }).payload;
  if (typeof inner !== 'object' || inner === null) return undefined;
  const a = (inner as { authorization?: unknown }).authorization;
  if (typeof a !== 'object' || a === null) return undefined;
  const { nonce, validBefore } = a as Record<string, unknown>;
  if (typeof nonce !== 'string') return undefined;
  return { nonce, validBefore: String(validBefore ?? '') };
}

/** The broadcast hash of a settle result, if it carries one. */
export function settleTxHash(result: unknown): string | undefined {
  const t = (result as { transaction?: unknown } | null)?.transaction;
  return typeof t === 'string' && t.length > 0 ? t : undefined;
}

/**
 * T-0658: classify a settle FAILURE (`success:false` or a throw) by what it tells us about the chain.
 * - 'pending': outcome unknown, the chain reconcile decides. Two SDK meanings of
 *   `invalid_exact_evm_transaction_failed` (@x402/evm exact/facilitator/index.js): bare (:1231,
 *   receipt reverted / Transfer mismatch) is KNOWN failed; suffixed `: <message>` from
 *   mapSettleError (:1492-1516) is an exception while broadcasting/waiting, so the tx may have landed.
 *   Also a `settle_threw` whose message is a timeout/transport error.
 * - 'retry': settle-time `invalid_exact_evm_signature` after a verify that passed at ESCROW is an RPC
 *   verdict (getCode error, :659-666), nothing was broadcast; one retry is allowed when the
 *   validBefore window has >= 15 s left and the failed attempt returned in < 10 s. Otherwise 'pending'.
 * - 'failed': everything else.
 */
export type SettleVerdict = 'retry' | 'pending' | 'failed';
export const UNKNOWN_THROWN_RE = /^invalid_exact_evm_transaction_failed:\s/;
const TRANSPORT_RE = /timeout|timed out|ETIMEDOUT|ECONNRESET|fetch failed/i;

export function settleOutcomeIsUnknown(
  reason: unknown,
  message: unknown,
  opts: { validBeforeSec?: number; nowSec?: number; elapsedMs?: number; retried?: boolean } = {},
): SettleVerdict {
  const r = typeof reason === 'string' ? reason : '';
  const m = typeof message === 'string' ? message : '';
  if (UNKNOWN_THROWN_RE.test(r)) return 'pending';
  if (r === 'settle_threw' && TRANSPORT_RE.test(m)) return 'pending';
  if (r === 'invalid_exact_evm_signature') {
    const left =
      opts.validBeforeSec !== undefined && opts.nowSec !== undefined
        ? opts.validBeforeSec - opts.nowSec
        : -1;
    const fast = opts.elapsedMs !== undefined && opts.elapsedMs < 10_000;
    return !opts.retried && left >= 15 && fast ? 'retry' : 'pending';
  }
  return 'failed';
}
