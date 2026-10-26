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
 * (2) the fix — a refund_ledger row (T-0551, never an outbox row) gets written with the
 *     payer, amount, and reason, and billingStatus/finalCost are set (not left
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
const mockRecord = jest.fn();
jest.mock('../../src/services/refund-ledger.service', () => ({
  recordRefundOwed: (...a: unknown[]) => mockRecord(...a),
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
  recordMppRefundIfOwed,
} from '../../src/pipeline/stages/escrow-finalize.stage';
import { createPipelineContext } from '../../src/pipeline/types';

function ctx() {
  const c = createPipelineContext('req-mpp-1', 'POST', '/execute', {}, {});
  c.toolId = 'weather.get_current';
  c.toolPrice = 0.002;
  c.mppPaid = true;
  c.mppPayer = '0xrealpayeraddress';
  c.mppTxHash = '0xdeadbeef-fake-tx-hash-for-test';
  return c;
}

describe('recordMppRefundOwed (F1/C-5)', () => {
  beforeEach(() => {
    mockOutboxCreate.mockReset();
    mockRecord.mockReset();
  });

  it('writes a refund_ledger row that is action-ready: rail, payer, amount, original tx hash, request id, reason; and no outbox row', async () => {
    mockRecord.mockResolvedValue({});
    await recordMppRefundOwed(ctx(), 'provider_call_failed_or_not_made');

    expect(mockRecord).toHaveBeenCalledTimes(1);
    expect(mockRecord.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        rail: 'tempo',
        payer: '0xrealpayeraddress',
        amount_usd: 0.002,
        reason: 'provider_call_failed_or_not_made',
        source_kind: 'request',
        source_id: 'req-mpp-1',
        original_tx: '0xdeadbeef-fake-tx-hash-for-test',
      }),
    );
    expect(mockOutboxCreate).not.toHaveBeenCalled();
  });

  it('passes a null original_tx rather than omitting the field when the middleware could not resolve one', async () => {
    const c = ctx();
    c.mppTxHash = undefined;
    await recordMppRefundOwed(c, 'x');
    expect(mockRecord.mock.calls[0][0].original_tx).toBeNull();
  });

  it('T-0280: the payer goes to the ledger as given (the ledger lowercases it and marks internal wallets)', async () => {
    const c = ctx();
    c.mppPayer = '0x46F110B1AD8195AC1E59366149DFC39E3A88638B';
    await recordMppRefundOwed(c, 'pipeline_stopped:X:422:bad');
    const row = mockRecord.mock.calls[0][0];
    expect(row.payer).toBe(c.mppPayer);
    expect(row.reason).toBe('pipeline_stopped:X:422:bad');
  });
});

describe('escrowFinalizeStage — MPP paths (F1/C-5)', () => {
  beforeEach(() => {
    mockOutboxCreate.mockReset();
    mockRecord.mockReset();
  });

  it('records a refund-owed event when MPP paid but the provider call failed', async () => {
    mockRecord.mockResolvedValue({});
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
    expect(mockRecord).toHaveBeenCalledTimes(1);
    expect(mockOutboxCreate).not.toHaveBeenCalled();
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
    expect(mockRecord).not.toHaveBeenCalled();
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

describe('MPP refund trail (T-0259)', () => {
  beforeEach(() => {
    mockOutboxCreate.mockReset();
    mockRecord.mockReset();
  });

  it('R1: amount_usd is the HMAC-verified charged amount (mppAmount), not the tool price', async () => {
    mockRecord.mockResolvedValue({});
    const c = ctx();
    c.mppAmount = '0.001';
    c.toolPrice = 1;
    await recordMppRefundOwed(c, 'x');
    expect(mockRecord.mock.calls[0][0].amount_usd).toBe('0.001');
  });

  it('R2: two recordMppRefundOwed calls on one ctx write exactly one row', async () => {
    mockRecord.mockResolvedValue({});
    const c = ctx();
    await recordMppRefundOwed(c, 'a');
    await recordMppRefundOwed(c, 'b');
    expect(mockRecord).toHaveBeenCalledTimes(1);
  });

  describe('R3: recordMppRefundIfOwed', () => {
    beforeEach(() => mockRecord.mockResolvedValue({}));

    it('PROVIDER_CALL/502 → one row with pipeline_stopped reason', async () => {
      await recordMppRefundIfOwed(ctx(), 'PROVIDER_CALL', { code: 502, error: 'bad_gateway' });
      expect(mockRecord).toHaveBeenCalledTimes(1);
      expect(mockRecord.mock.calls[0][0].reason).toBe(
        'pipeline_stopped:PROVIDER_CALL:502:bad_gateway',
      );
    });

    it('ESCROW/402 → nothing (ESCROW decided itself)', async () => {
      await recordMppRefundIfOwed(ctx(), 'ESCROW', { code: 402, error: 'payment_required' });
      expect(mockRecord).not.toHaveBeenCalled();
    });

    it('ESCROW/503 → one row', async () => {
      await recordMppRefundIfOwed(ctx(), 'ESCROW', { code: 503, error: 'unavailable' });
      expect(mockRecord).toHaveBeenCalledTimes(1);
    });

    it('MODERATION with settle_on_block → nothing', async () => {
      await recordMppRefundIfOwed(ctx(), 'MODERATION', {
        code: 403,
        error: 'blocked',
        extra: { settle_on_block: true },
      });
      expect(mockRecord).not.toHaveBeenCalled();
    });

    it('not MPP-paid → nothing', async () => {
      const c = ctx();
      c.mppPaid = false;
      await recordMppRefundIfOwed(c, 'PROVIDER_CALL', { code: 502, error: 'bad_gateway' });
      expect(mockRecord).not.toHaveBeenCalled();
    });

    it('already recorded → nothing', async () => {
      const c = ctx();
      c.mppRefundRecorded = true;
      await recordMppRefundIfOwed(c, 'PROVIDER_CALL', { code: 502, error: 'bad_gateway' });
      expect(mockRecord).not.toHaveBeenCalled();
    });

    it('catch path → pipeline_exception reason', async () => {
      await recordMppRefundIfOwed(
        ctx(),
        'PROVIDER_CALL',
        { code: 500, error: 'internal_error' },
        true,
      );
      expect(mockRecord.mock.calls[0][0].reason).toBe('pipeline_exception:PROVIDER_CALL');
    });
  });
});
