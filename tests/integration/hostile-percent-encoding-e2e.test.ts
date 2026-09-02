/**
 * Д-1 (2026-09-02): malformed percent-encoding in a route param
 * (`GET /api/v1/appeals/a%ffb`, `/x402/retrieve/a%ffb`, `/api/v1/tools/a%ffb`) returned
 * a plain 500 `internal_error` on every parameterized route -- a client input mistake
 * leaking as an internal-failure signal, not a 4xx.
 *
 * Root cause: Express's own router-level `decodeURIComponent` (used to extract a
 * matched `:param` segment) throws a `URIError` on invalid percent-encoding (`%ff`
 * alone is not valid UTF-8; `%c0%af` is an overlong encoding) BEFORE any route
 * handler runs. `errorHandlerMiddleware` had no branch for `URIError` -- it fell
 * through to the generic "Unexpected error" 500 branch.
 *
 * `fuzz-all-routes.test.ts` cannot catch this class of bug: it enumerates routes off
 * each router's own `.stack` and invokes the handler function directly with an
 * ALREADY-DECODED param string -- Express's own decode step (where this bug lives)
 * is entirely outside that harness's world. This test goes through the real HTTP
 * layer instead: `createApp()` on a real `http.createServer`, a REAL socket request
 * with the raw hostile bytes on the request line (Node's `http.request` treats
 * `path` as an opaque string, so `%ff` reaches the server exactly as sent -- no
 * client-side URL-object validation gets a chance to reject it first).
 *
 * Assertion is deliberately double, per this project's own rule that a fix must be
 * measured, not just asserted: (1) a clean 4xx, never 500 -- proves the leak is
 * closed; (2) the SAME server instance still answers a normal request healthily
 * right after -- proves the fix is a clean response, not a crash the process
 * happened to survive by luck (LAW #RARE-PATH-KILLS-THE-PROCESS: validate at the
 * trust boundary, before the driver, precisely because a rare unhandled path can
 * take the whole process down -- here it didn't, but "didn't crash" and "isn't
 * silently leaking a 500" are two different guarantees and both are checked).
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
    resolveRequestId: (clientValue?: string) => clientValue ?? 'e2e-test-request-id',
    createRequestLogger: () => silentLogger,
  };
});
jest.mock('../../src/services/prisma.service', () => ({
  getPrisma: () => ({
    agent: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
    tool: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    deviceConnection: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    moderationAppeal: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
    },
  }),
}));
jest.mock('../../src/services/redis.service', () => ({
  ensureRedisConnected: jest.fn().mockRejectedValue(new Error('no redis in e2e test')),
  getSharedRedis: () => {
    throw new Error('no redis in e2e test');
  },
}));
jest.mock('../../src/services/agent.service', () => ({
  registerAgent: jest.fn().mockResolvedValue({ agent_id: 'agent-e2e-1', api_key: 'ak_live_x' }),
  autoRegisterAnonymous: jest
    .fn()
    .mockResolvedValue({ agent_id: 'agent-e2e-1', api_key: 'ak_live_x' }),
}));
jest.mock('../../src/services/dashboard.service', () => ({
  getDashboardData: jest.fn().mockResolvedValue({ tools: 0, providers: 0 }),
}));
jest.mock('../../src/services/onboard.service', () => ({
  checkIpRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
  createSubmission: jest.fn().mockResolvedValue({ id: 'sub-e2e-1' }),
}));
jest.mock('../../src/services/receipt.service', () => ({
  getReceipt: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../src/services/tool-registry.service', () => ({
  getPublicCatalog: jest.fn().mockResolvedValue({ tools: [], count: 0 }),
  getToolsPaginated: jest.fn().mockResolvedValue({ tools: [], next_cursor: null }),
  getToolById: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../src/services/escrow.service', () => ({
  reserve: jest.fn().mockRejectedValue(new Error('no DB in e2e test')),
  finalize: jest.fn(),
  refund: jest.fn(),
  InsufficientFundsError: class InsufficientFundsError extends Error {},
}));
jest.mock('../../src/services/ledger.service', () => ({
  writeDirectCharge: jest.fn(),
  writeFreeEntry: jest.fn(),
  writeSharedEntry: jest.fn(),
  writeX402Entry: jest.fn(),
  CACHE_HIT_COST_MULTIPLIER: 0.1,
}));
jest.mock('../../src/services/x402-server.service', () => ({
  getSharedResourceServer: () => ({
    verifyPayment: jest.fn().mockResolvedValue({ isValid: false }),
  }),
}));
jest.mock('@x402/core/http', () => ({
  decodePaymentSignatureHeader: jest.fn(() => {
    throw new Error('e2e test: no real x402 payload');
  }),
}));
jest.mock('@x402/core/schemas', () => ({
  parsePaymentPayload: jest.fn(() => ({ success: false, error: { issues: [] } })),
}));
jest.mock('../../src/pipeline/stages/x402-settle', () => ({
  settleX402: jest.fn(),
  recordSettleFailure: jest.fn(),
}));
jest.mock('../../src/middleware/mpp.middleware', () => ({
  mppMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  buildMppChallengeHeader: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../src/services/moderation-ban.service', () => ({
  banIdentity: jest.fn(() => undefined),
  checkBan: jest.fn().mockResolvedValue({ banned: false }),
  recordBlock: jest.fn(),
}));
jest.mock('../../src/adapters/registry', () => ({
  resolveAdapter: jest.fn(() => ({
    call: jest.fn().mockRejectedValue(new Error('no provider in e2e test')),
  })),
}));

import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../src/api/app';

/** Raw HTTP GET with the path sent VERBATIM on the request line -- no URL-object
 * re-encoding/validation on the client side, so hostile percent-encoding reaches
 * the server exactly as written. */
function rawGet(port: number, rawPath: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: rawPath, method: 'GET' }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('Д-1: hostile percent-encoding through the real HTTP layer', () => {
  let server: http.Server;
  let port: number;

  beforeAll((done) => {
    server = http.createServer(createApp());
    server.listen(0, '127.0.0.1', () => {
      port = (server.address() as AddressInfo).port;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  const hostileCases: Array<[string, string]> = [
    ['%ff — invalid single-byte UTF-8', '/api/v1/appeals/a%ffb'],
    ['%ff — x402/retrieve', '/x402/retrieve/a%ffb'],
    ['%ff — tools', '/api/v1/tools/a%ffb'],
    ['%c0%af — overlong-encoding path traversal attempt', '/api/v1/appeals/a%c0%afb'],
  ];

  it.each(hostileCases)(
    '%s -> 4xx, never 500, and the server stays healthy after',
    async (_label, rawPath) => {
      const res = await rawGet(port, rawPath);

      // The actual regression: this used to be 500 (internal_error) on every one
      // of these -- an internal-state leak for a plain client input mistake.
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);

      const parsed = JSON.parse(res.body);
      expect(parsed.error_code).toBe('BAD_REQUEST');

      // Double assertion (per this project's rule: a fix must be MEASURED, not
      // assumed) -- the process didn't just survive by luck, it answers a normal
      // request cleanly right after, on the same server instance.
      const followUp = await rawGet(port, '/api/v1/appeals/00000000-0000-0000-0000-000000000000');
      expect(followUp.status).toBe(404); // valid-shaped id, no such row -- proves the server is alive and routing normally
    },
  );
});
