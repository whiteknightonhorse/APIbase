import { createHash } from 'node:crypto';
import stringify from 'fast-json-stable-stringify';
import {
  computeDefinitionSha256,
  getDefinitionSha256,
  getManifest,
  MANIFEST_SHA256,
  TOOL_FINGERPRINTS,
  TOOL_DESCRIPTIONS,
  TOOL_SCHEMAS_JSON,
} from '../../src/mcp/tool-fingerprint';
import { TOOL_DEFINITIONS } from '../../src/mcp/tool-definitions';

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
  it('manifest_sha256 equals sha256 over the sorted [id, hash] pairs', () => {
    const pairs = [...TOOL_FINGERPRINTS.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const expected = createHash('sha256').update(stringify(pairs)).digest('hex');
    expect(MANIFEST_SHA256).toBe(expected);
    expect(getManifest().manifest_sha256).toBe(expected);
  });

  it('lists every TOOL_DEFINITIONS id exactly once, sorted by id', () => {
    const m = getManifest();
    const ids = m.tools.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...new Set(TOOL_DEFINITIONS.map((d) => d.toolId))].sort());
    expect(m.total).toBe(ids.length);
    expect(m.algorithm).toContain('definition_sha256 = sha256hex');
    expect(m.package_version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
