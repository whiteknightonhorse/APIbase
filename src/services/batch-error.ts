import type { BatchCallInput } from '../adapters/platform/types';
import type { PipelineError } from '../pipeline/types';

/**
 * Rewrite a sub-call's pipeline error for a batch caller (fix 1a, 2026-09-01;
 * narrowed 2026-09-02 per the ESCROW balance-rail fix).
 *
 * Before 2026-09-02, EVERY 402 out of ESCROW meant "no x402/MPP payment was
 * presented and there is nowhere on a BatchCallInput to attach one" -- this
 * function used to rewrite all of them into a message saying so. That is no
 * longer true: ESCROW now funds a cache-MISS paid tool from the calling
 * agent's balance when no signed payment is presented, so a 402 today
 * usually means the reserve itself failed (no account, or insufficient
 * balance) -- a real, actionable reason that should reach the caller as-is,
 * not be overwritten with advice about a payment-header field that was never
 * the actual constraint anymore. Only the OLDER message shape (one that
 * still names x402/MPP -- i.e. genuinely nowhere to attach a payment, such
 * as a free-tier gate rejecting the request before reserve() is ever
 * reached) still gets rewritten; every other error, including the balance
 * ones, passes through unchanged.
 *
 * Split into its own file (type-only imports, no runtime deps) so it stays
 * unit-testable without bootstrapping config/Redis/Prisma the way importing
 * batch.service.ts itself would.
 */
export function explainBatchError(call: BatchCallInput, error: PipelineError): string {
  if (error.code === 402 && /x402|mpp/i.test(error.message)) {
    return (
      `Tool "${call.tool_id}" costs money and this was a cache MISS. Batch calls carry no ` +
      'payment-header field (BatchCallInput has no x402/MPP slot) -- only a cache HIT or a ' +
      'free tool can be billed inside /batch. Call this tool directly via /execute or /mcp ' +
      'with a signed payment instead.'
    );
  }
  return error.message;
}
