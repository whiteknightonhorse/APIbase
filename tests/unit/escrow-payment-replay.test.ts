/**
 * Payment replay guard (A-01).
 *
 * ESCROW's x402/MPP verification is stateless: the same signed authorization,
 * presented N times in parallel, passes verify N times — nothing stopped
 * PROVIDER_CALL (and the paid data) from being reached more than once for a
 * single signed payment. This test proves the Redis SET-NX claim added to
 * ESCROW makes each signed payment single-use: two concurrent requests
 * carrying the identical signed authorization must yield exactly one 200 and
 * one 402 "already consumed".
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

// The x402 nonce is derived 1:1 from the raw X-Payment header value, so tests
// can control "same signed payment" (same header) vs "different signed
// payment" (different header) without a stateful mock.
jest.mock('@x402/core/http', () => ({
  decodePaymentSignatureHeader: jest.fn((header: string) => ({ header })),
}));
jest.mock('@x402/core/schemas', () => ({
  parsePaymentPayload: jest.fn((decoded: { header: string }) => ({
    success: true,
    data: {
      accepted: {},
      payload: {
        authorization: {
          from: '0xPAYER',
          to: '0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480',
          value: '250000',
          validAfter: '0',
          validBefore: String(Math.floor(Date.now() / 1000) + 60),
          nonce: decoded.header,
        },
      },
    },
  })),
}));

const mockVerify = jest.fn();
jest.mock('../../src/services/x402-server.service', () => ({
  getSharedResourceServer: () => ({ verifyPayment: mockVerify }),
}));

// Fake Redis — real SET-NX atomicity (first claimer wins), no network.
function createFakeRedis() {
  const store = new Map<string, number>(); // key -> expiry epoch ms

  return {
    async set(key: string, _value: string, ...args: unknown[]): Promise<'OK' | null> {
      const now = Date.now();
      const expiry = store.get(key);
      const alive = expiry !== undefined && expiry > now;
      const nx = args.includes('NX');
      if (alive && nx) return null;
      const exIdx = args.indexOf('EX');
      const ttlSeconds = exIdx >= 0 ? Number(args[exIdx + 1]) : undefined;
      store.set(key, ttlSeconds ? now + ttlSeconds * 1000 : Infinity);
      return 'OK';
    },
  };
}

const fakeRedis = createFakeRedis();
jest.mock('../../src/services/redis.service', () => ({
  ensureRedisConnected: async () => fakeRedis,
  getSharedRedis: () => fakeRedis,
}));

import { escrowStage } from '../../src/pipeline/stages/escrow.stage';
import type { PipelineContext } from '../../src/pipeline/types';

function ctx(requestId: string, paymentHeader: string): PipelineContext {
  return {
    requestId,
    toolId: 'telnyx.send_sms_premium',
    toolPrice: 0.25,
    x402Paid: true,
    x402PaymentHeader: paymentHeader,
  } as unknown as PipelineContext;
}

beforeEach(() => {
  mockVerify.mockReset();
  mockVerify.mockResolvedValue({ isValid: true, payer: '0xPAYER' });
});

describe('ESCROW payment replay guard (A-01)', () => {
  it('two parallel requests with the identical signed payment: exactly one 200, one 402', async () => {
    const sharedHeader = 'x-payment-shared-signature';

    const [a, b] = await Promise.all([
      escrowStage.execute(ctx('req-a', sharedHeader)),
      escrowStage.execute(ctx('req-b', sharedHeader)),
    ]);

    const results = [a, b];
    const oks = results.filter((r) => r.ok);
    const rejected = results.filter((r) => !r.ok);

    expect(oks).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    if (!rejected[0].ok) {
      expect(rejected[0].error.code).toBe(402);
      expect(rejected[0].error.message).toMatch(/already been consumed/i);
    }
  });

  it('a second sequential call with the same signed payment is rejected after the first succeeded', async () => {
    const sharedHeader = 'x-payment-sequential-signature';

    const first = await escrowStage.execute(ctx('req-seq-1', sharedHeader));
    expect(first.ok).toBe(true);

    const second = await escrowStage.execute(ctx('req-seq-2', sharedHeader));
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe(402);
      expect(second.error.message).toMatch(/already been consumed/i);
    }
  });

  it('a different signed payment (different nonce) is unaffected by an unrelated consumed one', async () => {
    const first = await escrowStage.execute(ctx('req-fresh-1', 'x-payment-signature-one'));
    expect(first.ok).toBe(true);

    const second = await escrowStage.execute(ctx('req-fresh-2', 'x-payment-signature-two'));
    expect(second.ok).toBe(true);
  });
});
