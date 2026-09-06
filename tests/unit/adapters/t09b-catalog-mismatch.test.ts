/**
 * T-09b (2026-09-06): the heartbeat bot's "20 tools return 502/503" finding
 * was NOT one shared defect — several of those tool_ids throw "Unsupported
 * tool: X" on every single call because the catalog (tool-definitions.ts)
 * and the adapter's own buildRequest/parseResponse switch disagree about the
 * toolId string. Each case here drives the REAL adapter through `.call()`
 * with a mocked `fetch`, proving the catalog's actual toolId now reaches a
 * real request/response instead of the switch's default throw — a unit test
 * asserting the switch case exists would not have caught the original bug
 * (both switches "existed", just under the wrong string).
 */
function createFakeRedis() {
  return {
    async del() {
      return 1;
    },
    async hmset() {
      return 'OK';
    },
    async expire() {
      return 1;
    },
    async setex() {
      return 'OK';
    },
  };
}

jest.mock('../../../src/services/redis.service', () => ({
  getSharedRedis: () => createFakeRedis(),
}));

import { CernOpenDataAdapter } from '../../../src/adapters/cernopendata';
import { ClinicalTrialsAdapter } from '../../../src/adapters/clinicaltrials';
import { HyperliquidAdapter } from '../../../src/adapters/hyperliquid';
import type { ProviderError } from '../../../src/types/provider';

function mockFetchResponse(body: unknown, status = 200) {
  const bodyBytes = new TextEncoder().encode(JSON.stringify(body));
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(bodyBytes);
        controller.close();
      },
    }),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  jest.restoreAllMocks();
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe('cernopendata adapter — catalog toolId now dispatches (T-09b)', () => {
  const adapter = new CernOpenDataAdapter();

  it.each([
    'cernopendata.search',
    'cernopendata.detail',
    'cernopendata.datasets',
    'cernopendata.glossary',
  ])('%s reaches a real request instead of "Unsupported tool"', async (toolId) => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(
        mockFetchResponse(
          toolId === 'cernopendata.detail'
            ? { id: '5209', metadata: {} }
            : { hits: { total: 0, hits: [] }, links: {} },
        ),
      );

    await expect(
      adapter.call({ toolId, params: { q: 'higgs', id: '5209', term: 'quark' }, requestId: 'r1' }),
    ).resolves.toBeDefined();
  });
});

describe('clinicaltrials adapter — clinical.* alias now dispatches (T-09b)', () => {
  const adapter = new ClinicalTrialsAdapter();

  it('clinical.search reaches a real request instead of "Unsupported tool"', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(mockFetchResponse({ studies: [], totalCount: 0 }));

    await expect(
      adapter.call({
        toolId: 'clinical.search',
        params: { condition: 'diabetes' },
        requestId: 'r1',
      }),
    ).resolves.toBeDefined();
  });

  it('clinical.stats reaches a real request instead of "Unsupported tool"', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(mockFetchResponse({ totalStudies: 1, averageSizeBytes: 2 }));

    await expect(
      adapter.call({ toolId: 'clinical.stats', params: {}, requestId: 'r1' }),
    ).resolves.toBeDefined();
  });

  it('clinical.study surfaces the SAME 422 input-validation error as clinicaltrials.study, with the correct toolId', async () => {
    await expect(
      adapter.call({
        toolId: 'clinical.study',
        params: { nct_id: 'not-an-nct-id' },
        requestId: 'r1',
      }),
    ).rejects.toMatchObject({ toolId: 'clinical.study', httpStatus: 422 });
  });
});

describe('hyperliquid adapter — malformed responses classify instead of raw-throwing (T-09b)', () => {
  const adapter = new HyperliquidAdapter();

  it('order_book with a null body throws a classified ProviderError, not a raw null-deref TypeError', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(mockFetchResponse(null));

    try {
      await adapter.call({
        toolId: 'hyperliquid.order_book',
        params: { coin: 'BTC' },
        requestId: 'r1',
      });
      fail('Expected ProviderError to be thrown');
    } catch (error) {
      const pe = error as ProviderError;
      expect(pe.message).not.toMatch(/Cannot read propert/i);
      expect(typeof pe.code).toBe('string');
      expect(typeof pe.httpStatus).toBe('number');
      expect(pe.provider).toBe('hyperliquid');
    }
  });

  it('klines with a non-array body throws a classified ProviderError', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(mockFetchResponse({ unexpected: 'shape' }));

    try {
      await adapter.call({
        toolId: 'hyperliquid.klines',
        params: { coin: 'BTC' },
        requestId: 'r1',
      });
      fail('Expected ProviderError to be thrown');
    } catch (error) {
      const pe = error as ProviderError;
      expect(typeof pe.code).toBe('string');
      expect(typeof pe.httpStatus).toBe('number');
      expect(pe.provider).toBe('hyperliquid');
    }
  });
});
