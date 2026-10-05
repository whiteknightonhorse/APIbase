/**
 * T-0256: ESCROW binds the MPP-paid amount to the tool price (not just to the
 * challenge). Fails closed on missing header/amount/undecodable credential.
 */
jest.mock('../../src/config/index', () => ({
  config: {
    X402_NETWORK: 'base',
    X402_PAYMENT_ADDRESS: '0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480',
    X402_FACILITATOR_URL: 'https://facilitator.example',
    X402_FACILITATOR_MODE: 'local',
    X402_OPERATOR_PRIVATE_KEY: '0x00',
    X402_BASE_RPC_URL: 'https://base.example',
    X402_BASE_SEPOLIA_RPC_URL: 'https://sepolia.example',
    X402_OPERATOR_MIN_ETH_BALANCE: 0.01,
  },
}));
jest.mock('../../src/services/escrow.service', () => ({
  reserve: jest.fn(),
  InsufficientFundsError: class InsufficientFundsError extends Error {},
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/services/x402-server.service', () => ({
  getSharedResourceServer: () => ({ verifyPayment: jest.fn() }),
}));
const mockClaim = jest.fn();
jest.mock('../../src/services/payment-nonce.service', () => ({
  claimPaymentNonce: (...a: unknown[]) => mockClaim(...a),
}));
const mockRefundOwed = jest.fn();
jest.mock('../../src/pipeline/stages/escrow-finalize.stage', () => ({
  recordMppRefundOwed: (...a: unknown[]) => mockRefundOwed(...a),
}));

import { escrowStage } from '../../src/pipeline/stages/escrow.stage';
import type { PipelineContext } from '../../src/pipeline/types';

function header(id = 'chal-1'): string {
  const json = JSON.stringify({
    challenge: { id, expires: new Date(Date.now() + 60_000).toISOString() },
  });
  return `Payment ${Buffer.from(json).toString('base64')}`;
}

function ctx(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    requestId: 'req-1',
    toolId: 'some.tool',
    toolPrice: 1.0,
    mppPaid: true,
    mppPayer: '0xPAYER',
    mppPaymentHeader: header(),
    mppAmount: '1',
    ...overrides,
  } as unknown as PipelineContext;
}

function expect402(res: Awaited<ReturnType<typeof escrowStage.execute>>): void {
  expect(res.ok).toBe(false);
  if (!res.ok) {
    expect(res.error.code).toBe(402);
    expect(res.error.error).toBe('payment_required');
  }
}

beforeEach(() => {
  mockClaim.mockReset().mockResolvedValue(true);
  mockRefundOwed.mockReset().mockResolvedValue(undefined);
});

describe('ESCROW MPP amount binding (T-0256)', () => {
  it('T1: $0.001 credential for a $1.00 tool → 402, no claim, refund owed', async () => {
    const res = await escrowStage.execute(ctx({ mppAmount: '0.001', toolPrice: 1.0 }));
    expect402(res);
    if (!res.ok) expect(res.error.message).toContain('This tool costs $1');
    expect(mockClaim).not.toHaveBeenCalled();
    expect(mockRefundOwed).toHaveBeenCalledTimes(1);
    expect(mockRefundOwed.mock.calls[0][1]).toBe('escrow_rejected:mpp_amount_mismatch');
  });

  it('T2: matching amount → ok, claim once, no refund owed', async () => {
    const res = await escrowStage.execute(ctx({ mppAmount: '0.25', toolPrice: 0.25 }));
    expect(res.ok).toBe(true);
    expect(mockClaim).toHaveBeenCalledTimes(1);
    expect(mockRefundOwed).not.toHaveBeenCalled();
  });

  it('T3: missing mppAmount → 402, no claim, refund owed', async () => {
    const res = await escrowStage.execute(ctx({ mppAmount: undefined }));
    expect402(res);
    expect(mockClaim).not.toHaveBeenCalled();
    expect(mockRefundOwed).toHaveBeenCalledTimes(1);
    expect(mockRefundOwed.mock.calls[0][1]).toBe('escrow_rejected:mpp_missing_amount');
  });

  it('T4: missing mppPaymentHeader → 402 (fail closed)', async () => {
    const res = await escrowStage.execute(ctx({ mppPaymentHeader: undefined }));
    expect402(res);
    expect(mockClaim).not.toHaveBeenCalled();
  });

  it('T5: undecodable credential with matching amount → 402, no claim, refund owed', async () => {
    const res = await escrowStage.execute(
      ctx({ mppPaymentHeader: 'Payment not-base64-json', mppAmount: '1', toolPrice: 1 }),
    );
    expect402(res);
    expect(mockClaim).not.toHaveBeenCalled();
    expect(mockRefundOwed).toHaveBeenCalledTimes(1);
    expect(mockRefundOwed.mock.calls[0][1]).toBe('escrow_rejected:mpp_credential_undecodable');
  });

  it('T6: integer micro-dollar equality — overpayment is rejected', async () => {
    const okRes = await escrowStage.execute(ctx({ toolPrice: 0.1, mppAmount: '0.1' }));
    expect(okRes.ok).toBe(true);
    const over = await escrowStage.execute(
      ctx({ toolPrice: 0.1, mppAmount: '0.10000001', mppPaymentHeader: header('chal-2') }),
    );
    expect402(over);
  });

  it('T7: free tool with mppPaid → ok, no claim', async () => {
    const res = await escrowStage.execute(ctx({ toolPrice: 0, mppAmount: undefined }));
    expect(res.ok).toBe(true);
    expect(mockClaim).not.toHaveBeenCalled();
  });
});
