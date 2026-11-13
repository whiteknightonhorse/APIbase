/**
 * ZZ-03-01 (closes GitHub issue #282): tools.category / TOOL_DEFINITIONS[].category is now
 * the single source of truth shared by the MCP surface, the REST catalog and static/llms.txt +
 * static/ai.txt. Before this migration, REST computed its own tool_id-prefix guess instead of
 * reading a real category at all (see migration 0017's header comment). This file pins that
 * contract at the tool-registry.service layer -- where a DB row becomes a REST
 * ToolCatalogEntry -- so a future change can't silently reintroduce a second, drifting
 * category source without a test going red.
 */
const findManyMock = jest.fn();
const countMock = jest.fn();
const findUniqueMock = jest.fn();
// ZZ-03-03: toEntries() now also batches provider_status + open-incidents
// per catalog request -- defaulted to "nothing on record" below so every
// pre-existing test in this file, none of which cares about quality, keeps
// working unchanged.
const providerStatusFindManyMock = jest.fn();
const incidentGroupByMock = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    tool: {
      findMany: findManyMock,
      count: countMock,
      findUnique: findUniqueMock,
    },
    providerStatus: {
      findMany: providerStatusFindManyMock,
    },
    incident: {
      groupBy: incidentGroupByMock,
    },
  })),
}));

// ZZ-03-03: toEntries() tries Redis for quality.tool -- reject it the same
// way dashboard-autopilot-status.test.ts does, so this file's tests never
// depend on (or hang on) a real Redis connection.
jest.mock('../../src/services/redis.service', () => ({
  ensureRedisConnected: jest.fn().mockRejectedValue(new Error('no redis in this test')),
}));

jest.mock('../../src/config/index', () => ({ config: { X402_NETWORK: 'base' } }));
jest.mock('../../src/config/mpp.config', () => ({
  getMppConfig: () => ({ enabled: false, testnet: false }),
}));

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Request, Response } from 'express';
import { TOOL_DEFINITIONS } from '../../src/mcp/tool-definitions';
import { getToolsPaginated, getToolById } from '../../src/services/tool-registry.service';
import { categorySummary, discover } from '../../src/services/discovery.service';
import { categoryOf, median, summarizeCategories } from '../../src/services/category-summary';
import { ApibaseAdapter } from '../../src/adapters/apibase';
import { toolsRouter } from '../../src/routes/tools.router';
import {
  __setToolCacheEntryForTest,
  __clearToolCacheForTest,
} from '../../src/pipeline/stages/tool-status.stage';

// Deterministic "random" 20-of-N sample -- fixed stride keeps the test reproducible instead
// of flaking on whichever 20 IDs a real Math.random() pick would land on.
function sampleDefinitions(n: number) {
  const stride = Math.max(1, Math.floor(TOOL_DEFINITIONS.length / n));
  const picked = [];
  for (let i = 0; i < TOOL_DEFINITIONS.length && picked.length < n; i += stride) {
    picked.push(TOOL_DEFINITIONS[i]);
  }
  return picked;
}

function rowFor(def: (typeof TOOL_DEFINITIONS)[number]) {
  return {
    tool_id: def.toolId,
    name: def.toolId,
    provider: def.toolId.split('.')[0],
    status: 'healthy',
    price_usd: '0.001',
    category: def.category,
    namespace: def.toolId.split('.')[0],
  };
}

beforeEach(() => {
  findManyMock.mockReset();
  countMock.mockReset();
  findUniqueMock.mockReset();
  providerStatusFindManyMock.mockReset().mockResolvedValue([]);
  incidentGroupByMock.mockReset().mockResolvedValue([]);
});

describe('ZZ-03-01: REST tool entries carry TOOL_DEFINITIONS[].category, never a recomputed guess', () => {
  it('category matches TOOL_DEFINITIONS[toolId].category for 20 sampled tool IDs (getToolsPaginated)', async () => {
    const sample = sampleDefinitions(20);
    expect(sample.length).toBe(20);
    const rows = sample.map(rowFor);
    findManyMock.mockResolvedValueOnce(rows);
    countMock.mockResolvedValueOnce(rows.length);

    const result = await getToolsPaginated(null, 2000, {});

    expect(result.data).toHaveLength(20);
    for (const entry of result.data) {
      const def = TOOL_DEFINITIONS.find((d) => d.toolId === entry.id);
      expect(def).toBeDefined();
      expect(entry.category).toBe(def!.category);
      // namespace: the OLD prefix-derived value -- still present, under its own name (not lost).
      expect(entry.namespace).toBe(entry.id.split('.')[0]);
    }
  });

  it('category matches TOOL_DEFINITIONS[toolId].category via getToolById (single-tool endpoint)', async () => {
    const def = TOOL_DEFINITIONS[Math.floor(TOOL_DEFINITIONS.length / 3)];
    findUniqueMock.mockResolvedValueOnce(rowFor(def));

    const entry = await getToolById(def.toolId);

    expect(entry).not.toBeNull();
    expect(entry!.category).toBe(def.category);
  });

  it('?category= filter is forwarded to the DB query unchanged (case-sensitive exact match)', async () => {
    findManyMock.mockResolvedValueOnce([]);
    countMock.mockResolvedValueOnce(0);

    await getToolsPaginated(null, 2000, { category: 'finance' });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ category: 'finance' }),
      }),
    );
  });
});

describe('ZZ-03-01 regression: /api/v1/tools entry shape unchanged for pre-existing consumers', () => {
  it('every pre-ZZ-03-01 ToolCatalogEntry field is still present alongside the new category/namespace', async () => {
    const def = TOOL_DEFINITIONS[0];
    findManyMock.mockResolvedValueOnce([rowFor(def)]);
    countMock.mockResolvedValueOnce(1);

    const result = await getToolsPaginated(null, 10, {});
    const entry = result.data[0];

    expect(entry).toMatchObject({
      id: def.toolId,
      name: expect.any(String),
      description: expect.any(String),
      endpoint: `/api/v1/tools/${def.toolId}/call`,
      method: 'POST',
      provider: expect.any(String),
      pricing: { price_usd: expect.any(Number), cache_hit_price_usd: expect.any(Number) },
      tier: expect.any(String),
      min_balance_usd: expect.any(Number),
      input_schema: expect.any(Object),
      status: expect.any(String),
      // new fields, additive only:
      category: def.category,
      namespace: expect.any(String),
      // ZZ-03-03, additive: no provider_status row and no Redis in this test
      // -> genuinely null/zero, never fabricated.
      quality: {
        method: 'apibase-rs/1',
        provider: {
          score: null,
          state: null,
          open_incidents: 0,
          last_probe_at: null,
          score_as_of: null,
        },
        tool: null,
      },
    });
  });

  it('pagination envelope shape (cursor/has_more/limit/total) is unchanged', async () => {
    findManyMock.mockResolvedValueOnce([]);
    countMock.mockResolvedValueOnce(0);

    const result = await getToolsPaginated(null, 10, { tier: 'premium' });

    expect(result).toEqual({
      data: [],
      total: 0,
      pagination: { cursor: null, has_more: false, limit: 10 },
    });
  });
});

// ---------------------------------------------------------------------------
// T-0835: the categories call (REST and MCP) from one source
// ---------------------------------------------------------------------------

function seed(def: (typeof TOOL_DEFINITIONS)[number], price_usd: number, status = 'healthy') {
  __setToolCacheEntryForTest({
    tool_id: def.toolId,
    status,
    price_usd,
    cache_ttl: 0,
    upstream_cost_usd: null,
    price_floor_usd: null,
    provider: def.toolId.split('.')[0],
  });
}

/** tool ids of the frozen active snapshot gen-discovery.ts reads under SYNC_COUNTS_SNAPSHOT. */
function snapshotIds(): Set<string> {
  const text = readFileSync(resolve(__dirname, '../../scripts/discovery-snapshot.tsv'), 'utf8');
  return new Set(
    text
      .split('\n')
      .filter(Boolean)
      .map((l) => l.split('\t')[0]),
  );
}

describe('T-0835: summarizeCategories and median', () => {
  it('median: odd size is the middle value, even size the mean of the two middle values', () => {
    expect(median([0.003, 0.001, 0.002])).toBe(0.002);
    expect(median([0.004, 0.001, 0.003, 0.002])).toBe(0.0025);
    expect(median([5])).toBe(5);
  });

  it('groups by category sorted by name with min/median/max and a total', () => {
    const r = summarizeCategories([
      { category: 'weather', price_usd: 0.002 },
      { category: 'finance', price_usd: 0.001 },
      { category: 'weather', price_usd: 0.004 },
      { category: 'weather', price_usd: 0.003 },
      { category: 'uncategorized', price_usd: 0 },
    ]);
    expect(r.total_tools).toBe(5);
    expect(r.categories.map((c) => c.category)).toEqual(['finance', 'uncategorized', 'weather']);
    expect(r.categories[2]).toEqual({
      category: 'weather',
      tools: 3,
      price_usd: { min: 0.002, median: 0.003, max: 0.004 },
    });
  });

  it('a definition without a category is counted under uncategorized', () => {
    expect(categoryOf({})).toBe('uncategorized');
    expect(categoryOf({ category: 'travel' })).toBe('travel');
  });
});

describe('T-0835: categorySummary() over the discover() candidate set', () => {
  beforeEach(() => {
    __clearToolCacheForTest();
    findManyMock.mockReset().mockResolvedValue([]);
    providerStatusFindManyMock.mockReset().mockResolvedValue([]);
  });

  it('counts add up to total_tools and to discover() total_matches with no filter; unavailable excluded', async () => {
    const defs = sampleDefinitions(40);
    defs.forEach((d, i) => seed(d, (i % 7) / 1000, i % 10 === 9 ? 'unavailable' : 'healthy'));
    const summary = await categorySummary();
    const sum = summary.categories.reduce((a, c) => a + c.tools, 0);
    const active = defs.filter((_, i) => i % 10 !== 9).length;
    expect(summary.total_tools).toBe(active);
    expect(sum).toBe(summary.total_tools);
    const found = await discover({ limit: 1 });
    expect(found.total_matches).toBe(summary.total_tools);
    const names = summary.categories.map((c) => c.category);
    expect(names).toEqual([...names].sort());
    for (const c of summary.categories) {
      expect(c.price_usd.min).toBeLessThanOrEqual(c.price_usd.median);
      expect(c.price_usd.median).toBeLessThanOrEqual(c.price_usd.max);
    }
  });

  it('REST route and MCP tool return the same object, under 5 KB for the full snapshot', async () => {
    const ids = snapshotIds();
    for (const d of TOOL_DEFINITIONS) if (ids.has(d.toolId)) seed(d, 0.001);
    const layer = (
      toolsRouter as unknown as {
        stack: Array<{ route?: { path: string; stack: Array<{ handle: unknown }> } }>;
      }
    ).stack.find((l) => l.route?.path === '/api/v1/categories');
    if (!layer?.route) throw new Error('route /api/v1/categories not registered');
    const handler = layer.route.stack[0].handle as (
      req: Request,
      res: Response,
      next: (e?: unknown) => void,
    ) => Promise<void>;
    const res = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    await handler({} as Request, res as unknown as Response, jest.fn());
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=60');
    const restBody = res.json.mock.calls[0][0];

    const mcp = await new ApibaseAdapter().call({
      toolId: 'apibase.categories',
      params: {},
    } as never);
    expect(mcp.body).toEqual(restBody);
    expect(JSON.stringify(restBody).length).toBeLessThan(5000);
  });

  it('the category count in generated llms.txt equals the number of categories the call returns', async () => {
    const ids = snapshotIds();
    for (const d of TOOL_DEFINITIONS) if (ids.has(d.toolId)) seed(d, 0.001);
    const { categories } = await categorySummary();
    const llms = readFileSync(resolve(__dirname, '../../static/llms.txt'), 'utf8');
    const m = /apibase\.categories \(GET \/api\/v1\/categories\): the (\d+) categories/.exec(llms);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBe(categories.length);
    expect(llms).toContain('GET /api/v1/tools/<id>');
  });
});
