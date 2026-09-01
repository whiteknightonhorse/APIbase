/**
 * ШАГ 5 (2026-09-02, Fable's 4-finding consolidated verdict): x402 wallet
 * auto-registration parity with MPP's ensureMppAgent.
 *
 * Before this fix: a valid X-Payment with no API key and no Authorization
 * header hit AUTH's first `!headerValue` branch, found no X-API-Key, and
 * 401'd -- x402 had no equivalent to MPP's "payment IS authentication"
 * auto-registration. This suite proves the fix without weakening the
 * ordering guarantee: verification happens BEFORE any agent row is created.
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

jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// x402 payload decode/parse -- controlled per test via the module-level
// mock's return value (garbage-vs-well-formed is simulated by parse success).
let decodedPayload: unknown = {
  accepted: {},
  payload: {
    authorization: {
      from: '0xPAYER',
      to: '0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480',
      value: '250000',
      validAfter: '0',
      validBefore: String(Math.floor(Date.now() / 1000) + 60),
      nonce: '0xnonce-auth-parity-test',
    },
  },
};
let parseShouldFail = false;
jest.mock('@x402/core/http', () => ({
  decodePaymentSignatureHeader: jest.fn((header: string) => {
    if (header === 'undecodable-garbage') throw new Error('cannot decode');
    return { decoded: true };
  }),
}));
jest.mock('@x402/core/schemas', () => ({
  parsePaymentPayload: jest.fn(() => {
    if (parseShouldFail) return { success: false, error: { issues: [] } };
    return { success: true, data: decodedPayload };
  }),
}));

// The facilitator verify -- controlled per test.
const mockVerify = jest.fn();
jest.mock('../../src/services/x402-server.service', () => ({
  getSharedResourceServer: () => ({ verifyPayment: mockVerify }),
}));

// Agent persistence -- controlled per test, and this is exactly what "zero
// rows created" means in this suite.
const mockFindUnique = jest.fn();
const mockCreate = jest.fn();
jest.mock('../../src/services/prisma.service', () => ({
  getPrisma: () => ({
    agent: {
      findUnique: (...a: unknown[]) => mockFindUnique(...a),
      create: (...a: unknown[]) => mockCreate(...a),
    },
  }),
}));

// Redis: a real in-memory fake so the agent-lookup cache path runs for real.
function createFakeRedis() {
  const store = new Map<string, string>();
  return {
    async get(key: string): Promise<string | null> {
      return store.get(key) ?? null;
    },
    async set(key: string, value: string): Promise<'OK'> {
      store.set(key, value);
      return 'OK';
    },
    __reset() {
      store.clear();
    },
  };
}
const fakeRedis = createFakeRedis();
jest.mock('../../src/services/redis.service', () => ({
  ensureRedisConnected: async () => fakeRedis,
}));

import { authStage } from '../../src/pipeline/stages/auth.stage';
import { createPipelineContext } from '../../src/pipeline/types';

function ctxWithX402(paymentHeader: string) {
  const ctx = createPipelineContext('req-1', 'POST', '/api/v1/tools/x/call', {}, {});
  ctx.x402Paid = true;
  ctx.x402PaymentHeader = paymentHeader;
  return ctx;
}

beforeEach(() => {
  fakeRedis.__reset();
  mockVerify.mockReset();
  mockFindUnique.mockReset();
  mockCreate.mockReset();
  parseShouldFail = false;
  decodedPayload = {
    accepted: {},
    payload: {
      authorization: {
        from: '0xPAYER',
        to: '0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480',
        value: '250000',
        validAfter: '0',
        validBefore: String(Math.floor(Date.now() / 1000) + 60),
        nonce: '0xnonce-auth-parity-test',
      },
    },
  };
});

describe('AUTH stage — x402 wallet auto-registration parity (ШАГ 5)', () => {
  it('⛔ ORDER: a well-formed but cryptographically INVALID X-Payment creates ZERO agent rows, then 401s', async () => {
    mockVerify.mockResolvedValue({ isValid: false, invalidReason: 'invalid_signature' });
    mockFindUnique.mockResolvedValue(null);

    const result = await authStage.execute(ctxWithX402('well-formed-but-forged'));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockVerify).toHaveBeenCalledTimes(1); // verification WAS attempted
  });

  it('a genuinely garbage/undecodable X-Payment creates ZERO agent rows and never even calls verifyPayment', async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await authStage.execute(ctxWithX402('undecodable-garbage'));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(401);
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('a valid x402 payment with no API key auto-registers a new agent, deterministically keyed by the payer wallet', async () => {
    mockVerify.mockResolvedValue({ isValid: true, payer: '0xREALPAYER' });
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({
      agent_id: 'agent-x402-new-1',
      tier: 'paid',
      status: 'active',
    });

    const result = await authStage.execute(ctxWithX402('a-real-signed-x402-payment'));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.agentId).toBe('agent-x402-new-1');
      expect(result.value.tier).toBe('paid');
    }
    // Verification happened BEFORE creation (both were called, order matters
    // for the "no DB row from garbage" guarantee — proven directly above;
    // here we confirm the happy path actually persists).
    expect(mockVerify).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const createArgs = mockCreate.mock.calls[0][0];
    expect(createArgs.data.tier).toBe('paid');
    expect(createArgs.data.status).toBe('active');
  });

  it('the SAME wallet paying twice resolves to the SAME agent, deterministically -- no second create()', async () => {
    mockVerify.mockResolvedValue({ isValid: true, payer: '0xSAMEWALLET' });
    // First call: no existing agent, create one.
    mockFindUnique.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce({
      agent_id: 'agent-x402-repeat-1',
      tier: 'paid',
      status: 'active',
    });

    const first = await authStage.execute(ctxWithX402('payment-1'));
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.value.agentId).toBe('agent-x402-repeat-1');

    // Second call, same wallet: the Redis cache from the first call already
    // resolves it -- findUnique/create should not even be reached again.
    const second = await authStage.execute(ctxWithX402('payment-2'));
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.value.agentId).toBe('agent-x402-repeat-1');

    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('case-different addresses for the same wallet still resolve to the same agent (lowercased hash key)', async () => {
    mockVerify.mockResolvedValueOnce({ isValid: true, payer: '0xAbCdEf1234567890' });
    mockFindUnique.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce({
      agent_id: 'agent-x402-case-1',
      tier: 'paid',
      status: 'active',
    });
    const first = await authStage.execute(ctxWithX402('payment-case-1'));
    expect(first.ok).toBe(true);

    mockVerify.mockResolvedValueOnce({ isValid: true, payer: '0xabcdef1234567890' });
    const second = await authStage.execute(ctxWithX402('payment-case-2'));
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.value.agentId).toBe('agent-x402-case-1');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('REGRESSION: an x402 payment presented ALONGSIDE a valid X-API-Key still authenticates via the key, not wallet auto-registration', async () => {
    const ctx = createPipelineContext(
      'req-2',
      'POST',
      '/api/v1/tools/x/call',
      {},
      { 'x-api-key': 'ak_live_' + 'b'.repeat(32) },
    );
    ctx.x402Paid = true;
    ctx.x402PaymentHeader = 'a-real-signed-x402-payment';
    mockFindUnique.mockResolvedValue({
      agent_id: 'agent-existing-key-1',
      tier: 'enterprise',
      status: 'active',
    });

    const result = await authStage.execute(ctx);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.agentId).toBe('agent-existing-key-1');
    // The X-API-Key path resolved it -- x402 verification was never reached.
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('REGRESSION: no x402 payment and no API key still 401s exactly as before this fix', async () => {
    const ctx = createPipelineContext('req-3', 'POST', '/api/v1/tools/x/call', {}, {});
    const result = await authStage.execute(ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(401);
      expect(result.error.message).toMatch(/Missing Authorization header/);
    }
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
