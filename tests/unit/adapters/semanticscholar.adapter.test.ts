jest.mock('../../../src/config/provider-limits.json', () => ({
  semanticscholar: { limit_type: 'unlimited' },
}));

const fakeRedis = {
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
  async get() {
    return null;
  },
  async set() {
    return 'OK';
  },
};
jest.mock('../../../src/services/redis.service', () => ({
  getSharedRedis: () => fakeRedis,
}));

import { SemanticScholarAdapter } from '../../../src/adapters/semanticscholar';
import {
  ProviderErrorCode,
  PROVIDER_MAX_RETRIES,
  type ProviderRequest,
} from '../../../src/types/provider';

const originalFetch = globalThis.fetch;
afterAll(() => {
  globalThis.fetch = originalFetch;
});

function res(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const SEARCH_BODY = { total: 1, data: [{ paperId: 'p1', title: 'T', citationCount: 3 }] };

const REQS: ProviderRequest[] = [
  {
    toolId: 'semanticscholar.papers_search',
    params: { query: 'graph neural networks' },
    requestId: 'r1',
  },
  {
    toolId: 'semanticscholar.authors_search',
    params: { query: 'Hinton' },
    requestId: 'r2',
  },
  {
    toolId: 'semanticscholar.get_paper',
    params: { paper_id: '10.1038/nature14539' },
    requestId: 'r3',
  },
];

function req(i = 0): ProviderRequest {
  return REQS[i];
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-04T00:00:00Z'));
});
afterEach(() => {
  jest.useRealTimers();
});

/** Drive fake timers until the promise settles. */
async function settle<T>(p: Promise<T>): Promise<T> {
  let done = false;
  let value!: T;
  let err: unknown;
  let failed = false;
  p.then(
    (v) => {
      done = true;
      value = v;
    },
    (e) => {
      done = true;
      failed = true;
      err = e;
    },
  );
  for (let i = 0; i < 200 && !done; i++) {
    await jest.advanceTimersByTimeAsync(250);
  }
  if (!done) throw new Error('promise did not settle');
  if (failed) throw err;
  return value;
}

describe('SemanticScholarAdapter api key', () => {
  it.each([0, 1, 2])(
    'sends x-api-key header (tool %i) and never puts the key in the URL',
    async (i) => {
      const fetchMock = jest.fn().mockImplementation(async () => res(SEARCH_BODY));
      globalThis.fetch = fetchMock;
      const adapter = new SemanticScholarAdapter('k1');
      await settle(adapter.call(req(i)));
      const [url, init] = fetchMock.mock.calls[0];
      expect((init as RequestInit).headers).toMatchObject({ 'x-api-key': 'k1' });
      expect(String(url)).not.toContain('k1');
    },
  );

  it('sends no x-api-key header with an empty key', async () => {
    const fetchMock = jest.fn().mockImplementation(async () => res(SEARCH_BODY));
    globalThis.fetch = fetchMock;
    const adapter = new SemanticScholarAdapter('');
    await settle(adapter.call(req(0)));
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers['x-api-key']).toBeUndefined();
    expect(Object.keys(headers)).not.toContain('x-api-key');
  });
});

describe('SemanticScholarAdapter 1 req/s gate and 429 backoff', () => {
  it('starts the second sequential fetch at least 1100 ms after the first', async () => {
    const starts: number[] = [];
    globalThis.fetch = jest.fn().mockImplementation(async () => {
      starts.push(Date.now());
      return res(SEARCH_BODY);
    });
    const adapter = new SemanticScholarAdapter('k1');
    await settle(adapter.call(req(0)));
    await settle(adapter.call(req(0)));
    expect(starts).toHaveLength(2);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(1100);
  });

  it('retries once after 1000 ms on 429 then returns the parsed result', async () => {
    const starts: number[] = [];
    const fetchMock = jest.fn().mockImplementation(async () => {
      starts.push(Date.now());
      return starts.length === 1 ? res({ message: 'slow down' }, 429) : res(SEARCH_BODY);
    });
    globalThis.fetch = fetchMock;
    const adapter = new SemanticScholarAdapter('k1');
    const out = await settle(adapter.call(req(0)));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(1000);
    expect(out.status).toBe(200);
    expect(
      (
        adapter as unknown as { parseResponse(r: unknown, q: ProviderRequest): unknown }
      ).parseResponse(out, req(0)),
    ).toMatchObject({ total: 1 });
  });

  it('throws provider_rate_limit after three 429s with exactly 3 fetches', async () => {
    const fetchMock = jest.fn().mockImplementation(async () => res({ message: 'x' }, 429));
    globalThis.fetch = fetchMock;
    const adapter = new SemanticScholarAdapter('k1');
    await expect(settle(adapter.call(req(0)))).rejects.toMatchObject({
      code: ProviderErrorCode.RATE_LIMIT,
      httpStatus: 429,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(ProviderErrorCode.RATE_LIMIT).toBe('provider_rate_limit');
  });

  it('rejects overflow callers from the local queue before any fetch for them', async () => {
    const fetchMock = jest.fn().mockImplementation(async () => res(SEARCH_BODY));
    globalThis.fetch = fetchMock;
    const adapter = new SemanticScholarAdapter('k1');
    const results = Promise.allSettled(Array.from({ length: 7 }, () => adapter.call(req(0))));
    await jest.advanceTimersByTimeAsync(20000);
    const settled = await results;
    const rejected = settled.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(rejected.length).toBeGreaterThanOrEqual(1);
    expect(rejected[0].reason).toMatchObject({ code: ProviderErrorCode.RATE_LIMIT });
    expect(fetchMock.mock.calls.length).toBeLessThan(7);
  });

  it('does not retry a 500 in the override (no extra backoff, one fetch per call())', async () => {
    const fetchMock = jest.fn().mockImplementation(async () => res({ message: 'boom' }, 500));
    globalThis.fetch = fetchMock;
    const adapter = new SemanticScholarAdapter('k1');
    await expect(settle(adapter.call(req(0)))).rejects.toMatchObject({ httpStatus: 502 });
    // Only base's own retry path ran: the override would multiply this by 3 if it retried a 500.
    expect(fetchMock).toHaveBeenCalledTimes(PROVIDER_MAX_RETRIES + 1);
  });
});
