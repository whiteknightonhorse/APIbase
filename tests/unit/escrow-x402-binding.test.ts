/**
 * Tests for the x402 payment-binding gate in the ESCROW stage (issue #103).
 *
 * The ESCROW stage must verify the signed x402 authorization against
 * SERVER-trusted requirements (payTo / asset / network / exact amount), NOT the
 * client-supplied payload.accepted. A tampered (under-amount, redirected payTo,
 * wrong network) payment must be rejected with 402 even though the middleware
 * structurally accepted the header.
 */

// Minimal env so the REAL config/x402.config loads (toMicroUsdc /
// buildServerX402Requirements are exercised, not stubbed).
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

// escrow.service pulls Prisma — stub it (the x402 path never reserves balance).
jest.mock('../../src/services/escrow.service', () => ({
  reserve: jest.fn(),
  InsufficientFundsError: class InsufficientFundsError extends Error {},
}));

jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// x402 payload decode/parse — return a well-formed-enough payload.
jest.mock('@x402/core/http', () => ({
  decodePaymentSignatureHeader: jest.fn(() => ({ decoded: true })),
}));
jest.mock('@x402/core/schemas', () => ({
  parsePaymentPayload: jest.fn(() => ({ success: true, data: { accepted: {} } })),
}));

// The facilitator verify — controlled per test.
const mockVerify = jest.fn();
jest.mock('../../src/services/x402-server.service', () => ({
  getSharedResourceServer: () => ({ verifyPayment: mockVerify }),
}));

import { escrowStage } from '../../src/pipeline/stages/escrow.stage';
import { toMicroUsdc, buildServerX402Requirements } from '../../src/config/x402.config';
import { buildPaymentRequiredResponse } from '../../src/middleware/x402.middleware';
import type { PipelineContext } from '../../src/pipeline/types';

const RECEIVER = '0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480';

function ctx(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    requestId: 'req-1',
    toolId: 'telnyx.send_sms_premium',
    toolPrice: 0.25,
    x402Paid: true,
    x402PaymentHeader: 'header-abc',
    ...overrides,
  } as unknown as PipelineContext;
}

beforeEach(() => {
  mockVerify.mockReset();
});

describe('ESCROW x402 binding (issue #103)', () => {
  it('accepts a payment the facilitator validates against server requirements', async () => {
    mockVerify.mockResolvedValue({ isValid: true, payer: '0xPAYER' });

    const c = ctx();
    const res = await escrowStage.execute(c);

    expect(res.ok).toBe(true);
    expect(c.x402Payer).toBe('0xPAYER'); // authoritative payer for the ledger
    // Verified against SERVER price/payTo, not client values.
    const reqs = mockVerify.mock.calls[0][1];
    expect(reqs.amount).toBe(toMicroUsdc(0.25));
    expect(reqs.payTo).toBe(RECEIVER);
  });

  it.each([
    'invalid_exact_evm_payload_authorization_value_mismatch', // underpayment
    'invalid_exact_evm_payload_recipient_mismatch', // redirected payTo
    'network_mismatch', // wrong chain
  ])('rejects with 402 when facilitator returns %s', async (reason) => {
    mockVerify.mockResolvedValue({ isValid: false, invalidReason: reason });

    const res = await escrowStage.execute(ctx());

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe(402);
      expect(res.error.error).toBe('payment_required');
      expect(res.error.extra?.price_usd).toBe(0.25);
    }
  });

  it('fails closed with 502 when the facilitator throws', async () => {
    mockVerify.mockRejectedValue(new Error('rpc down'));

    const res = await escrowStage.execute(ctx());

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe(502);
  });

  it('rejects with 402 when the payment header is missing', async () => {
    const res = await escrowStage.execute(ctx({ x402PaymentHeader: undefined }));

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe(402);
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('skips verification for a free tool (price 0)', async () => {
    const res = await escrowStage.execute(ctx({ toolPrice: 0 }));

    expect(res.ok).toBe(true);
    expect(mockVerify).not.toHaveBeenCalled();
  });
});

describe('x402 amount rounding consistency', () => {
  it.each([0.001, 0.0005, 0.012, 0.0015, 0.25])(
    'challenge and binding requirements agree for $%s',
    (price) => {
      const challengeAmount = (
        buildPaymentRequiredResponse('some.tool', price, 1, 'req').accepts as Array<{
          amount: string;
        }>
      )[0].amount;
      expect(buildServerX402Requirements(price).amount).toBe(challengeAmount);
      expect(challengeAmount).toBe(toMicroUsdc(price));
    },
  );
});
