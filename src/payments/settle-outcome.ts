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
 * T-0658 / T-0883: classify a settle FAILURE (`success:false` or a throw) by what it tells us about
 * the chain. Line numbers are @x402/evm 2.30.0 dist/cjs/exact/facilitator/index.js.
 * - 'pending': outcome unknown, the chain reconcile (x402-settle-pending job) decides by
 *   authorizationUsed(payer, nonce); an unused authorization becomes x402_settle_failed at validBefore.
 *   a) `invalid_exact_evm_transaction_failed` with NO transaction hash. Sources: the settleEIP3009
 *      catch (:1515-1523, writeContract or the 6492 deploy threw; parseEip3009TransferError
 *      :1026-1045 falls through to this reason for any message it does not recognise) and
 *      invalidBroadcastHashResponse (:566-575 via :1087, the signer returned no valid hash). The tx
 *      may have landed (prod 2026-11-03..05: six such rows, two authorizations USED on chain).
 *      The same reason WITH a hash (reverted receipt :1094-1101, store-persist failure :1129-1137)
 *      is KNOWN failed. No message regex: an unrecognised throw before a hash is unknown by definition.
 *      Two more SDK returns give the bare reason with `transaction: ""`, only when the thrown value is
 *      not an Error: mapSettleError (:1637-1670, Permit2 settle :2151/:2183/:2200) and the v1 scheme
 *      catch (:2491-2498; for an Error it puts the raw message in errorReason, which stays 'failed').
 *      A Permit2 payload has no `authorization`, so extractAuthorization gives no nonce and a
 *      'pending' row from it carries neither tx_hash nor nonce: the pending job can never close it
 *      (it stays pending, never failed). APIbase does not advertise Permit2 (requirements carry no
 *      assetTransferMethod) and prod logs show no `permit2` line in the 30 days to 2026-11-17.
 *   b) suffixed `invalid_exact_evm_transaction_failed: <message>` from mapSettleError (:1637-1670,
 *      Permit2 path), also an exception while broadcasting/waiting (same no-nonce caveat).
 *   c) a `settle_threw` whose message is a timeout/transport error.
 * - 'retry': a settle-time signature verdict after a verify that passed at ESCROW is an RPC
 *   failure and nothing was broadcast. getCode throw -> `invalid_exact_evm_failed_to_verify_signature`
 *   (classifyErc6492Payer :711-735, returned at :1219-1229); ERC-1271 readContract throw is caught
 *   to false (verifyERC1271 :788-801) -> `invalid_exact_evm_signature` (:1273-1279). One retry is
 *   allowed when the validBefore window has >= 15 s left and the failed attempt returned in < 10 s.
 *   Otherwise 'pending'.
 * - 'failed': everything else (the specific reasons parseEip3009TransferError maps to included).
 */
export type SettleVerdict = 'retry' | 'pending' | 'failed';
export const UNKNOWN_THROWN_RE = /^invalid_exact_evm_transaction_failed:\s/;
export const TRANSACTION_FAILED_REASON = 'invalid_exact_evm_transaction_failed';
export const SIG_RPC_REASONS: readonly string[] = [
  'invalid_exact_evm_signature',
  'invalid_exact_evm_failed_to_verify_signature',
];
const TRANSPORT_RE = /timeout|timed out|ETIMEDOUT|ECONNRESET|fetch failed/i;

/** Bare `invalid_exact_evm_transaction_failed` and no broadcast hash: the settle threw before a hash. */
export function isThrownBeforeHash(reason: unknown, transaction: unknown): boolean {
  return reason === TRANSACTION_FAILED_REASON && settleTxHash({ transaction }) === undefined;
}

/** A settle-time signature verdict after a passed ESCROW verify: an RPC failure, nothing broadcast. */
export function isSigRpcReason(reason: unknown): boolean {
  return typeof reason === 'string' && SIG_RPC_REASONS.includes(reason);
}

export function settleOutcomeIsUnknown(
  reason: unknown,
  message: unknown,
  opts: {
    validBeforeSec?: number;
    nowSec?: number;
    elapsedMs?: number;
    retried?: boolean;
    transaction?: unknown;
  } = {},
): SettleVerdict {
  const r = typeof reason === 'string' ? reason : '';
  const m = typeof message === 'string' ? message : '';
  if (UNKNOWN_THROWN_RE.test(r)) return 'pending';
  if (isThrownBeforeHash(r, opts.transaction)) return 'pending';
  if (r === 'settle_threw' && TRANSPORT_RE.test(m)) return 'pending';
  if (isSigRpcReason(r)) {
    const left =
      opts.validBeforeSec !== undefined && opts.nowSec !== undefined
        ? opts.validBeforeSec - opts.nowSec
        : -1;
    const fast = opts.elapsedMs !== undefined && opts.elapsedMs < 10_000;
    return !opts.retried && left >= 15 && fast ? 'retry' : 'pending';
  }
  return 'failed';
}
