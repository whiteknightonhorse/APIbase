import { createHash } from 'node:crypto';
import stringify from 'fast-json-stable-stringify';
import {
  computeDefinitionSha256,
  getDefinitionSha256,
  getManifest,
  getManifestSha256,
  TOOL_FINGERPRINTS,
  TOOL_DESCRIPTIONS,
  TOOL_SCHEMAS_JSON,
} from '../../src/mcp/tool-fingerprint';
import { TOOL_DEFINITIONS } from '../../src/mcp/tool-definitions';
import { getShopToolDefinitions } from '../../src/shop/tool-fingerprint';
import { zodToJsonSchema } from '../../src/utils/zod-to-json-schema';
import { z } from 'zod';
import { servedToolDefinitions } from '../../src/mcp/served-tools';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerMerchantTools } from '../../src/shop/tools/merchant.tools';

jest.mock('../../src/config/index', () => ({
  config: { ENCRYPTION_KEY: 'k'.repeat(40), X402_NETWORK: 'base' },
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
let mockActive = new Set<string>();
jest.mock('../../src/pipeline/stages/tool-status.stage', () => ({
  getActiveToolIds: () => mockActive,
}));

const base = {
  id: 'crypto.trending',
  description: 'Trending coins',
  input_schema: { type: 'object', properties: { limit: { type: 'number' } } },
};

describe('T-0500 definition_sha256', () => {
  it('is 64 lowercase hex', () => {
    expect(computeDefinitionSha256(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable across two computations and key order', () => {
    const reordered = {
      input_schema: { properties: { limit: { type: 'number' } }, type: 'object' },
      description: base.description,
      id: base.id,
    };
    expect(computeDefinitionSha256(base)).toBe(computeDefinitionSha256(base));
    expect(computeDefinitionSha256(reordered)).toBe(computeDefinitionSha256(base));
  });

  it('changes when the description changes by one character', () => {
    expect(computeDefinitionSha256({ ...base, description: 'Trending coinz' })).not.toBe(
      computeDefinitionSha256(base),
    );
  });

  it('changes when input_schema changes', () => {
    expect(
      computeDefinitionSha256({
        ...base,
        input_schema: { type: 'object', properties: { limit: { type: 'string' } } },
      }),
    ).not.toBe(computeDefinitionSha256(base));
  });

  it('does NOT change when price changes', () => {
    expect(computeDefinitionSha256({ ...base, price_usd: 0.001 })).toBe(
      computeDefinitionSha256({ ...base, price_usd: 0.5 }),
    );
    expect(computeDefinitionSha256({ ...base, price_usd: 0.001 })).toBe(
      computeDefinitionSha256(base),
    );
  });

  it('map values equal an independent recomputation from the served description and schema', () => {
    const def = TOOL_DEFINITIONS[0];
    const expected = createHash('sha256')
      .update(
        stringify({
          id: def.toolId,
          description: TOOL_DESCRIPTIONS.get(def.toolId),
          input_schema: TOOL_SCHEMAS_JSON.get(def.toolId) ?? {},
        }),
      )
      .digest('hex');
    expect(getDefinitionSha256(def.toolId)).toBe(expected);
  });
});

describe('T-0500 manifest', () => {
  beforeEach(() => {
    mockActive = new Set<string>();
  });

  const shopNames = () => [...getShopToolDefinitions().keys()];
  // Ids that are served with an empty active set (a def without a ZodObject schema never is).
  const subsetIds = () => {
    const shop = new Set(shopNames());
    return getManifest()
      .tools.map((t) => t.id)
      .filter((id) => !shop.has(id))
      .filter((_, i) => i % 3 === 0);
  };

  it('manifest_sha256 equals sha256 over the sorted [id, hash] pairs of the served set', () => {
    const m = getManifest();
    const pairs = m.tools.map((t) => [t.id, t.definition_sha256]);
    const expected = createHash('sha256').update(stringify(pairs)).digest('hex');
    expect(m.manifest_sha256).toBe(expected);
    expect(getManifestSha256()).toBe(expected);
    expect(m.tools.map((t) => t.id)).toEqual([...m.tools.map((t) => t.id)].sort());
  });

  it('size-0 guard: an empty active set serves every TOOL_DEFINITIONS id, plus the shop tools', () => {
    mockActive = new Set<string>();
    const m = getManifest();
    const ids = m.tools.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    const served = new Set(servedToolDefinitions().map((d) => d.toolId));
    expect(served.size).toBeGreaterThan(TOOL_DEFINITIONS.length - 20);
    for (const id of served) expect(ids).toContain(id);
    expect(m.total).toBe(ids.length);
  });

  it('lists every shop tool exactly once with the hash of the shop map', () => {
    const m = getManifest();
    expect(shopNames().length).toBeGreaterThan(0);
    for (const [name, def] of getShopToolDefinitions()) {
      const hits = m.tools.filter((t) => t.id === name);
      expect(hits).toHaveLength(1);
      expect(hits[0].definition_sha256).toBe(def.definition_sha256);
    }
  });

  it('a shop hash equals an independent recompute from the live registerTool config', () => {
    let seen: { description: string; inputSchema: Record<string, z.ZodTypeAny> } | undefined;
    const fake = {
      registerTool: (name: string, config: never) => {
        if (name === 'shop.merchant.register') seen = config;
      },
    } as unknown as McpServer;
    registerMerchantTools(fake, '', 'x');
    expect(seen).toBeDefined();
    const expected = createHash('sha256')
      .update(
        stringify({
          id: 'shop.merchant.register',
          description: seen!.description,
          input_schema: zodToJsonSchema(z.object(seen!.inputSchema)),
        }),
      )
      .digest('hex');
    expect(getShopToolDefinitions().get('shop.merchant.register')?.definition_sha256).toBe(
      expected,
    );
  });

  it('with a strict subset active the manifest is exactly that subset plus the shop names', () => {
    const unmocked = getManifest();
    const subset = subsetIds();
    mockActive = new Set(subset);
    const m = getManifest();
    expect(m.tools.map((t) => t.id).sort()).toEqual([...subset, ...shopNames()].sort());
    expect(m.total).toBe(m.tools.length);
    expect(m.manifest_sha256).not.toBe(unmocked.manifest_sha256);
    expect(getManifestSha256()).toBe(m.manifest_sha256);
  });

  it('metadata', () => {
    const m = getManifest();
    expect(m.algorithm).toContain('definition_sha256 = sha256hex');
    expect(m.package_version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
