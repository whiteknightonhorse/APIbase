/**
 * T-0427: paywall-bypass vectors against OUR route matching, the same negative tests the x402 SDK
 * Express paywall got in 2.13/2.21/2.22/2.27 (encoded slashes, backslashes, double slash, trailing
 * dot/space, line terminators, mixed case). The real createApp() runs behind a real socket, the
 * request line is sent verbatim (no client-side URL normalisation), no chain is touched.
 *
 * For a paid tool route and a quote pay route (and /mcp) a request WITHOUT a valid payment must
 * answer 402 or 404, never 200, and must not reach the provider adapter / payQuote settlement.
 * Every 402 we emit also carries Cache-Control: no-store.
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
    REDIS_URL: 'redis://unused.example',
    TUYA_CLIENT_ID: 'fuzz-client-id',
    TUYA_CLIENT_SECRET: 'fuzz-client-secret',
    TUYA_API_BASE_URL: 'https://fuzz-tuya.example',
    TUYA_AUTHORIZE_URL: 'https://fuzz-tuya.example/authorize',
  },
}));
jest.mock('../../src/config/logger', () => {
  const silentLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return {
    logger: silentLogger,
    resolveRequestId: (clientValue?: string) => clientValue ?? 'bypass-test-request-id',
    createRequestLogger: () => silentLogger,
  };
});
jest.mock('../../src/services/prisma.service', () => ({
  getPrisma: () => ({
    agent: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
    tool: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    outbox: { create: jest.fn() },
  }),
}));
function createFakeRedis() {
  const store = new Map<string, string>();
  return {
    async get(k: string) {
      return store.get(k) ?? null;
    },
    async set(k: string, v: string, ...args: unknown[]) {
      if (args.includes('NX') && store.has(k)) return null;
      store.set(k, v);
      return 'OK';
    },
    async del(k: string) {
      return store.delete(k) ? 1 : 0;
    },
    async exists(k: string) {
      return store.has(k) ? 1 : 0;
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
jest.mock('../../src/services/escrow.service', () => {
  class InsufficientFundsError extends Error {}
  return {
    reserve: jest.fn().mockRejectedValue(new InsufficientFundsError('no funds')),
    finalize: jest.fn(),
    refund: jest.fn(),
    InsufficientFundsError,
  };
});
jest.mock('../../src/services/ledger.service', () => ({
  writeDirectCharge: jest.fn(),
  writeFreeEntry: jest.fn(),
  writeSharedEntry: jest.fn(),
  writeX402Entry: jest.fn(),
  CACHE_HIT_COST_MULTIPLIER: 0.1,
}));
jest.mock('../../src/pipeline/stages/x402-settle', () => ({
  settleX402: jest.fn(),
  recordSettleFailure: jest.fn(),
}));
jest.mock('../../src/services/x402-server.service', () => ({
  getSharedResourceServer: () => ({
    verifyPayment: jest.fn().mockResolvedValue({ isValid: false }),
  }),
}));
jest.mock('../../src/middleware/mpp.middleware', () => ({
  mppMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  buildMppChallengeHeader: jest.fn().mockResolvedValue(null),
  quoteMppChallengeHeader: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../src/services/moderation-ban.service', () => ({
  banIdentity: jest.fn(() => undefined),
  checkBan: jest.fn().mockResolvedValue({ banned: false }),
  recordBlock: jest.fn(),
}));

// The thing that must never run: the upstream provider adapter.
const mockAdapterCall = jest.fn();
jest.mock('../../src/adapters/registry', () => ({
  resolveAdapter: jest.fn(() => ({ call: (...a: unknown[]) => mockAdapterCall(...a) })),
}));

// Quote pay route: payQuote is the settlement entry; without a payment it answers 402.
const mockPayQuote = jest.fn();
jest.mock('../../src/shop/pay.service', () => ({
  payQuote: (...a: unknown[]) => mockPayQuote(...a),
}));
jest.mock('../../src/shop/buyer', () => ({
  resolveBuyer: jest.fn().mockResolvedValue({ identity: 'anon:test', kind: 'anonymous' }),
}));

import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../src/api/app';
import {
  __setToolCacheEntryForTest,
  __deleteToolCacheEntryForTest,
} from '../../src/pipeline/stages/tool-status.stage';

const TOOL_ID = 'telnyx.send_sms_premium';
const QUOTE_ID = '11111111-2222-4333-8444-555555555555';
const BODY = JSON.stringify({ to: '+15551234567', from: '+15557654321', text: 'hello' });

interface Raw {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

/** Raw HTTP request, path verbatim on the request line. */
function raw(port: number, method: string, rawPath: string): Promise<Raw> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: rawPath,
        method,
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(BODY) },
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      },
    );
    req.on('error', reject);
    req.end(BODY);
  });
}

const toolPath = `/api/v1/tools/${TOOL_ID}/call`;
const quotePath = `/api/v1/shop/quotes/${QUOTE_ID}/pay`;

/** Path variants shared by the tool route and the quote pay route. */
function variants(canonical: string): Array<[string, string]> {
  const segs = canonical.split('/');
  const last = segs[segs.length - 2]; // id segment
  return [
    ['encoded slash before last segment', canonical.replace(/\/(call|pay)$/, '%2F$1')],
    ['encoded slash in the prefix', canonical.replace('/api/v1', '/api%2Fv1')],
    ['encoded backslash %5C', canonical.replace(`/${last}/`, `%5C${last}/`)],
    ['raw backslash', canonical.replace(`/${last}/`, `\\${last}/`)],
    ['trailing ..%2F', `${canonical}/..%2F`],
    ['double slash prefix', `/${canonical}`],
    ['double slash inside', canonical.replace('/api/v1', '/api//v1')],
    ['trailing dot', `${canonical}.`],
    ['trailing encoded space', `${canonical}%20`],
    ['line feed %0A', `${canonical}%0A`],
    ['carriage return %0D', `${canonical}%0D`],
    ['line separator U+2028', `${canonical}%E2%80%A8`],
    ['LF inside the path', canonical.replace('/api/v1', '/api%0A/v1')],
    ['mixed case', canonical.replace('/api/v1', '/API/v1')],
    ['semicolon path parameter', `${canonical};x=1`],
    ['null byte', `${canonical}%00`],
  ];
}

describe('T-0427: paywall bypass vectors on our own route matching', () => {
  let server: http.Server;
  let port: number;

  beforeAll((done) => {
    __setToolCacheEntryForTest({
      tool_id: TOOL_ID,
      status: 'healthy',
      price_usd: 0.25,
      cache_ttl: 0,
      upstream_cost_usd: null,
    });
    server = http.createServer(createApp());
    server.listen(0, '127.0.0.1', () => {
      port = (server.address() as AddressInfo).port;
      done();
    });
  });
  afterAll((done) => {
    __deleteToolCacheEntryForTest(TOOL_ID);
    server.close(done);
  });

  beforeEach(() => {
    mockAdapterCall.mockReset();
    mockAdapterCall.mockResolvedValue({
      status: 200,
      body: { ok: true },
      durationMs: 1,
      byteLength: 2,
    });
    mockPayQuote.mockReset();
    mockPayQuote.mockResolvedValue({
      status: 402,
      body: { x402Version: 2, error: 'payment_required', accepts: [] },
    });
  });

  function expectDenied(r: Raw): void {
    expect([402, 404]).toContain(r.status);
    if (r.status === 402) expect(r.headers['cache-control']).toBe('no-store');
  }

  it('baseline: the canonical tool call without payment is 402 + no-store and never calls the provider', async () => {
    const r = await raw(port, 'POST', toolPath);
    expect(r.status).toBe(402);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(mockAdapterCall).not.toHaveBeenCalled();
  });

  it('baseline: the canonical quote pay without payment is 402 + no-store', async () => {
    const r = await raw(port, 'POST', quotePath);
    expect(r.status).toBe(402);
    expect(r.headers['cache-control']).toBe('no-store');
  });

  it.each(variants(toolPath))('tool route, %s -> 402/404, provider not called', async (_l, p) => {
    expectDenied(await raw(port, 'POST', p));
    expect(mockAdapterCall).not.toHaveBeenCalled();
  });

  it.each(variants(quotePath))('quote pay route, %s -> 402/404, no 200', async (_l, p) => {
    expectDenied(await raw(port, 'POST', p));
    expect(mockAdapterCall).not.toHaveBeenCalled();
  });

  it.each([['/mcp%2F'], ['/mcp/..'], ['/mcp%5C'], ['//mcp'], ['/mcp.'], ['/mcp%0A'], ['/MCP%2F']])(
    '%s without payment -> never 200, provider not called',
    async (p) => {
      const r = await raw(port, 'POST', p);
      expect(r.status).not.toBe(200);
      expect([402, 404]).toContain(r.status);
      if (r.status === 402) expect(r.headers['cache-control']).toBe('no-store');
      expect(mockAdapterCall).not.toHaveBeenCalled();
    },
  );

  it('every 402 on the entry marker carries no-store too', async () => {
    const r = await raw(port, 'POST', '/api/v1');
    if (r.status === 402) expect(r.headers['cache-control']).toBe('no-store');
    expect(r.status).not.toBe(200);
  });
});
