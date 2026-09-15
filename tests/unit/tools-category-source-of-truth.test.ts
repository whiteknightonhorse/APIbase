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

import { TOOL_DEFINITIONS } from '../../src/mcp/tool-definitions';
import { getToolsPaginated, getToolById } from '../../src/services/tool-registry.service';

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
      endpoint: `/api/v1/tools/${def.toolId}`,
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
