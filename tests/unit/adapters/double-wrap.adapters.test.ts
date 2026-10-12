// T-0252-11: nine adapters used to return a whole ProviderRawResponse ({...raw, body}) from
// parseResponse(). BaseAdapter.call() assigns that return value straight into raw.body, so every
// field landed at raw.body.body.* (same defect api2pdf had, fixed in 98e9d792). Each adapter
// below must return the parsed body itself.
jest.mock('../../../src/services/redis.service', () => ({
  getSharedRedis: () => ({}),
}));

import { CloudflareAdapter } from '../../../src/adapters/cloudflare';
import { GleifAdapter } from '../../../src/adapters/gleif';
import { BlueskyAdapter } from '../../../src/adapters/bluesky';
import { IqairAdapter } from '../../../src/adapters/iqair';
import { EuropeanaAdapter } from '../../../src/adapters/europeana';
import { BrowserbaseAdapter } from '../../../src/adapters/browserbase';
import { VatcomplyAdapter } from '../../../src/adapters/vatcomply';
import { GeocodioAdapter } from '../../../src/adapters/geocodio';
import { HunterAdapter } from '../../../src/adapters/hunter';
import type { ProviderRawResponse, ProviderRequest } from '../../../src/types/provider';

function raw(body: unknown): ProviderRawResponse {
  return { status: 200, headers: {}, body, durationMs: 1, byteLength: 1 };
}
function req(toolId: string): ProviderRequest {
  return { toolId, params: {}, requestId: 'req_test' };
}

interface Case {
  name: string;
  adapter: { parseResponse(r: ProviderRawResponse, q: ProviderRequest): unknown };
  tool: string;
  upstream: unknown;
  key: string;
  errUpstream: unknown;
}

const cases: Case[] = [
  {
    name: 'cloudflare',
    adapter: new CloudflareAdapter('k', 'e@example.com'),
    tool: 'cloudflare.zones_list',
    upstream: { success: true, result: [{ id: 'z1', name: 'example.com' }], result_info: {} },
    key: 'zones',
    errUpstream: { success: false, errors: [{ message: 'bad', code: 1 }] },
  },
  {
    name: 'gleif',
    adapter: new GleifAdapter(),
    tool: 'lei.search',
    upstream: { data: [{ attributes: { lei: 'L1', entity: {}, registration: {} } }], meta: {} },
    key: 'entities',
    errUpstream: { errors: [{ detail: 'bad' }] },
  },
  {
    name: 'bluesky',
    adapter: new BlueskyAdapter('h', 'p'),
    tool: 'bluesky.search_posts',
    upstream: { posts: [{ uri: 'at://x' }] },
    key: 'posts',
    errUpstream: { error: 'Bad', message: 'bad' },
  },
  {
    name: 'iqair',
    adapter: new IqairAdapter('k'),
    tool: 'iqair.city',
    upstream: { status: 'success', data: { city: 'Paris', current: {} } },
    key: 'city',
    errUpstream: { status: 'fail', data: { message: 'bad' } },
  },
  {
    name: 'europeana',
    adapter: new EuropeanaAdapter('k'),
    tool: 'europeana.search',
    upstream: { success: true, items: [{ id: '/1/a' }], totalResults: 1, itemsCount: 1 },
    key: 'items',
    errUpstream: { success: false, error: 'bad' },
  },
  {
    name: 'browserbase',
    adapter: new BrowserbaseAdapter('k', 'p'),
    tool: 'browser.list_sessions',
    upstream: [{ id: 's1' }],
    key: 'sessions',
    errUpstream: { error: { message: 'bad' } },
  },
  {
    name: 'vatcomply',
    adapter: new VatcomplyAdapter(),
    tool: 'vatcomply.currencies',
    upstream: { EUR: { name: 'Euro' } },
    key: 'currencies',
    errUpstream: null,
  },
  {
    name: 'geocodio',
    adapter: new GeocodioAdapter('k'),
    tool: 'geocodio.geocode',
    upstream: { results: [{ formatted_address: 'a' }] },
    key: 'results',
    errUpstream: { error: 'bad' },
  },
  {
    name: 'hunter',
    adapter: new HunterAdapter('k'),
    tool: 'hunter.domain_search',
    upstream: { data: { domain: 'example.com', emails: [] }, meta: {} },
    key: 'domain',
    errUpstream: { errors: [{ details: 'bad' }] },
  },
];

describe.each(cases)('$name parseResponse is not double-wrapped', (c) => {
  it('returns the parsed body flat (no nested body/status/headers)', () => {
    const out = c.adapter.parseResponse(raw(c.upstream), req(c.tool)) as Record<string, unknown>;
    expect(out).toHaveProperty(c.key);
    expect(out.body).toBeUndefined();
    expect(out.headers).toBeUndefined();
    expect(out.byteLength).toBeUndefined();
  });

  if (c.errUpstream) {
    it('returns a flat { error } body on upstream error', () => {
      const out = c.adapter.parseResponse(raw(c.errUpstream), req(c.tool)) as Record<
        string,
        unknown
      >;
      expect(typeof out.error).toBe('string');
      expect(out.body).toBeUndefined();
    });
  }
});
