import { z } from 'zod';
import { computeMcpCounts, checkSurfaces } from '../../scripts/count-mcp-tools';

const obj = z.object({});
const defs = [
  { toolId: 'apibase.discover' },
  { toolId: 'device.list' },
  { toolId: 'a.one' },
  { toolId: 'a.two' },
  { toolId: 'b.noschema' },
  { toolId: 'c.inactive' },
];
const schemas = {
  'apibase.discover': obj,
  'device.list': obj,
  'a.one': obj,
  'a.two': obj,
  'c.inactive': obj,
};
const activeIds = new Set(['apibase.discover', 'device.list', 'a.one', 'a.two', 'b.noschema']);

describe('count-mcp-tools formula (fixture registry)', () => {
  const c = computeMcpCounts({ defs, schemas, activeIds, shopCount: 3 });

  it('PUBLISHED = active AND has a ZodObject schema', () => {
    expect(c.published).toBe(4);
    expect(c.skipped).toEqual(['b.noschema']);
  });

  it('PLATFORM = discover + device (inside PUBLISHED) + shop', () => {
    expect(c.platform_in_published).toBe(2);
    expect(c.platform).toBe(5);
  });

  it('tools/list = PUBLISHED + shop; openapi = PUBLISHED + 3 non-tool paths', () => {
    expect(c.mcp_list).toBe(7);
    expect(c.openapi_paths).toBe(7);
  });

  it('a non-object schema is not registered', () => {
    const r = computeMcpCounts({
      defs: [{ toolId: 'x.y' }],
      schemas: { 'x.y': z.string() },
      activeIds: new Set(['x.y']),
      shopCount: 0,
    });
    expect(r.published).toBe(0);
  });
});

describe('checkSurfaces', () => {
  const c = computeMcpCounts({
    defs,
    schemas,
    activeIds: new Set(['a.one', 'a.two']),
    shopCount: 3,
  });

  it('is clean when mcp.json and openapi agree', () => {
    const r = checkSurfaces(c, { tools_count: 2, platform_tools_count: 3 }, 5, 2);
    expect(r.failures).toEqual([]);
  });

  it('MUTATION: a hand-edited tools_count names mcp.json', () => {
    const r = checkSurfaces(c, { tools_count: 999, platform_tools_count: 3 }, 5, 2);
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0]).toContain('mcp.json lies');
  });

  it('a wrong openapi path count names openapi.json', () => {
    const r = checkSurfaces(c, { tools_count: 2, platform_tools_count: 3 }, 9, 2);
    expect(r.failures.join()).toContain('openapi.json lies');
  });

  it('a snapshot that disagrees with the registry is reported', () => {
    const r = checkSurfaces(c, { tools_count: 2, platform_tools_count: 3 }, 5, 7);
    expect(r.failures.join()).toContain('baseline');
  });
});
