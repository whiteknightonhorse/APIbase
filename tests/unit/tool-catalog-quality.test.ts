/**
 * ZZ-03-03 (03-SPECIFICATION.md Q-1): `quality` on every `ToolCatalogEntry`
 * (GET /api/v1/tools, /api/v1/tools/{id}, /api/tools — all three route
 * through tool-registry.service.ts's toEntries()).
 *
 * MUTATION CONTROL, per the task's own acceptance text: a tool with no
 * traffic -> `quality.tool: null`, never a fabricated zero; a provider that
 * has never been scored -> `quality.provider.score: null`, never a
 * fabricated 0 -- and the classic twin of that trap, a REAL score of 0
 * (measured, terrible) must NOT collapse into the same null a naive
 * `score || null` rewrite would produce.
 */
const findManyMock = jest.fn();
const countMock = jest.fn();
const findUniqueMock = jest.fn();
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

const ensureRedisConnectedMock = jest.fn();
const mgetMock = jest.fn();

jest.mock('../../src/services/redis.service', () => ({
  ensureRedisConnected: ensureRedisConnectedMock,
}));

import { getToolById, getToolsPaginated } from '../../src/services/tool-registry.service';

function rowFor(toolId: string, provider = toolId.split('.')[0]) {
  return {
    tool_id: toolId,
    name: toolId,
    provider,
    status: 'healthy',
    price_usd: '0.001',
    category: 'finance',
    namespace: provider,
  };
}

function storedQuality(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    tool_id: 'weather.get_current',
    uptime_pct: 99.5,
    p50_ms: 120,
    p95_ms: 300,
    error_rate: 0.5,
    total_calls: 50,
    success_calls: 49,
    last_updated: '2026-09-15T00:00:00.000Z',
    ...overrides,
  });
}

beforeEach(() => {
  findManyMock.mockReset();
  countMock.mockReset();
  findUniqueMock.mockReset();
  providerStatusFindManyMock.mockReset().mockResolvedValue([]);
  incidentGroupByMock.mockReset().mockResolvedValue([]);
  mgetMock.mockReset().mockResolvedValue([null]);
  ensureRedisConnectedMock.mockReset().mockResolvedValue({ mget: mgetMock });
});

describe('ZZ-03-03: quality.method', () => {
  it('is the literal apibase-rs/1 tag on every entry', async () => {
    findUniqueMock.mockResolvedValueOnce(rowFor('books.search'));

    const entry = await getToolById('books.search');

    expect(entry?.quality.method).toBe('apibase-rs/1');
  });
});

describe('ZZ-03-03 MUTATION CONTROL: quality.tool', () => {
  it('a tool with no Redis key -> tool: null, never a fabricated zero', async () => {
    findUniqueMock.mockResolvedValueOnce(rowFor('weather.get_current'));
    mgetMock.mockResolvedValueOnce([null]);

    const entry = await getToolById('weather.get_current');

    expect(entry?.quality.tool).toBeNull();
  });

  it('a tool with a real Redis key -> the real ToolQualityResult, not null', async () => {
    findUniqueMock.mockResolvedValueOnce(rowFor('weather.get_current'));
    mgetMock.mockResolvedValueOnce([storedQuality()]);

    const entry = await getToolById('weather.get_current');

    expect(entry?.quality.tool).toEqual({
      window_h: 24,
      calls: 50,
      success_rate: 99.5,
      p50_ms: 120,
      p95_ms: 300,
      as_of: '2026-09-15T00:00:00.000Z',
    });
  });

  it('Redis unreachable -> tool: null for every entry, never a thrown 500', async () => {
    ensureRedisConnectedMock.mockReset().mockRejectedValue(new Error('ECONNREFUSED'));
    findManyMock.mockResolvedValueOnce([rowFor('weather.get_current'), rowFor('books.search')]);
    countMock.mockResolvedValueOnce(2);

    const result = await getToolsPaginated(null, 10, {});

    expect(result.data).toHaveLength(2);
    for (const entry of result.data) {
      expect(entry.quality.tool).toBeNull();
    }
  });
});

describe('ZZ-03-03 MUTATION CONTROL: quality.provider — the classic 0-vs-null trap', () => {
  it('no provider_status row at all -> score: null, never a fabricated 0', async () => {
    findUniqueMock.mockResolvedValueOnce(rowFor('ghostprov.tool1', 'ghostprov'));
    providerStatusFindManyMock.mockResolvedValueOnce([]);

    const entry = await getToolById('ghostprov.tool1');

    expect(entry?.quality.provider.score).toBeNull();
    expect(entry?.quality.provider.state).toBeNull();
    expect(entry?.quality.provider.last_probe_at).toBeNull();
    expect(entry?.quality.provider.score_as_of).toBeNull();
    // open_incidents is real 0-data (no incidents), not "unmeasured" — it
    // must stay the number 0, not null, even though everything else here is.
    expect(entry?.quality.provider.open_incidents).toBe(0);
  });

  it('a real reliability_score of 0 (measured, terrible) must NOT render as null', async () => {
    findUniqueMock.mockResolvedValueOnce(rowFor('badprov.tool1', 'badprov'));
    providerStatusFindManyMock.mockResolvedValueOnce([
      {
        provider: 'badprov',
        state: 'DOWN',
        reliability_score: 0,
        last_probe_at: new Date('2026-09-15T01:00:00.000Z'),
        reliability_calculated_at: new Date('2026-09-15T01:00:00.000Z'),
      },
    ]);

    const entry = await getToolById('badprov.tool1');

    // A naive `status?.reliability_score ?? null` rewrite that used `||`
    // instead of `??` would fail this assertion (0 is falsy in JS).
    expect(entry?.quality.provider.score).toBe(0);
    expect(entry?.quality.provider.score).not.toBeNull();
    expect(entry?.quality.provider.state).toBe('DOWN');
  });

  it('a provider row that was scored but has never been probed -> last_probe_at: null, score real', async () => {
    findUniqueMock.mockResolvedValueOnce(rowFor('freshprov.tool1', 'freshprov'));
    providerStatusFindManyMock.mockResolvedValueOnce([
      {
        provider: 'freshprov',
        state: 'UNKNOWN',
        reliability_score: 87,
        last_probe_at: null,
        reliability_calculated_at: new Date('2026-09-15T01:00:00.000Z'),
      },
    ]);

    const entry = await getToolById('freshprov.tool1');

    expect(entry?.quality.provider.score).toBe(87);
    expect(entry?.quality.provider.last_probe_at).toBeNull();
  });

  it('open_incidents counts non-RESOLVED incidents for the provider, forwarded from groupBy', async () => {
    findUniqueMock.mockResolvedValueOnce(rowFor('flakyprov.tool1', 'flakyprov'));
    providerStatusFindManyMock.mockResolvedValueOnce([
      {
        provider: 'flakyprov',
        state: 'DEGRADED',
        reliability_score: 40,
        last_probe_at: new Date('2026-09-15T01:00:00.000Z'),
        reliability_calculated_at: new Date('2026-09-15T01:00:00.000Z'),
      },
    ]);
    incidentGroupByMock.mockResolvedValueOnce([{ provider: 'flakyprov', _count: { _all: 2 } }]);

    const entry = await getToolById('flakyprov.tool1');

    expect(entry?.quality.provider.open_incidents).toBe(2);
    expect(incidentGroupByMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ state: { not: 'RESOLVED' } }),
      }),
    );
  });
});

describe('ZZ-03-03: batching — one provider_status/incident lookup per catalog page, not per row', () => {
  it('two tools on the same provider only look that provider up once', async () => {
    findManyMock.mockResolvedValueOnce([
      rowFor('sameprov.tool1', 'sameprov'),
      rowFor('sameprov.tool2', 'sameprov'),
    ]);
    countMock.mockResolvedValueOnce(2);

    await getToolsPaginated(null, 10, {});

    expect(providerStatusFindManyMock).toHaveBeenCalledTimes(1);
    expect(providerStatusFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { provider: { in: ['sameprov'] } } }),
    );
  });
});
