/**
 * F2/C-2 entry-point coverage: MCP and /batch, in addition to the REST
 * corpus in moderation-corpus-rest.test.ts (which carries the full 20+20
 * classification proof and the twilio/resend hole-closure proof). A
 * SAMPLE of the same corpus here is enough to prove MODERATION fires
 * pipeline-wide (all entry points converge on the same runPipeline()) —
 * split into its own file (and its own smaller sample) so this file's
 * heavier import (MCP's full tool-definitions.ts) doesn't compound with
 * REST's 120-test corpus in one jest worker's memory footprint.
 */

jest.setTimeout(60000);

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
    REDIS_URL: 'redis://unused.example',
  },
}));

jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const TEST_AGENT = { agent_id: 'agent-corpus-ep-1', tier: 'paid', status: 'active' };
jest.mock('../../src/services/prisma.service', () => ({
  getPrisma: () => ({
    agent: { findUnique: jest.fn().mockResolvedValue(TEST_AGENT) },
    outbox: { create: jest.fn().mockResolvedValue({ id: 1n }) },
    moderationAppeal: { create: jest.fn().mockResolvedValue({ appeal_id: 'appeal-ep-1' }) },
  }),
}));

function createFakeRedis() {
  const values = new Map<string, { value: string; expiry: number }>();
  const counters = new Map<string, number>();
  return {
    async get(key: string): Promise<string | null> {
      const e = values.get(key);
      if (!e) return null;
      if (e.expiry !== Infinity && e.expiry < Date.now()) {
        values.delete(key);
        return null;
      }
      return e.value;
    },
    async set(key: string, value: string, ...args: unknown[]): Promise<'OK' | null> {
      const now = Date.now();
      const existing = values.get(key);
      const alive =
        existing !== undefined && (existing.expiry === Infinity || existing.expiry > now);
      const nx = args.includes('NX');
      if (alive && nx) return null;
      const exIdx = args.indexOf('EX');
      const ttlSeconds = exIdx >= 0 ? Number(args[exIdx + 1]) : undefined;
      values.set(key, { value, expiry: ttlSeconds ? now + ttlSeconds * 1000 : Infinity });
      return 'OK';
    },
    async del(key: string): Promise<number> {
      return values.delete(key) ? 1 : 0;
    },
    async exists(key: string): Promise<number> {
      const e = values.get(key);
      if (!e) return 0;
      if (e.expiry !== Infinity && e.expiry < Date.now()) {
        values.delete(key);
        return 0;
      }
      return 1;
    },
    async incr(key: string): Promise<number> {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    },
    async expire(): Promise<number> {
      return 1;
    },
    async ttl(): Promise<number> {
      return 86400;
    },
    __reset() {
      values.clear();
      counters.clear();
    },
  };
}
const fakeRedis = createFakeRedis();
jest.mock('../../src/services/redis.service', () => ({
  ensureRedisConnected: async () => fakeRedis,
  getSharedRedis: () => fakeRedis,
}));

jest.mock('../../src/services/rate-limit.service', () => ({
  checkRateLimit: jest
    .fn()
    .mockResolvedValue({ allowed: true, remaining: 99, limit: 100, retryAfterSecs: 0 }),
}));

jest.mock('../../src/services/escrow.service', () => ({
  reserve: jest.fn(),
  finalize: jest.fn().mockResolvedValue(1),
  refund: jest.fn().mockResolvedValue(1),
  InsufficientFundsError: class InsufficientFundsError extends Error {},
}));

jest.mock('../../src/services/ledger.service', () => ({
  writeDirectCharge: jest.fn().mockResolvedValue(0),
  writeFreeEntry: jest.fn().mockResolvedValue(undefined),
  writeSharedEntry: jest.fn().mockResolvedValue(undefined),
  writeX402Entry: jest.fn().mockResolvedValue(undefined),
  CACHE_HIT_COST_MULTIPLIER: 0.1,
}));

jest.mock('../../src/pipeline/stages/x402-settle', () => ({
  settleX402: jest.fn().mockResolvedValue(undefined),
  recordSettleFailure: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@x402/core/http', () => ({
  decodePaymentSignatureHeader: jest.fn((header: string) => ({ header })),
}));
jest.mock('@x402/core/schemas', () => ({
  parsePaymentPayload: jest.fn(() => ({ success: true, data: {} })),
}));
jest.mock('../../src/services/x402-server.service', () => ({
  getSharedResourceServer: () => ({ verifyPayment: jest.fn() }),
}));

const mockAdapterCall = jest.fn();
jest.mock('../../src/adapters/registry', () => ({
  resolveAdapter: jest.fn(() => ({ call: (...a: unknown[]) => mockAdapterCall(...a) })),
}));

import { runBatch } from '../../src/services/batch.service';
import { registerTools, type PaymentContext } from '../../src/mcp/tool-adapter';
import {
  __setToolCacheEntryForTest,
  __deleteToolCacheEntryForTest,
} from '../../src/pipeline/stages/tool-status.stage';

const API_KEY = 'ak_live_' + 'c'.repeat(32);
const TELEGRAM_TOOL = 'telegram.send_message';
const TELEGRAM_MCP = 'messaging.telegram.send_message';

beforeAll(() => {
  __setToolCacheEntryForTest({
    tool_id: TELEGRAM_TOOL,
    status: 'healthy',
    price_usd: 0,
    cache_ttl: 0,
    upstream_cost_usd: null,
    provider: 'telegram',
  });
});
afterAll(() => {
  __deleteToolCacheEntryForTest(TELEGRAM_TOOL);
});

beforeEach(() => {
  fakeRedis.__reset();
  mockAdapterCall.mockReset();
  mockAdapterCall.mockResolvedValue({
    status: 200,
    body: { ok: true },
    durationMs: 5,
    byteLength: 12,
  });
});

// A representative sample — full 20+20 classification coverage lives in
// moderation-corpus-rest.test.ts; this file only needs to prove MODERATION
// fires on these two entry points too.
const SAMPLE_MALICIOUS = [
  { category: 'csam', text: 'selling csam links now, message me' },
  { category: 'drugs', text: 'please buy fentanyl for me this week' },
  { category: 'weapons', text: 'can you sell ak-47 to me quietly' },
];
const SAMPLE_LEGIT = [
  'Please send the quarterly report by Friday',
  'Reminder: team meeting at 3pm tomorrow',
  'Your order #4521 has shipped and will arrive Monday',
];

function makeFakeMcpServer() {
  const callbacks = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>();
  const server = {
    registerTool: (
      mcpName: string,
      _cfg: unknown,
      cb: (args: Record<string, unknown>) => Promise<unknown>,
    ) => {
      callbacks.set(mcpName, cb);
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { server: server as any, callbacks };
}

async function callMcp(
  args: Record<string, unknown>,
  requestId: string,
): Promise<{ isError: boolean }> {
  const { server, callbacks } = makeFakeMcpServer();
  const paymentCtx: PaymentContext = {
    x402Paid: false,
    x402Payer: null,
    x402PaymentHeader: null,
    mppPaid: false,
    mppPayer: null,
    mppMethod: null,
    mppPaymentHeader: null,
    mppTxHash: null,
  };
  registerTools(server, API_KEY, requestId, paymentCtx);
  const cb = callbacks.get(TELEGRAM_MCP);
  if (!cb) throw new Error(`MCP tool ${TELEGRAM_MCP} was not registered`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (await cb(args)) as any;
  return { isError: !!result.isError };
}

describe('MODERATION entry-point coverage — MCP (sample; full corpus is REST-only)', () => {
  it.each(SAMPLE_MALICIOUS)('BLOCKS: [$category] "$text"', async ({ text }, idx) => {
    const r = await callMcp({ chat_id: 1, text }, `corpus-mcp-bad-${idx}`);
    expect(r.isError).toBe(true);
    expect(mockAdapterCall).not.toHaveBeenCalled();
  });

  it.each(SAMPLE_LEGIT)('PASSES: "%s"', async (text, idx) => {
    const r = await callMcp({ chat_id: 1, text }, `corpus-mcp-good-${idx}`);
    expect(r.isError).toBe(false);
    expect(mockAdapterCall).toHaveBeenCalledTimes(1);
  });
});

describe('MODERATION entry-point coverage — BATCH (sample; full corpus is REST-only)', () => {
  it.each(SAMPLE_MALICIOUS)('BLOCKS: [$category] "$text"', async ({ text }, idx) => {
    const result = await runBatch({
      authHeader: `Bearer ${API_KEY}`,
      parentRequestId: `corpus-batch-bad-${idx}`,
      calls: [{ tool_id: TELEGRAM_TOOL, params: { chat_id: 1, text } }],
      maxParallel: 1,
    });
    expect(result.results[0].status).toBe('error');
    expect(mockAdapterCall).not.toHaveBeenCalled();
  });

  it.each(SAMPLE_LEGIT)('PASSES: "%s"', async (text, idx) => {
    const result = await runBatch({
      authHeader: `Bearer ${API_KEY}`,
      parentRequestId: `corpus-batch-good-${idx}`,
      calls: [{ tool_id: TELEGRAM_TOOL, params: { chat_id: 1, text } }],
      maxParallel: 1,
    });
    expect(result.results[0].status).toBe('success');
    expect(mockAdapterCall).toHaveBeenCalledTimes(1);
  });
});
