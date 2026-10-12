/**
 * T-0338: POST /api/v1/tools/:toolId/call over real HTTP -- an unavailable tool answers 503 with
 * alternatives (not 402) and an invalid body answers 400, both before any payment challenge.
 */
import express from 'express';
import type { AddressInfo } from 'node:net';
import { z } from 'zod';

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
jest.mock('../../src/services/prisma.service', () => ({ getPrisma: () => ({}) }));
jest.mock('../../src/services/redis.service', () => ({ ensureRedisConnected: async () => ({}) }));
jest.mock('../../src/services/x402-server.service', () => ({
  getSharedResourceServer: () => ({}),
}));
jest.mock('../../src/services/idempotency.service', () => ({
  finalizePipelineIdempotency: async () => undefined,
}));
jest.mock('../../src/middleware/x402.middleware', () => ({
  buildPaymentRequiredResponse: jest.fn(),
}));
jest.mock('../../src/middleware/mpp.middleware', () => ({ buildMppChallengeHeader: jest.fn() }));
jest.mock('../../src/adapters/registry', () => ({ resolveAdapter: jest.fn() }));
jest.mock('../../src/services/alternatives.service', () => ({
  getCapabilityForTool: () => undefined,
  getAlternativesForTool: async () => [{ tool_id: 'other.tool', provider: 'other' }],
}));
jest.mock('../../src/schemas', () => ({
  toolSchemas: { 'paid.tool': z.object({ q: z.string() }), 'down.tool': z.object({}) },
}));

import { executeRouter } from '../../src/routes/execute.router';
import { __setToolCacheEntryForTest } from '../../src/pipeline/stages/tool-status.stage';

const entry = (tool_id: string, status: string) => ({
  tool_id,
  status,
  price_usd: 0.02,
  cache_ttl: 0,
  upstream_cost_usd: null,
});

describe('POST /api/v1/tools/:toolId/call pre-payment codes', () => {
  const app = express().use(express.json()).use(executeRouter);
  const server = app.listen(0, '127.0.0.1');
  const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (tool: string, body: unknown) =>
    fetch(`${base()}/api/v1/tools/${tool}/call`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  beforeAll(async () => {
    if (!server.listening) await new Promise((r) => server.once('listening', r));
    __setToolCacheEntryForTest(entry('paid.tool', 'active'));
    __setToolCacheEntryForTest(entry('down.tool', 'unavailable'));
  });
  afterAll(() => new Promise((r) => server.close(r)));

  it('unavailable tool, no payment -> 503 with alternatives', async () => {
    const res = await post('down.tool', {});
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string; alternatives?: unknown[] };
    expect(body.error).toBe('provider_unavailable');
    expect(JSON.stringify(body)).toContain('other.tool');
  });

  it('invalid body, no payment -> 400', async () => {
    const res = await post('paid.tool', { nope: 1 });
    expect(res.status).toBe(400);
  });
});
