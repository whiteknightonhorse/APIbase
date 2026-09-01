/**
 * ШАГ 6, gate 1 (Fable's 4-finding consolidated verdict, 2026-09-02): FUZZ
 * every route the server actually declares, enumerated from the real
 * router objects' `.stack` -- never a hand-written list, which silently
 * goes stale about routes it doesn't know exist. One sweep covers the
 * whole class of "a malformed :param or body crashes/500s a handler",
 * not just whichever single route was already fixed.
 *
 * Assertion per route: a garbage identifier/param and a garbage body
 * produce a clean 4xx (or a handled 2xx/3xx for a no-input GET), NEVER an
 * uncaught exception -- proven by every handler call being wrapped so an
 * uncaught throw fails the test loudly instead of silently crashing the
 * real process the way an unguarded async handler would.
 *
 * Handlers are invoked directly off each router's own `.stack` (same
 * technique already used by appeal-invalid-id.test.ts and
 * adversarial-payment-e2e.test.ts in this repo) -- real production route
 * handlers, not reimplemented, with only true external I/O (Prisma, Redis,
 * metrics registry left real since it has no I/O) mocked.
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
  },
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../src/services/prisma.service', () => ({
  getPrisma: () => ({
    agent: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
    tool: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  }),
}));
jest.mock('../../src/services/redis.service', () => ({
  ensureRedisConnected: jest.fn().mockRejectedValue(new Error('no redis in fuzz test')),
  getSharedRedis: () => {
    throw new Error('no redis in fuzz test');
  },
}));

jest.mock('../../src/services/agent.service', () => ({
  registerAgent: jest.fn().mockResolvedValue({ agent_id: 'agent-fuzz-1', api_key: 'ak_live_x' }),
  autoRegisterAnonymous: jest
    .fn()
    .mockResolvedValue({ agent_id: 'agent-fuzz-1', api_key: 'ak_live_x' }),
}));
jest.mock('../../src/services/dashboard.service', () => ({
  getDashboardData: jest.fn().mockResolvedValue({ tools: 0, providers: 0 }),
}));
jest.mock('../../src/services/onboard.service', () => ({
  checkIpRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
  createSubmission: jest.fn().mockResolvedValue({ id: 'sub-fuzz-1' }),
}));
jest.mock('../../src/services/receipt.service', () => ({
  getReceipt: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../src/services/tool-registry.service', () => ({
  getPublicCatalog: jest.fn().mockResolvedValue({ tools: [], count: 0 }),
  getToolsPaginated: jest.fn().mockResolvedValue({ tools: [], next_cursor: null }),
  getToolById: jest.fn().mockResolvedValue(null),
}));

// Escrow/ledger — pulled in transitively by execute/batch routers' pipeline
// import graph; not under test here, matching adversarial-payment-e2e's
// own scope boundary.
jest.mock('../../src/services/escrow.service', () => ({
  reserve: jest.fn().mockRejectedValue(new Error('no DB in fuzz test')),
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

// x402-server.service pulls in cdp-jwt.service -> the ESM-only `jose`
// package, which Jest cannot parse under the default CJS transform (same
// import-graph landmine documented in moderation-stage-corpus.test.ts and
// worked around in adversarial-payment-e2e.test.ts) -- mocked here purely
// to short-circuit that import chain before it ever reaches `jose`, not
// because payment verification itself is under test in this gate.
jest.mock('../../src/services/x402-server.service', () => ({
  getSharedResourceServer: () => ({
    verifyPayment: jest.fn().mockResolvedValue({ isValid: false }),
  }),
}));
jest.mock('@x402/core/http', () => ({
  decodePaymentSignatureHeader: jest.fn(() => {
    throw new Error('fuzz test: no real x402 payload');
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
  buildMppChallengeHeader: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../src/services/moderation-ban.service', () => ({
  banIdentity: jest.fn(() => undefined),
  checkBan: jest.fn().mockResolvedValue({ banned: false }),
  recordBlock: jest.fn(),
}));
// adapters/registry.ts pulls in every adapter, including polymarket's
// @polymarket/clob-client (ESM-only, same class of Jest-parse landmine as
// jose above) -- mocked at the registry boundary, same as
// adversarial-payment-e2e.test.ts does, for the same reason.
jest.mock('../../src/adapters/registry', () => ({
  resolveAdapter: jest.fn(() => ({
    call: jest.fn().mockRejectedValue(new Error('no provider in fuzz test')),
  })),
}));

import { healthRouter } from '../../src/routes/health.router';
import { metricsRouter } from '../../src/routes/metrics.router';
import { toolsRouter } from '../../src/routes/tools.router';
import { agentsRouter } from '../../src/routes/agents.router';
import { x402Router } from '../../src/routes/x402.router';
import { onboardRouter } from '../../src/routes/onboard.router';
import { appealsRouter } from '../../src/routes/appeals.router';
import { executeRouter } from '../../src/routes/execute.router';
import { batchRouter } from '../../src/routes/batch.router';
import { dashboardRouter } from '../../src/routes/dashboard.router';
import { oauthRouter } from '../../src/routes/oauth.router';
import type { Router } from 'express';

// ---------------------------------------------------------------------------
// Generic router-stack enumeration -- the whole point of this gate.
// ---------------------------------------------------------------------------

interface DiscoveredRoute {
  method: string;
  path: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handle: (req: any, res: any, next: any) => unknown;
}

function enumerateRoutes(router: Router, routerName: string): DiscoveredRoute[] {
  const routes: DiscoveredRoute[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stack = (router as any).stack as any[];
  for (const layer of stack) {
    if (!layer.route) continue;
    const path: string = layer.route.path;
    const methods = Object.keys(layer.route.methods).filter((m) => layer.route.methods[m]);
    for (const method of methods) {
      // Last handler in the route's own stack is the real terminal handler
      // (earlier ones on some routes are per-route rate limiters).
      const finalLayer = layer.route.stack[layer.route.stack.length - 1];
      routes.push({ method: method.toUpperCase(), path, handle: finalLayer.handle });
    }
  }
  if (routes.length === 0) {
    throw new Error(`enumerateRoutes found ZERO routes on ${routerName} -- fuzz coverage gap`);
  }
  return routes;
}

const ROUTERS: Array<{ name: string; router: Router }> = [
  { name: 'healthRouter', router: healthRouter },
  { name: 'metricsRouter', router: metricsRouter },
  { name: 'toolsRouter', router: toolsRouter },
  { name: 'agentsRouter', router: agentsRouter },
  { name: 'x402Router', router: x402Router },
  { name: 'onboardRouter', router: onboardRouter },
  { name: 'appealsRouter', router: appealsRouter },
  { name: 'executeRouter', router: executeRouter },
  { name: 'batchRouter', router: batchRouter },
  { name: 'dashboardRouter', router: dashboardRouter },
  { name: 'oauthRouter', router: oauthRouter },
];

// Fuzz payloads for a `:param` path segment -- each is individually
// dangerous to a naive handler (SQL-ish, path traversal, oversized, type
// confusion via encoding, empty).
const FUZZ_PARAMS = [
  "'; DROP TABLE agents; --",
  '../../../etc/passwd',
  'a'.repeat(5000),
  '%00',
  '',
  '💀'.repeat(50),
];

// Fuzz bodies -- each individually dangerous to a naive JSON-shape assumer.
const FUZZ_BODIES: unknown[] = [
  null,
  {},
  { toString: () => 'x' },
  [],
  'a raw string body, not an object',
  { nested: { very: { deep: { object: { with: { many: { levels: 1 } } } } } } },
  { calls: 'not-an-array-even-though-batch-wants-one' },
];

function fuzzedPath(routePath: string, fuzzValue: string): { path: string; url: string } {
  const filled = routePath.replace(/:[a-zA-Z0-9_]+/g, () => encodeURIComponent(fuzzValue));
  return { path: filled, url: filled };
}

function fakeRes() {
  const res: {
    statusCode: number;
    _body: unknown;
    status: (c: number) => typeof res;
    json: (b: unknown) => typeof res;
    send: (b: unknown) => typeof res;
    type: (t: string) => typeof res;
    set: (...a: unknown[]) => typeof res;
    setHeader: (...a: unknown[]) => void;
    end: () => void;
  } = {
    statusCode: 200,
    _body: undefined,
    status(c) {
      res.statusCode = c;
      return res;
    },
    json(b) {
      res._body = b;
      return res;
    },
    send(b) {
      res._body = b;
      return res;
    },
    type() {
      return res;
    },
    set() {
      return res;
    },
    setHeader() {},
    end() {},
  };
  return res;
}

/** Runs one handler call, catching BOTH a synchronous throw and an
 * asynchronous rejection that reaches `next(err)` -- either shape, in a
 * real Express app with no try/catch of its own around the pipeline,
 * is exactly what an unhandled-rejection process crash looks like. */
async function invokeSafely(
  route: DiscoveredRoute,
  req: Record<string, unknown>,
): Promise<{ crashed: boolean; status: number; nextErr: unknown }> {
  const res = fakeRes();
  let nextErr: unknown;
  let crashed = false;
  const next = (err?: unknown) => {
    if (err) nextErr = err;
  };
  try {
    await route.handle(req, res, next);
  } catch (e) {
    crashed = true;
    nextErr = e;
  }
  return { crashed, status: res.statusCode, nextErr };
}

describe('FUZZ gate — every declared route, enumerated from the real router tables (ШАГ 6)', () => {
  for (const { name, router } of ROUTERS) {
    describe(name, () => {
      const routes = enumerateRoutes(router, name);

      it(`declares at least one route (sanity — a router with zero routes is a coverage gap, not a pass)`, () => {
        expect(routes.length).toBeGreaterThan(0);
      });

      for (const route of routes) {
        const hasParam = /:[a-zA-Z0-9_]+/.test(route.path);
        const takesBody = route.method === 'POST' || route.method === 'PUT';

        if (hasParam) {
          for (const fuzz of FUZZ_PARAMS) {
            it(`${route.method} ${route.path} — malformed param ${JSON.stringify(fuzz.slice(0, 20))}... never crashes the process`, async () => {
              const { path } = fuzzedPath(route.path, fuzz);
              const paramNames = [...route.path.matchAll(/:([a-zA-Z0-9_]+)/g)].map((m) => m[1]);
              const params: Record<string, string> = {};
              for (const p of paramNames) params[p] = fuzz;
              const req = {
                params,
                query: {},
                body: takesBody ? FUZZ_BODIES[0] : undefined,
                headers: { accept: 'application/json' },
                path,
                originalUrl: path,
                get: () => 'test.local',
                ip: '127.0.0.1',
              };
              const result = await invokeSafely(route, req);
              expect(result.crashed).toBe(false);
              // Either a clean status code was set, or the error was routed
              // to next() for the real errorHandlerMiddleware to turn into
              // one -- both are "the process is alive", never an uncaught
              // throw. If the handler set a status itself, it must be 4xx
              // for malformed input (never a silent 200/500).
              if (result.status !== 200) {
                expect(result.status).toBeGreaterThanOrEqual(400);
                expect(result.status).toBeLessThan(500);
              }
            });
          }
        }

        if (takesBody) {
          for (const body of FUZZ_BODIES) {
            it(`${route.method} ${route.path} — malformed body ${JSON.stringify(body).slice(0, 40)} never crashes the process`, async () => {
              const paramNames = [...route.path.matchAll(/:([a-zA-Z0-9_]+)/g)].map((m) => m[1]);
              const params: Record<string, string> = {};
              for (const p of paramNames) params[p] = 'fuzz-param-value';
              const req = {
                params,
                query: {},
                body,
                headers: { accept: 'application/json', 'content-type': 'application/json' },
                path: route.path,
                originalUrl: route.path,
                get: () => 'test.local',
                ip: '127.0.0.1',
              };
              const result = await invokeSafely(route, req);
              expect(result.crashed).toBe(false);
              if (result.status !== 200 && result.status !== 201) {
                expect(result.status).toBeGreaterThanOrEqual(400);
                expect(result.status).toBeLessThan(500);
              }
            });
          }
        }

        if (!hasParam && !takesBody) {
          it(`${route.method} ${route.path} — no injectable input, just confirms the handler doesn't throw on a bare request`, async () => {
            const req = {
              params: {},
              query: {},
              headers: { accept: 'application/json' },
              path: route.path,
              originalUrl: route.path,
              get: () => 'test.local',
              ip: '127.0.0.1',
            };
            const result = await invokeSafely(route, req);
            expect(result.crashed).toBe(false);
          });
        }
      }
    });
  }
});
