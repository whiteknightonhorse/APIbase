/**
 * T-0338 item 1/3: AUTH never mints a 402 for a call that cannot be served.
 * Unknown tool -> 404, unavailable tool -> 503 (with alternatives), invalid body -> 400;
 * a valid body on an available paid tool still gets the 402 challenge. REST and MCP share the path.
 */
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
jest.mock('../../src/services/alternatives.service', () => ({
  getCapabilityForTool: () => undefined,
  getAlternativesForTool: async (id: string) =>
    id === 'down.tool' ? [{ tool_id: 'other.tool', provider: 'other' }] : [],
}));
jest.mock('../../src/schemas', () => ({
  toolSchemas: {
    'paid.tool': z.object({ q: z.string() }),
    'down.tool': z.object({ q: z.string() }),
  },
}));

import { authStage } from '../../src/pipeline/stages/auth.stage';
import { createPipelineContext } from '../../src/pipeline/types';
import { __setToolCacheEntryForTest } from '../../src/pipeline/stages/tool-status.stage';

const entry = (tool_id: string, status: string) => ({
  tool_id,
  status,
  price_usd: 0.02,
  cache_ttl: 0,
  upstream_cost_usd: null,
});

beforeAll(() => {
  __setToolCacheEntryForTest(entry('paid.tool', 'active'));
  __setToolCacheEntryForTest(entry('down.tool', 'unavailable'));
});

const run = async (toolId: string, body: unknown, path: string) => {
  const ctx = createPipelineContext('r1', 'POST', path, body, {});
  ctx.toolId = toolId;
  return authStage.execute(ctx);
};

describe.each([
  ['REST', '/api/v1/tools/X/call'],
  ['MCP', '/mcp'],
])('AUTH pre-payment check (%s)', (_name, path) => {
  it('unavailable tool, no payment -> 503 provider_unavailable with alternatives, not 402', async () => {
    const r = await run('down.tool', { q: 'x' }, path);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe(503);
    expect(r.error.error).toBe('provider_unavailable');
    expect(r.error.retryAfter).toBe(30);
    expect(r.error.extra?.alternatives).toEqual([{ tool_id: 'other.tool', provider: 'other' }]);
  });

  it('unknown tool -> 404', async () => {
    const r = await run('no.such.tool', {}, path);
    expect(!r.ok && r.error.code).toBe(404);
  });

  it('body failing the zod schema -> 400 schema_validation_failed with expected_params, not 402', async () => {
    const r = await run('paid.tool', { wrong: 1 }, path);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe(400);
    expect(r.error.error).toBe('schema_validation_failed');
    expect(r.error.extra?.expected_params).toEqual(['q']);
    expect(r.error.extra?.received_params).toEqual(['wrong']);
  });

  it('valid body on an available paid tool still gets the 402 challenge', async () => {
    const r = await run('paid.tool', { q: 'x' }, path);
    expect(!r.ok && r.error.code).toBe(402);
  });
});
