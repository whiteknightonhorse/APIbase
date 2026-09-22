/**
 * T-0207 (ZZ-03-07, 03-SPECIFICATION.md R-2, Q2 ruling-1 variant D — "declared equivalence +
 * advisory routing"). Критерии готовности (pinned literally, one test each):
 *   1. a regional equivalent is never suggested for a global request
 *   2. a same_upstream_as tool_id is never suggested
 *   3. an unavailable tool is never suggested
 * Acceptance criterion: for >=5 of the 16 measured capability groups, a real alternatives[]
 * comes back with correct price/status/scope.
 */
import {
  computeAlternatives,
  isScopeCompatible,
  getAlternativesForTool,
  getCapabilityForTool,
  type AlternativeCandidate,
} from '../../src/services/alternatives.service';
import {
  __setToolCacheEntryForTest,
  __clearToolCacheForTest,
} from '../../src/pipeline/stages/tool-status.stage';

function candidate(overrides: Partial<AlternativeCandidate> = {}): AlternativeCandidate {
  return {
    tool_id: 'x.default',
    provider: 'provider-x',
    capability: 'weather.current',
    scope: 'global',
    status: 'healthy',
    price_usd: 0.001,
    ...overrides,
  };
}

describe('computeAlternatives — pure matching rules (synthetic fixtures)', () => {
  it('Критерий 1: does not suggest a regional equivalent for a global request', () => {
    const requesting = candidate({ tool_id: 'weather.global_tool', scope: 'global' });
    const regional = candidate({ tool_id: 'weather.us_only', scope: 'regional:US' });
    const otherGlobal = candidate({ tool_id: 'weather.other_global', scope: 'global' });

    const result = computeAlternatives(requesting, [regional, otherGlobal], new Set());

    expect(result.map((r) => r.tool_id)).toEqual(['weather.other_global']);
  });

  it('a regional request MAY be offered a global alternative (global covers it) but not a different region', () => {
    const requesting = candidate({ tool_id: 'weather.us_tool', scope: 'regional:US' });
    const global = candidate({ tool_id: 'weather.global_tool', scope: 'global' });
    const otherRegion = candidate({ tool_id: 'weather.sg_tool', scope: 'regional:SG' });
    const sameRegion = candidate({ tool_id: 'weather.us_tool_2', scope: 'regional:US' });

    const result = computeAlternatives(requesting, [global, otherRegion, sameRegion], new Set());

    expect(new Set(result.map((r) => r.tool_id))).toEqual(
      new Set(['weather.global_tool', 'weather.us_tool_2']),
    );
  });

  it('Критерий 2: same_upstream_as is never suggested, even though it matches capability+scope', () => {
    const requesting = candidate({ tool_id: 'fx.a' });
    const sameUpstream = candidate({ tool_id: 'fx.b' });
    const real = candidate({ tool_id: 'fx.c' });

    const result = computeAlternatives(requesting, [sameUpstream, real], new Set(['fx.b']));

    expect(result.map((r) => r.tool_id)).toEqual(['fx.c']);
  });

  it('Критерий 3: an unavailable tool is never suggested', () => {
    const requesting = candidate({ tool_id: 'search.a' });
    const down = candidate({ tool_id: 'search.b', status: 'unavailable' });
    const healthy = candidate({ tool_id: 'search.c' });

    const result = computeAlternatives(requesting, [down, healthy], new Set());

    expect(result.map((r) => r.tool_id)).toEqual(['search.c']);
  });

  it('a degraded (not unavailable) alternative IS still suggested, ranked after healthy', () => {
    const requesting = candidate({ tool_id: 'search.a' });
    const degraded = candidate({ tool_id: 'search.b', status: 'degraded', price_usd: 0.0001 });
    const healthy = candidate({ tool_id: 'search.c', status: 'healthy', price_usd: 0.5 });

    const result = computeAlternatives(requesting, [degraded, healthy], new Set());

    expect(result.map((r) => r.tool_id)).toEqual(['search.c', 'search.b']);
  });

  it('returns [] for a tool with no declared capability', () => {
    const requesting = candidate({ tool_id: 'no.capability', capability: null, scope: null });
    const other = candidate({ tool_id: 'y', capability: null, scope: null });

    expect(computeAlternatives(requesting, [other], new Set())).toEqual([]);
  });

  it('never returns the requesting tool itself', () => {
    const requesting = candidate({ tool_id: 'weather.get_current' });

    const result = computeAlternatives(requesting, [requesting], new Set());

    expect(result).toEqual([]);
  });

  it('sorts by price ascending among equally-healthy candidates', () => {
    const requesting = candidate({ tool_id: 'req' });
    const expensive = candidate({ tool_id: 'pricey', price_usd: 0.05 });
    const cheap = candidate({ tool_id: 'cheap', price_usd: 0.001 });

    const result = computeAlternatives(requesting, [expensive, cheap], new Set());

    expect(result.map((r) => r.tool_id)).toEqual(['cheap', 'pricey']);
  });
});

describe('isScopeCompatible', () => {
  it.each([
    ['global', 'global', true],
    ['global', 'regional:US', false],
    ['regional:US', 'global', true],
    ['regional:US', 'regional:US', true],
    ['regional:US', 'regional:SG', false],
    [null, 'global', false],
    ['global', null, false],
    [null, null, false],
  ])('requestScope=%s candidateScope=%s -> %s', (req, cand, expected) => {
    expect(isScopeCompatible(req, cand)).toBe(expected);
  });
});

describe('getAlternativesForTool — real capability/scope registry + controlled live status/price', () => {
  // capability/scope/provider below come from the REAL config/tool_provider_config.yaml
  // (capability-registry.service.ts is never mocked in this file) — only status/price are
  // test-controlled (via the tool-status.stage.ts cache test hooks) so assertions are
  // deterministic instead of depending on whatever the live DB happens to report right now.
  // `bProvider` is the REAL provider declared for `b` in config/tool_provider_config.yaml —
  // getAlternativesForTool() reports the registry's provider, not whatever the test's fake
  // cache entry's `provider` field says (that field only feeds getToolProvider() elsewhere).
  const REAL_GROUP_CASES: Array<{ capability: string; a: string; b: string; bProvider: string }> = [
    {
      capability: 'weather.current',
      a: 'weather.get_current',
      b: 'weatherapi.current',
      bProvider: 'weatherapi',
    },
    {
      capability: 'geo.earthquakes',
      a: 'earthquake.search',
      b: 'emsc.search_earthquakes',
      bProvider: 'emsc',
    },
    {
      capability: 'holidays.public',
      a: 'calendarific.holidays',
      b: 'holidays.by_country',
      bProvider: 'nagerdate',
    },
    { capability: 'search.web', a: 'exa.search', b: 'tavily.search', bProvider: 'tavily' },
    {
      capability: 'web.screenshot',
      a: 'screenshot.capture',
      b: 'scrape.screenshot',
      bProvider: 'zyte',
    },
  ];

  beforeEach(() => {
    __clearToolCacheForTest();
  });

  it(`produces real alternatives[] with correct price/status/scope for ${REAL_GROUP_CASES.length} of the 16 measured groups`, async () => {
    for (const { capability, a, b, bProvider } of REAL_GROUP_CASES) {
      __clearToolCacheForTest();
      __setToolCacheEntryForTest({
        tool_id: a,
        status: 'healthy',
        price_usd: 0.005,
        cache_ttl: 0,
        upstream_cost_usd: null,
        provider: 'provider-a',
      });
      __setToolCacheEntryForTest({
        tool_id: b,
        status: 'healthy',
        price_usd: 0.009,
        cache_ttl: 0,
        upstream_cost_usd: null,
        provider: 'provider-b',
      });

      expect(getCapabilityForTool(a)).toBe(capability);

      const alternatives = await getAlternativesForTool(a);

      expect(alternatives).toHaveLength(1);
      expect(alternatives[0]).toEqual({
        tool_id: b,
        provider: bProvider,
        price_usd: 0.009,
        status: 'healthy',
        scope: 'global',
      });
    }
  });

  it('an unavailable real alternative is excluded, leaving [] when it was the only candidate', async () => {
    __setToolCacheEntryForTest({
      tool_id: 'weather.get_current',
      status: 'healthy',
      price_usd: 0.002,
      cache_ttl: 0,
      upstream_cost_usd: null,
      provider: 'openweathermap',
    });
    __setToolCacheEntryForTest({
      tool_id: 'weatherapi.current',
      status: 'unavailable',
      price_usd: 0.002,
      cache_ttl: 0,
      upstream_cost_usd: null,
      provider: 'weatherapi',
    });

    const alternatives = await getAlternativesForTool('weather.get_current');

    expect(alternatives).toEqual([]);
  });

  it('a real regional tool never gets a real global request as caller excluded by scope mismatch (global caller excludes regional candidate)', async () => {
    __setToolCacheEntryForTest({
      tool_id: 'finance.exchange_rates', // capability fx.latest, scope global
      status: 'healthy',
      price_usd: 0.002,
      cache_ttl: 0,
      upstream_cost_usd: null,
      provider: 'finance',
    });
    __setToolCacheEntryForTest({
      tool_id: 'bcb.usd_brl', // capability fx.latest, scope regional:BR
      status: 'healthy',
      price_usd: 0.001,
      cache_ttl: 0,
      upstream_cost_usd: null,
      provider: 'bcb',
    });

    const alternatives = await getAlternativesForTool('finance.exchange_rates');

    expect(alternatives.find((a) => a.tool_id === 'bcb.usd_brl')).toBeUndefined();
  });

  it('same_upstream_as is honored end-to-end on real tool_ids (finance.ecb_rates never suggests frankfurter.latest)', async () => {
    __setToolCacheEntryForTest({
      tool_id: 'finance.ecb_rates',
      status: 'healthy',
      price_usd: 0.002,
      cache_ttl: 0,
      upstream_cost_usd: null,
      provider: 'finance',
    });
    __setToolCacheEntryForTest({
      tool_id: 'frankfurter.latest',
      status: 'healthy',
      price_usd: 0.001,
      cache_ttl: 0,
      upstream_cost_usd: null,
      provider: 'frankfurter',
    });
    __setToolCacheEntryForTest({
      tool_id: 'exchangerate.latest',
      status: 'healthy',
      price_usd: 0.001,
      cache_ttl: 0,
      upstream_cost_usd: null,
      provider: 'exchangerate',
    });

    const alternatives = await getAlternativesForTool('finance.ecb_rates');

    expect(alternatives.map((a) => a.tool_id)).toEqual(['exchangerate.latest']);
  });

  it('returns [] for a real tool_id that has no declared capability', async () => {
    __setToolCacheEntryForTest({
      tool_id: 'crypto.get_price',
      status: 'healthy',
      price_usd: 0.001,
      cache_ttl: 0,
      upstream_cost_usd: null,
      provider: 'coingecko',
    });

    expect(await getAlternativesForTool('crypto.get_price')).toEqual([]);
  });
});
