// T-0480: fetchOutcome takes the https.request path whenever the provider has
// a `tls` block in provider-limits.json, and plain fetch otherwise.
jest.mock('../../src/config/provider-limits.json', () => ({
  tls_provider: { tls: { max_version: 'TLSv1.2' } },
  plain_provider: {},
}));
jest.mock('../../src/services/redis.service', () => ({ getSharedRedis: () => ({}) }));

import https from 'https';
import { fetchOutcome } from '../../src/jobs/provider-health.job';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('fetchOutcome TLS routing (T-0480)', () => {
  it('uses https.request with the tls agent for a provider with a tls block', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock;
    const reqSpy = jest.spyOn(https, 'request').mockImplementation(((
      _url: unknown,
      _opts: unknown,
      cb: (res: unknown) => void,
    ) => {
      const handlers: Record<string, () => void> = {};
      const res = {
        statusCode: 200,
        on: (ev: string, fn: () => void) => {
          handlers[ev] = fn;
        },
        pause: () => undefined,
      };
      return {
        on: () => undefined,
        end: () => {
          cb(res);
          handlers.end?.();
        },
        destroy: () => undefined,
      };
    }) as never);
    const out = await fetchOutcome('https://example.test/x', 'HEAD', {}, 1000, 'tls_provider');
    expect(out.httpStatus).toBe(200);
    expect(reqSpy).toHaveBeenCalledTimes(1);
    const opts = reqSpy.mock.calls[0][1] as { agent?: { options?: { maxVersion?: string } } };
    expect(opts.agent?.options?.maxVersion).toBe('TLSv1.2');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses fetch for a provider without a tls block', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ status: 200, body: null });
    globalThis.fetch = fetchMock;
    const reqSpy = jest.spyOn(https, 'request');
    await fetchOutcome('https://example.test/x', 'HEAD', {}, 1000, 'plain_provider');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(reqSpy).not.toHaveBeenCalled();
  });
});
