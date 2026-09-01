/**
 * Batch payment-error message clarity (fix 1a, 2026-09-01).
 *
 * BatchCallInput carries no payment-header field, so ESCROW's generic 402
 * ("provide x402/MPP payment") is misleading inside /batch — there is
 * nowhere on a batch call to attach one. explainBatchError() rewrites that
 * specific case; every other error passes through unchanged (behavior is
 * not changing, only the message on this one path).
 */

import { explainBatchError } from '../../src/services/batch-error';
import type { PipelineError } from '../../src/pipeline/types';

const call = { tool_id: 'twilio.send_sms', params: {} };

describe('explainBatchError', () => {
  it('rewrites a 402 into a message naming the actual constraint (no payment field in batch)', () => {
    const error: PipelineError = {
      code: 402,
      error: 'payment_required',
      message: 'This tool costs $0.05. Provide x402 (X-Payment header) or MPP payment.',
    };
    const message = explainBatchError(call, error);
    expect(message).toMatch(/no.*payment-header field/i);
    expect(message).toMatch(/cache HIT/i);
    expect(message).not.toBe(error.message);
  });

  it('leaves every other error message untouched', () => {
    const error: PipelineError = {
      code: 404,
      error: 'not_found',
      message: 'Tool not found: twilio.bogus_tool',
    };
    expect(explainBatchError(call, error)).toBe(error.message);
  });
});
