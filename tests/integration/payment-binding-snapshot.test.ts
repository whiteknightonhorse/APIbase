/**
 * T-INT-08 PB1: the money path of an ordinary tool (`tool:*`) must be byte-for-byte what it
 * was before PaymentBinding was introduced — the 402 body and the arguments handed to the
 * facilitator verify. The expectations below were captured BEFORE the escrow.stage.ts change
 * (first commit of the task) and are literal, not derived from the code under test.
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
jest.mock('@x402/core/http', () => ({
  decodePaymentSignatureHeader: jest.fn(() => ({ decoded: true })),
}));
jest.mock('@x402/core/schemas', () => ({
  parsePaymentPayload: jest.fn(() => ({
    success: true,
    data: {
      accepted: {},
      payload: {
        authorization: {
          from: '0xPAYER',
          to: '0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480',
          value: '250000',
          validAfter: '0',
          validBefore: '4102444800',
          nonce: '0xnonce-pb1',
        },
      },
    },
  })),
}));
const mockClaim = jest.fn().mockResolvedValue(true);
jest.mock('../../src/services/payment-nonce.service', () => ({
  claimPaymentNonce: (...a: unknown[]) => mockClaim(...a),
}));
const mockVerify = jest.fn();
jest.mock('../../src/services/x402-server.service', () => ({
  getSharedResourceServer: () => ({ verifyPayment: mockVerify }),
}));

import { escrowStage } from '../../src/pipeline/stages/escrow.stage';
import { buildPaymentRequiredResponse } from '../../src/middleware/x402.middleware';
import type { PipelineContext } from '../../src/pipeline/types';

const ctx = (o: Partial<PipelineContext> = {}) =>
  ({
    requestId: 'req-1',
    toolId: 'telnyx.send_sms_premium',
    toolPrice: 0.25,
    x402Paid: true,
    x402PaymentHeader: 'header-abc',
    ...o,
  }) as unknown as PipelineContext;

beforeEach(() => {
  mockVerify.mockReset();
  mockClaim.mockClear();
});

describe('PB1 tool:* snapshot', () => {
  it('402 body for a tool is unchanged', () => {
    expect(
      buildPaymentRequiredResponse('telnyx.send_sms_premium', 0.25, 1, 'req-1', 'apibase.pro'),
    ).toEqual({
      x402Version: 2,
      error: 'payment_required',
      resource: {
        url: 'https://apibase.pro/api/v1/tools/telnyx.send_sms_premium/call',
        mimeType: 'application/json',
        description: 'Tool invocation: telnyx.send_sms_premium',
      },
      accepts: [
        {
          scheme: 'exact',
          network: 'eip155:8453',
          amount: '250000',
          asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          payTo: '0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480',
          maxTimeoutSeconds: 30,
          extra: { name: 'USD Coin', version: '2' },
        },
      ],
      request_id: 'req-1',
      error_code: 'PAYMENT_REQUIRED',
      suggested_action: 'add_payment',
      documentation_url: 'https://apibase.pro/frameworks#rest',
      price_usd: '0.25',
      min_balance_usd: '0.25',
      payment_address: '0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480',
      price_version: 1,
    });
  });

  it('verify receives the exact server requirements and the claim key is the nonce', async () => {
    mockVerify.mockResolvedValue({ isValid: true, payer: '0xPAYER' });
    const c = ctx();
    const res = await escrowStage.execute(c);
    expect(res.ok).toBe(true);
    expect(c.x402Payer).toBe('0xPAYER');
    expect(mockVerify).toHaveBeenCalledTimes(1);
    expect(mockVerify.mock.calls[0][1]).toEqual({
      scheme: 'exact',
      network: 'eip155:8453',
      asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      amount: '250000',
      payTo: '0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480',
      maxTimeoutSeconds: 30,
      extra: { name: 'USD Coin', version: '2' },
    });
    expect(mockClaim.mock.calls[0][0]).toBe('x402');
    expect(mockClaim.mock.calls[0][1]).toBe('0xnonce-pb1');
  });

  it('rejection error shape is unchanged', async () => {
    mockVerify.mockResolvedValue({ isValid: false, invalidReason: 'value_mismatch' });
    const res = await escrowStage.execute(ctx());
    expect(res).toEqual({
      ok: false,
      error: {
        code: 402,
        error: 'payment_required',
        message:
          'This tool costs $0.25. Provide a valid x402 (X-Payment header) payment for the exact amount.',
        extra: {
          price_usd: 0.25,
          payment_address: '0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480',
          price_version: 1,
        },
      },
    });
    expect(mockClaim).not.toHaveBeenCalled();
  });
});
