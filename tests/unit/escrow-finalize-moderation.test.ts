/**
 * F2/C-3 settle-on-block money check.
 *
 * "A blocked PAID request settles for real, and a ledger row exists with
 * rule_id/category/appeal_id" is not provable by reading the code — this
 * proves it against the actual ESCROW_FINALIZE + LEDGER_WRITE stages, for
 * all three payment rails a paid call can arrive on: on-chain x402 (settle
 * via the facilitator), MPP (already charged at verification time, just
 * needs to stay marked PAID), and prepaid balance escrow (the finalize()
 * UPDATE must actually run and carry the moderation columns).
 */

const mockOutboxCreate = jest.fn();
jest.mock('../../src/services/prisma.service', () => ({
  getPrisma: () => ({ outbox: { create: mockOutboxCreate } }),
}));
jest.mock('../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

const mockFinalize = jest.fn();
jest.mock('../../src/services/escrow.service', () => ({
  finalize: (...a: unknown[]) => mockFinalize(...a),
  refund: jest.fn(),
}));

const mockSettleX402 = jest.fn();
jest.mock('../../src/pipeline/stages/x402-settle', () => ({
  settleX402: (...a: unknown[]) => mockSettleX402(...a),
}));

const mockWriteX402Entry = jest.fn();
jest.mock('../../src/services/ledger.service', () => ({
  writeDirectCharge: jest.fn(),
  writeFreeEntry: jest.fn(),
  writeSharedEntry: jest.fn(),
  writeX402Entry: (...a: unknown[]) => mockWriteX402Entry(...a),
  CACHE_HIT_COST_MULTIPLIER: 0.1,
}));

import { escrowFinalizeStage } from '../../src/pipeline/stages/escrow-finalize.stage';
import { ledgerWriteStage } from '../../src/pipeline/stages/ledger-write.stage';
import { createPipelineContext } from '../../src/pipeline/types';

function blockedCtx() {
  const c = createPipelineContext('req-block-1', 'POST', '/execute', {}, {});
  c.toolId = 'twilio.send_sms';
  c.toolPrice = 0.05;
  c.executionId = 'exec-block-1';
  c.agentId = 'agent-block-1';
  c.moderationBlocked = true;
  c.moderationRuleId = 'drugs_exact_buy_cocaine';
  c.moderationCategory = 'drugs';
  c.moderationAppealId = 'appeal-block-1';
  return c;
}

beforeEach(() => {
  mockOutboxCreate.mockReset();
  mockFinalize.mockReset();
  mockFinalize.mockResolvedValue(1);
  mockSettleX402.mockReset();
  mockSettleX402.mockResolvedValue(undefined);
  mockWriteX402Entry.mockReset();
  mockWriteX402Entry.mockResolvedValue(undefined);
});

describe('settle-on-block — ESCROW_FINALIZE (F2/C-3)', () => {
  it('x402 rail: settles via the facilitator and marks PAID even though the provider was never called', async () => {
    const c = blockedCtx();
    c.x402Paid = true;
    c.x402PaymentHeader = 'x-payment-test-header';

    const result = await escrowFinalizeStage.execute(c);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.billingStatus).toBe('PAID');
      expect(result.value.finalCost).toBe(0.05);
    }
    expect(mockSettleX402).toHaveBeenCalledTimes(1);
  });

  it('MPP rail: stays PAID (already charged at verification time) — no refund-owed record for a moderation block', async () => {
    const c = blockedCtx();
    c.mppPaid = true;
    c.mppPayer = '0xpayer';

    const result = await escrowFinalizeStage.execute(c);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.billingStatus).toBe('PAID');
      expect(result.value.finalCost).toBe(0.05);
    }
    // This is the exact branch that used to record mpp_refund_owed on any
    // "no response to serve" case — a moderation block must NOT look like
    // a provider failure and trigger a refund-owed page.
    expect(mockOutboxCreate).not.toHaveBeenCalled();
  });

  it('balance-escrow rail: finalize() actually runs (charge posts) and carries rule_id/category/appeal_id', async () => {
    const c = blockedCtx();
    c.escrowId = 'exec-block-1';
    c.escrowAmount = 0.05;
    c.escrowCreatedAt = new Date('2026-09-01T00:00:00Z');

    const result = await escrowFinalizeStage.execute(c);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.billingStatus).toBe('PAID');
      expect(result.value.finalCost).toBe(0.05);
    }
    expect(mockFinalize).toHaveBeenCalledTimes(1);
    const [executionId, createdAt, , moderation] = mockFinalize.mock.calls[0];
    expect(executionId).toBe('exec-block-1');
    expect(createdAt).toEqual(c.escrowCreatedAt);
    expect(moderation).toEqual({
      ruleId: 'drugs_exact_buy_cocaine',
      category: 'drugs',
      appealId: 'appeal-block-1',
    });
  });

  it('control: an UNBLOCKED balance-escrow success still finalizes with no moderation info (regression guard)', async () => {
    const c = createPipelineContext('req-ok-1', 'POST', '/execute', {}, {});
    c.toolId = 'weather.get_current';
    c.toolPrice = 0.01;
    c.escrowId = 'exec-ok-1';
    c.escrowAmount = 0.01;
    c.escrowCreatedAt = new Date('2026-09-01T00:00:00Z');
    c.providerCalled = true;
    c.providerResponse = { data: { ok: true } };

    const result = await escrowFinalizeStage.execute(c);
    expect(result.ok).toBe(true);
    expect(mockFinalize).toHaveBeenCalledTimes(1);
    expect(mockFinalize.mock.calls[0][3]).toBeUndefined();
  });
});

describe('settle-on-block — LEDGER_WRITE writes moderation fields for the x402/MPP rail (F2/C-3)', () => {
  it('writes moderation_rule_id/category/appeal_id into the x402 ledger entry', async () => {
    const c = blockedCtx();
    c.x402Paid = true;
    c.x402Payer = '0xpayer';
    c.billingStatus = 'PAID'; // set by ESCROW_FINALIZE before LEDGER_WRITE runs

    const result = await ledgerWriteStage.execute(c);

    expect(result.ok).toBe(true);
    expect(mockWriteX402Entry).toHaveBeenCalledTimes(1);
    const entry = mockWriteX402Entry.mock.calls[0][0];
    expect(entry.moderation).toEqual({
      ruleId: 'drugs_exact_buy_cocaine',
      category: 'drugs',
      appealId: 'appeal-block-1',
    });
  });

  it('control: an unblocked x402 ledger entry carries no moderation field', async () => {
    const c = createPipelineContext('req-ok-2', 'POST', '/execute', {}, {});
    c.toolId = 'weather.get_current';
    c.toolPrice = 0.01;
    c.executionId = 'exec-ok-2';
    c.agentId = 'agent-ok-2';
    c.x402Paid = true;
    c.x402Payer = '0xpayer';
    c.billingStatus = 'PAID';

    await ledgerWriteStage.execute(c);
    expect(mockWriteX402Entry.mock.calls[0][0].moderation).toBeUndefined();
  });
});
