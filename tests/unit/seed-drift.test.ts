import { TOOL_DEFINITIONS } from '../../src/mcp/tool-definitions';
import {
  computeDrift,
  loadYamlTools,
  newToolStatus,
  planSeedRows,
  seedOnly,
  type YamlTool,
} from '../../scripts/seed-plan';

const fixtureYaml: YamlTool[] = [
  {
    tool_id: 'a.one',
    name: 'A1',
    provider: 'a',
    price_usd: '0.002',
    cache_ttl: 60,
    upstream_cost_usd: '0',
  },
  { tool_id: 'a.two', name: 'A2', provider: 'a', price_usd: '0.002', cache_ttl: 60 },
  { tool_id: 'b.one', name: 'B1', provider: 'b', price_usd: '0.002', cache_ttl: 60 },
  {
    tool_id: 'c.zero',
    name: 'C0',
    provider: 'c',
    price_usd: '0',
    cache_ttl: 60,
    upstream_cost_usd: '0',
  },
];
const defs = [
  { toolId: 'a.one', category: 'world' },
  { toolId: 'a.two', category: 'world' },
  { toolId: 'b.one', category: 'media' },
  { toolId: 'd.nocfg', category: 'media' },
];

describe('computeDrift (fixture DB)', () => {
  it('lists defs absent from the DB with provider, category, price, cost model', () => {
    const drift = computeDrift(defs, new Set(['a.one']), fixtureYaml);
    expect(drift.map((d) => d.tool_id)).toEqual(['a.two', 'b.one', 'd.nocfg']);
    expect(drift[0]).toMatchObject({ provider: 'a', price_usd: '0.002', has_cost_model: true });
    expect(drift[1]).toMatchObject({ provider: 'b', has_cost_model: false });
    expect(drift[2]).toMatchObject({ price_usd: null, has_cost_model: false });
  });
  it('is empty when the DB has everything', () => {
    expect(computeDrift(defs, new Set(defs.map((d) => d.toolId)), fixtureYaml)).toEqual([]);
  });
});

describe('newToolStatus', () => {
  const cm = new Set(['a', 'c']);
  it('healthy only with price > 0 and a cost model', () => {
    expect(newToolStatus(fixtureYaml[0], cm)).toBe('healthy');
    expect(newToolStatus(fixtureYaml[2], cm)).toBe('unavailable'); // no cost model
    expect(newToolStatus(fixtureYaml[3], cm)).toBe('unavailable'); // $0 price
  });
});

const TWELVE_OR_SO = [
  'censusmapper.data',
  'censusmapper.list_datasets',
  'clevelandart.artwork_detail',
  'clevelandart.artwork_search',
  'clevelandart.creator_search',
  'clevelandart.exhibition_search',
  'epa-aqs.annual_data',
  'epa-aqs.daily_data',
  'epa-aqs.list_counties',
  'epa-aqs.list_parameters',
  'epa-aqs.monitors',
];

describe('seed --only --dry-run on the drift ids (real config)', () => {
  const cats = new Map(TOOL_DEFINITIONS.map((d) => [d.toolId, d.category] as [string, string]));
  const rows = planSeedRows(loadYamlTools(), cats, TWELVE_OR_SO);

  it('plans one row per id; never a $0 healthy tool', () => {
    expect(rows).toHaveLength(TWELVE_OR_SO.length);
    for (const r of rows) {
      if (Number(r.price_usd) === 0) expect(r.status).toBe('unavailable');
    }
    expect(rows.find((r) => r.tool_id === 'epa-aqs.monitors')?.status).toBe('healthy');
    expect(rows.find((r) => r.tool_id === 'clevelandart.artwork_search')?.status).toBe(
      'unavailable',
    );
  });

  it('dry-run makes 0 writes; real run creates only missing rows', async () => {
    const create = jest.fn().mockResolvedValue({});
    const db = {
      tool: { findMany: jest.fn().mockResolvedValue([{ tool_id: 'epa-aqs.monitors' }]), create },
    };
    const dry = await seedOnly(db, rows, true);
    expect(create).not.toHaveBeenCalled();
    expect(dry.created).toHaveLength(rows.length - 1);
    const real = await seedOnly(db, rows, false);
    expect(create).toHaveBeenCalledTimes(rows.length - 1);
    expect(real.skipped).toEqual(['epa-aqs.monitors']);
  });
});
