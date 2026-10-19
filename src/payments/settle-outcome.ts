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
