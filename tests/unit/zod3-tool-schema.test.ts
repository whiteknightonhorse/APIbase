/**
 * T-0603 (zod 3 -> 4, GHSA-mrhx-c7xc-m3w5): tools/list and the hand-written converter stay
 * byte-identical to their zod 3 output, and @x402/core 2.29 (zod 4) parses our Base USDC 402.
 *
 * The fixture was captured under zod 3.25.76 at ed21b180 (one tool per construct where zod 4's
 * own JSON Schema differs: object additionalProperties, outputSchema required, .int() bounds,
 * records, uuid, unions, numeric-string enum order, shared-instance $ref, tuples, defaults,
 * nullable outputs, an empty shape). The full-catalog before/after comparison (1477 tools,
 * sha256 identical) is in the T-0603 knowledge note.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { PaymentRequiredV2Schema, PaymentRequirementsV2Schema } from '@x402/core/schemas';
import { z } from 'zod';

jest.mock('../../src/config/index', () => ({
  config: {
    ENCRYPTION_KEY: 'k'.repeat(40),
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
const mockWarn = jest.fn();
jest.mock('../../src/config/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: (...a: unknown[]) => mockWarn(...a),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));
jest.mock('../../src/pipeline/pipeline', () => ({ runPipeline: jest.fn() }));

import { createMcpServer } from '../../src/mcp/server';
import { toZod3, withZod3ToolSchemas } from '../../src/mcp/zod3-tool-schema';
import { toolSchemas } from '../../src/schemas';
import { orderedEnum, zodToJsonSchema } from '../../src/utils/zod-to-json-schema';
import { buildPaymentRequiredResponse } from '../../src/middleware/x402.middleware';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const baseline = JSON.parse(
  readFileSync(join(__dirname, '../fixtures/zod3-tool-schema-baseline.json'), 'utf8'),
) as {
  tools_list: Record<string, Record<string, unknown>>;
  converter: Record<string, Record<string, unknown>>;
};

async function listTools(server: McpServer): Promise<Array<Record<string, unknown>>> {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const c = new Client({ name: 't', version: '1' });
  await Promise.all([server.connect(a), c.connect(b)]);
  return (await c.listTools()).tools as Array<Record<string, unknown>>;
}

describe('T-0603 tools/list keeps its zod 3 JSON Schema', () => {
  let tools: Array<Record<string, unknown>>;
  beforeAll(async () => {
    tools = await listTools(createMcpServer('', 'req', {} as never));
  });

  it.each(Object.keys(baseline.tools_list))('%s is byte-identical to the zod 3 listing', (name) => {
    const got = tools.find((t) => t.name === name);
    expect(got).toBeDefined();
    expect(JSON.stringify(got)).toBe(JSON.stringify(baseline.tools_list[name]));
  });

  it('no tool in the catalog falls back to the SDK rendering', () => {
    expect(tools.length).toBeGreaterThan(1000);
    expect(mockWarn).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('zod3 tool schema mirror failed'),
    );
  });

  it('every tool schema mirrors into zod/v3 without throwing', () => {
    for (const [id, schema] of Object.entries(toolSchemas)) {
      expect(() => toZod3(schema as never)).not.toThrow();
      expect(id).toBeTruthy();
    }
  });

  it('a schema the mirror cannot handle keeps the SDK rendering and is logged', async () => {
    const s = new McpServer({ name: 'x', version: '1' });
    (s.registerTool as (...a: unknown[]) => unknown)(
      'odd',
      {
        inputSchema: {
          pick: z.discriminatedUnion('k', [
            z.object({ k: z.literal('a') }),
            z.object({ k: z.literal('b') }),
          ]),
        },
      },
      async () => ({ content: [] }),
    );
    withZod3ToolSchemas(s);
    const [odd] = await listTools(s);
    expect(odd.inputSchema).toMatchObject({ type: 'object' });
    expect(mockWarn).toHaveBeenCalledWith(
      expect.objectContaining({ tool: 'odd' }),
      expect.stringContaining('zod3 tool schema mirror failed'),
    );
    mockWarn.mockClear();
  });
});

describe('T-0603 hand-written converter output is unchanged (fingerprints, cache keys, OpenAPI)', () => {
  it.each(Object.keys(baseline.converter))('%s is byte-identical to the zod 3 output', (id) => {
    expect(JSON.stringify(zodToJsonSchema(toolSchemas[id] as never))).toBe(
      JSON.stringify(baseline.converter[id]),
    );
  });

  it('orderedEnum keeps declaration order through describe/optional; plain z.enum does not', () => {
    const ordered = orderedEnum(['hilo', 'h', '6']).optional().describe('d');
    expect(zodToJsonSchema(z.object({ a: ordered }))).toEqual({
      type: 'object',
      properties: { a: { type: 'string', enum: ['hilo', 'h', '6'], description: 'd' } },
    });
    expect(z.enum(['hilo', 'h', '6']).options).toEqual(['6', 'hilo', 'h']);
  });

  it('.int() emits no safe-integer bounds; gt/lt still map to minimum/maximum', () => {
    expect(zodToJsonSchema(z.number().int().positive().max(5))).toEqual({
      type: 'integer',
      minimum: 0,
      maximum: 5,
    });
  });
});

describe('T-0603 @x402/core 2.29 (zod 4) parses our Base USDC 402 challenge', () => {
  it('PaymentRequiredV2Schema and PaymentRequirementsV2Schema accept buildPaymentRequiredResponse', () => {
    const challenge = buildPaymentRequiredResponse(
      'weather.get_current',
      0.001,
      3,
      'req-1',
      'apibase.pro',
    );
    const parsed = PaymentRequiredV2Schema.safeParse(challenge);
    expect(parsed.success).toBe(true);
    const req = PaymentRequirementsV2Schema.parse((challenge.accepts as unknown[])[0]);
    expect(req).toMatchObject({
      scheme: 'exact',
      network: 'eip155:8453',
      asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      amount: '1000',
      payTo: '0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480',
      extra: { name: 'USD Coin', version: '2' },
    });
  });

  it('a requirement without payTo is rejected (the schema still validates, not passes through)', () => {
    const challenge = buildPaymentRequiredResponse(
      'weather.get_current',
      0.001,
      3,
      'req-1',
      'apibase.pro',
    );
    const { payTo: _drop, ...rest } = (challenge.accepts as Array<Record<string, unknown>>)[0];
    expect(PaymentRequirementsV2Schema.safeParse(rest).success).toBe(false);
  });
});
