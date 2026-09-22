/**
 * T-0207 (ZZ-03-07, 03-SPECIFICATION.md R-2, Q2 ruling-1 variant D): capability-registry.service
 * parses the REAL config/tool_provider_config.yaml (no mock) — this pins that the 16 measured
 * capability groups from the live 2026-09-14 measurement (Q2 ruling-1 поправка 1) are actually
 * declared in the YAML, not just described in a doc.
 */
import {
  getCapabilityEntry,
  getSameUpstreamSet,
  getToolIdsForCapability,
  getAllCapabilities,
} from '../../src/services/capability-registry.service';

// The 16 groups Q2 ruling-1 measured live: weather forecast, current weather, FX latest,
// earthquakes, air quality, holidays, elevation point, postal lookup, DOI lookup, web search,
// IP geolocation, job search, PDF, screenshot, forward/reverse geocode.
const EXPECTED_CAPABILITIES = [
  'weather.current',
  'weather.forecast',
  'fx.latest',
  'geo.earthquakes',
  'air_quality',
  'holidays.public',
  'geo.elevation',
  'geo.postal_lookup',
  'research.doi_lookup',
  'search.web',
  'geo.ip_lookup',
  'jobs.search',
  'document.pdf_generate',
  'web.screenshot',
  'geo.geocode_forward',
  'geo.geocode_reverse',
];

describe('capability-registry.service — real YAML data', () => {
  it('declares all 16 measured capability groups', () => {
    const found = getAllCapabilities();
    for (const cap of EXPECTED_CAPABILITIES) {
      expect(found).toContain(cap);
    }
    expect(EXPECTED_CAPABILITIES).toHaveLength(16);
  });

  it('every declared capability group has at least 2 member tool_ids', () => {
    for (const cap of EXPECTED_CAPABILITIES) {
      const members = getToolIdsForCapability(cap);
      expect(members.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('a real global tool_id resolves to capability + scope: global', () => {
    const entry = getCapabilityEntry('weather.get_current');
    expect(entry?.capability).toBe('weather.current');
    expect(entry?.scope).toBe('global');
  });

  it('a real regional tool_id resolves to its region, not global', () => {
    const entry = getCapabilityEntry('bcb.usd_brl');
    expect(entry?.capability).toBe('fx.latest');
    expect(entry?.scope).toBe('regional:BR');
  });

  it('a tool_id with no declared capability returns capability: null, scope: null', () => {
    // Chosen because it exists in the yaml but is not one of the ~95 tools this task
    // annotated — a real "not in a capability group" case, not a made-up id.
    const entry = getCapabilityEntry('crypto.get_price');
    expect(entry).toBeDefined();
    expect(entry?.capability).toBeNull();
    expect(entry?.scope).toBeNull();
  });

  it('an unknown tool_id (not in the yaml at all) returns undefined', () => {
    expect(getCapabilityEntry('does.not_exist_anywhere')).toBeUndefined();
  });

  describe('same_upstream_as symmetric closure (finance.ecb_rates <-> frankfurter.*)', () => {
    it('is declared on finance.ecb_rates', () => {
      const set = getSameUpstreamSet('finance.ecb_rates');
      expect(set.has('frankfurter.latest')).toBe(true);
      expect(set.has('frankfurter.historical')).toBe(true);
    });

    it('applies in reverse even though only declared on one side', () => {
      const set = getSameUpstreamSet('frankfurter.latest');
      expect(set.has('finance.ecb_rates')).toBe(true);
    });

    it('does not leak to an unrelated tool_id in the same capability group', () => {
      const set = getSameUpstreamSet('exchangerate.latest');
      expect(set.size).toBe(0);
    });
  });
});
