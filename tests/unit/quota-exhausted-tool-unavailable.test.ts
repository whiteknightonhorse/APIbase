/**
 * T-0584: a tool withdrawn for an exhausted upstream quota (status_reason quota_exhausted) answers
 * 503 `tool_unavailable` with retry_after from the provider's next_probe_at, on a bare call and on a
 * call already carrying an x402 payment header: no 402/MPP challenge is minted and settleX402 is
 * never called. It is also absent from the MCP tools/list set (getActiveToolIds).
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
jest.mock('../../src/pipeline/stages/x402-settle', () => ({ settleX402: jest.fn() }));
jest.mock('../../src/adapters/registry', () => ({ resolveAdapter: jest.fn() }));
jest.mock('../../src/services/alternatives.service', () => ({
  getCapabilityForTool: () => undefined,
  getAlternativesForTool: async () => [{ tool_id: 'other.tool', provider: 'other' }],
}));
jest.mock('../../src/schemas', () => ({
  toolSchemas: { 'paid.tool': z.object({ q: z.string() }), 'down.tool': z.object({}) },
}));

import { executeRouter } from '../../src/routes/execute.router';
import {
  __setToolCacheEntryForTest,
  getActiveToolIds,
  toolStatusStage,
} from '../../src/pipeline/stages/tool-status.stage';
import { settleX402 } from '../../src/pipeline/stages/x402-settle';
import { buildPaymentRequiredResponse } from '../../src/middleware/x402.middleware';
import { buildMppChallengeHeader } from '../../src/middleware/mpp.middleware';

const entry = (tool_id: string, status: string, extra: Record<string, unknown> = {}) => ({
  tool_id,
  status,
  price_usd: 0.02,
  cache_ttl: 0,
  upstream_cost_usd: null,
  ...extra,
});

describe('quota-exhausted tool is withdrawn before any charge', () => {
  const app = express().use(express.json()).use(executeRouter);
  const server = app.listen(0, '127.0.0.1');
  const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (tool: string, headers: Record<string, string> = {}) =>
    fetch(`${base()}/api/v1/tools/${tool}/call`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ q: 'x' }),
    });

  beforeAll(async () => {
    if (!server.listening) await new Promise((r) => server.once('listening', r));
    __setToolCacheEntryForTest(
      entry('quota.tool', 'unavailable', {
        provider: 'quotaprov',
        status_reason: 'quota_exhausted',
        quota_retry_at: Date.now() + 3_600_000,
      }),
    );
    __setToolCacheEntryForTest(entry('live.tool', 'healthy'));
  });
  afterAll(() => new Promise((r) => server.close(r)));

  it('bare call -> 503 tool_unavailable, retry_after from next_probe_at, no challenge', async () => {
    const res = await post('quota.tool');
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string; retry_after?: number };
    expect(body.error).toBe('tool_unavailable');
    expect(body.retry_after).toBeGreaterThan(3500);
    expect(body.retry_after).toBeLessThanOrEqual(3600);
    expect(buildPaymentRequiredResponse).not.toHaveBeenCalled();
    expect(buildMppChallengeHeader).not.toHaveBeenCalled();
  });

  it('TOOL_STATUS (which runs before ESCROW and settle) rejects with 503 tool_unavailable', async () => {
    const r = await toolStatusStage.execute({ toolId: 'quota.tool' } as never);
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ error: { code: 503, error: 'tool_unavailable' } });
  });

  it('a call carrying a payment header is never settled or re-challenged', async () => {
    const res = await post('quota.tool', { 'x-payment': 'eyJ4IjoxfQ==' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(settleX402).not.toHaveBeenCalled();
    expect(buildPaymentRequiredResponse).not.toHaveBeenCalled();
  });

  it('tools/list set omits the withdrawn tool and keeps healthy ones', () => {
    const active = getActiveToolIds();
    expect(active.has('quota.tool')).toBe(false);
    expect(active.has('live.tool')).toBe(true);
  });
});
