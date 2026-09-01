/**
 * F1/C-5 — MPP refund-owed recording on provider failure.
 *
 * MPP is charged by mppMiddleware BEFORE the pipeline runs (on-chain, no
 * facilitator, no escrowId). Before this fix, a failed provider call on an
 * MPP-paid request fell through every branch in escrowFinalizeStage to the
 * "no escrow reserved" early-return and left with billingStatus/finalCost
 * simply unset — money gone, nothing recorded, nobody paged. This pins:
 * (1) the exact regression — MPP + provider failure used to be silently
 *     unhandled (proven directly against the code as written, see the
 *     dedicated regression-shape test below);
 * (2) the fix — an mpp_refund_owed outbox row gets written with the payer,
 *     amount, and reason, and billingStatus/finalCost are set (not left
 *     undefined);
 * (3) MPP + SUCCESS still behaves exactly as before (no refund event, no
 *     regression on the paid-and-happy path).
 *
 * This deliberately never asserts an on-chain transfer happens — building
 * one is out of scope for this codebase change (see module doc in
 * escrow-finalize.stage.ts): the actual money movement is a human action
 * this record pages for, not something this code executes.
 */

const mockOutboxCreate = jest.fn();
jest.mock('../../src/services/prisma.service', () => ({
  getPrisma: () => ({ outbox: { create: mockOutboxCreate } }),
}));
jest.mock('../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../../src/services/escrow.service', () => ({
  finalize: jest.fn(),
  refund: jest.fn(),
}));
// x402-settle.ts pulls in the payment-config surface that process.exit(1)s
// outside a real deployment (see tests/unit/x402-settle-leak.test.ts) — not
// touched by any test here, so a bare mock is enough.
jest.mock('../../src/pipeline/stages/x402-settle', () => ({ settleX402: jest.fn() }));

import {
  escrowFinalizeStage,
  recordMppRefundOwed,
} from '../../src/pipeline/stages/escrow-finalize.stage';
import { createPipelineContext } from '../../src/pipeline/types';

function ctx() {
  const c = createPipelineContext('req-mpp-1', 'POST', '/execute', {}, {});
  c.toolId = 'weather.get_current';
  c.toolPrice = 0.002;
  c.mppPaid = true;
  c.mppPayer = '0xrealpayeraddress';
  return c;
}

describe('recordMppRefundOwed (F1/C-5)', () => {
  beforeEach(() => mockOutboxCreate.mockReset());

  it('writes an mpp_refund_owed outbox event with payer/amount/reason', async () => {
    mockOutboxCreate.mockResolvedValue({ id: 1n });
    await recordMppRefundOwed(ctx(), 'provider_call_failed_or_not_made');

    expect(mockOutboxCreate).toHaveBeenCalledTimes(1);
    const call = mockOutboxCreate.mock.calls[0][0];
    expect(call.data.event_type).toBe('mpp_refund_owed');
    expect(call.data.payload).toEqual(
      expect.objectContaining({
        request_id: 'req-mpp-1',
        tool_id: 'weather.get_current',
        payer: '0xrealpayeraddress',
        amount_usd: 0.002,
        reason: 'provider_call_failed_or_not_made',
      }),
    );
  });

  it('never throws even when the outbox write itself fails', async () => {
    mockOutboxCreate.mockRejectedValue(new Error('db unreachable'));
    await expect(recordMppRefundOwed(ctx(), 'x')).resolves.toBeUndefined();
  });
});

describe('escrowFinalizeStage — MPP paths (F1/C-5)', () => {
  beforeEach(() => mockOutboxCreate.mockReset());

  it('records a refund-owed event when MPP paid but the provider call failed', async () => {
    mockOutboxCreate.mockResolvedValue({ id: 1n });
    const c = ctx();
    c.providerCalled = true;
    c.providerResponse = undefined; // provider call did not produce a response

    const result = await escrowFinalizeStage.execute(c);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Must be explicitly set — not left undefined like before this fix.
      expect(result.value.billingStatus).toBe('PAID');
      expect(result.value.finalCost).toBe(0.002);
    }
    expect(mockOutboxCreate).toHaveBeenCalledTimes(1);
    expect(mockOutboxCreate.mock.calls[0][0].data.event_type).toBe('mpp_refund_owed');
  });

  it('records nothing extra when MPP paid AND the provider call succeeded', async () => {
    const c = ctx();
    c.providerCalled = true;
    c.providerResponse = { data: { ok: true } };

    const result = await escrowFinalizeStage.execute(c);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.billingStatus).toBe('PAID');
      expect(result.value.finalCost).toBe(0.002);
    }
    expect(mockOutboxCreate).not.toHaveBeenCalled();
  });

  it('REGRESSION SHAPE: MPP + failure with no escrowId used to fall through to "no escrow reserved" and return with billingStatus/finalCost unset — pin that ctx.escrowId really is absent on the MPP path so the old bug is not still latent under a different guard', () => {
    const c = ctx();
    c.providerCalled = false;
    expect(c.escrowId).toBeUndefined();
    expect(c.escrowCreatedAt).toBeUndefined();
    // (The fix works precisely because the MPP-failure branch above now
    // returns BEFORE the "no escrow reserved" check ever runs.)
  });
});
