import type { BatchCallInput } from '../adapters/platform/types';
import type { PipelineError } from '../pipeline/types';

/**
 * Rewrite a sub-call's pipeline error for a batch caller (fix 1a, 2026-09-01).
 *
 * ESCROW's generic 402 message tells the client to "provide x402/MPP
 * payment" -- correct advice for /execute and /mcp, misleading here: there
 * is no field on a BatchCallInput to attach a signed payment to. Say that
 * plainly instead of repeating an instruction the caller cannot act on.
 *
 * Split into its own file (type-only imports, no runtime deps) so it stays
 * unit-testable without bootstrapping config/Redis/Prisma the way importing
 * batch.service.ts itself would.
 */
export function explainBatchError(call: BatchCallInput, error: PipelineError): string {
  if (error.code === 402) {
    return (
      `Tool "${call.tool_id}" costs money and this was a cache MISS. Batch calls carry no ` +
      'payment-header field (BatchCallInput has no x402/MPP slot) -- only a cache HIT or a ' +
      'free tool can be billed inside /batch. Call this tool directly via /execute or /mcp ' +
      'with a signed payment instead.'
    );
  }
  return error.message;
}
