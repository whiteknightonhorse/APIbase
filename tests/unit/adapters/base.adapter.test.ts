// F1/C-6: BaseAdapter caps retries to 0 for any provider not confirmed free
// in provider-limits.json (see base.adapter.ts isConfirmedFreeUpstream()).
// The retry-MECHANISM tests below (backoff, attempt counts) are about that
// mechanism, not the C-6 policy, so \"test_provider\" is mocked in as
// confirmed-free here; the policy itself gets its own describe block further
// down using a provider deliberately absent from this mock.
jest.mock('../../../src/config/provider-limits.json', () => ({
  test_provider: { limit_type: 'unlimited' },
}));

// AP-2: minimal fake Redis so base.adapter.ts's header-capture / asap-flag
// writes (getSharedRedis()) never touch a real connection in tests. Records
// every call so tests can assert on what got written, per key.
function createFakeRedis() {
  const hashes = new Map<string, Record<string, string>>();
  const strings = new Map<string, string>();
  const expirations = new Map<string, number>();
  return {
    hashes,
    strings,
    expirations,
    async del(key: string) {
      hashes.delete(key);
      strings.delete(key);
      return 1;
    },
    async hmset(key: string, fields: Record<string, string>) {
      hashes.set(key, { ...(hashes.get(key) ?? {}), ...fields });
      return 'OK';
    },
    async expire(key: string, seconds: number) {
      expirations.set(key, seconds);
      return 1;
    },
    async setex(key: string, seconds: number, value: string) {
      strings.set(key, value);
      expirations.set(key, seconds);
      return 'OK';
    },
  };
}

let fakeRedis = createFakeRedis();
jest.mock('../../../src/services/redis.service', () => ({
  getSharedRedis: () => fakeRedis,
}));

import { BaseAdapter } from '../../../src/adapters/base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  type ProviderError,
  ProviderErrorCode,
} from '../../../src/types/provider';

// ---------------------------------------------------------------------------
// Test adapter — minimal concrete subclass
// ---------------------------------------------------------------------------

class TestAdapter extends BaseAdapter {
  protected buildRequest(req: ProviderRequest) {
    return {
      url: `${this.baseUrl}/test`,
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    };
  }

  protected parseResponse(raw: ProviderRawResponse) {
    return raw.body;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(overrides?: Partial<ProviderRequest>): ProviderRequest {
  return {
    toolId: 'test.tool',
    params: {},
    requestId: 'req_test',
    ...overrides,
  };
}

function mockFetchResponse(body: unknown, status = 200, headers?: Record<string, string>) {
  const bodyText = JSON.stringify(body);
  const bodyBytes = new TextEncoder().encode(bodyText);

  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(bodyBytes);
        controller.close();
      },
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

beforeEach(() => {
  jest.restoreAllMocks();
  fakeRedis = createFakeRedis();
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe('BaseAdapter', () => {
  const adapter = new TestAdapter({
    provider: 'test_provider',
    baseUrl: 'https://api.test.com',
    timeoutMs: 500,
    maxRetries: 2,
    maxResponseBytes: 1024,
  });

  it('returns parsed response on success', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(mockFetchResponse({ result: 'ok' }));

    const result = await adapter.call(makeRequest());

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ result: 'ok' });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('throws TIMEOUT error when request times out', async () => {
    globalThis.fetch = jest.fn().mockImplementation(() => {
      const error = new DOMException('The operation was aborted', 'AbortError');
      return Promise.reject(error);
    });

    try {
      await adapter.call(makeRequest());
      fail('Expected ProviderError to be thrown');
    } catch (error) {
      const pe = error as ProviderError;
      expect(pe.code).toBe(ProviderErrorCode.TIMEOUT);
      expect(pe.httpStatus).toBe(504);
      expect(pe.provider).toBe('test_provider');
      // Timeout is retryable, so 3 total attempts
      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    }
  });

  it('throws UNAVAILABLE on connection error and retries', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    try {
      await adapter.call(makeRequest());
      fail('Expected ProviderError to be thrown');
    } catch (error) {
      const pe = error as ProviderError;
      expect(pe.code).toBe(ProviderErrorCode.UNAVAILABLE);
      expect(pe.httpStatus).toBe(502);
      // Connection error is retryable, so 3 total attempts
      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    }
  });

  it('throws RATE_LIMIT on 429 and does not retry', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(
        mockFetchResponse({ error: 'rate limited' }, 429, { 'Retry-After': '30' }),
      );

    try {
      await adapter.call(makeRequest());
      fail('Expected ProviderError to be thrown');
    } catch (error) {
      const pe = error as ProviderError;
      expect(pe.code).toBe(ProviderErrorCode.RATE_LIMIT);
      expect(pe.httpStatus).toBe(429);
      expect(pe.retryAfter).toBe(30);
      // 429 is not retryable — only 1 attempt
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    }
  });

  it('throws UNAVAILABLE on 5xx and retries', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(mockFetchResponse({ error: 'internal' }, 500));

    try {
      await adapter.call(makeRequest());
      fail('Expected ProviderError to be thrown');
    } catch (error) {
      const pe = error as ProviderError;
      expect(pe.code).toBe(ProviderErrorCode.UNAVAILABLE);
      expect(pe.httpStatus).toBe(502);
      // 5xx is retryable via UNAVAILABLE code
      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    }
  });

  it.each([400, 404, 409, 422])(
    'throws INPUT_REJECTED (HTTP 422) on upstream %s without retry',
    async (status) => {
      globalThis.fetch = jest
        .fn()
        .mockResolvedValue(mockFetchResponse({ error: 'bad request' }, status));

      try {
        await adapter.call(makeRequest());
        fail('Expected ProviderError to be thrown');
      } catch (error) {
        const pe = error as ProviderError;
        // Caller-input errors surface as 422, distinct from provider failures.
        expect(pe.code).toBe(ProviderErrorCode.INPUT_REJECTED);
        expect(pe.httpStatus).toBe(422);
        // Not retryable — only 1 attempt
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      }
    },
  );

  it.each([401, 402, 403])(
    'throws PROVIDER_AUTH (HTTP 503) on upstream %s without retry',
    async (status) => {
      globalThis.fetch = jest
        .fn()
        .mockResolvedValue(mockFetchResponse({ error: 'access denied' }, status));

      try {
        await adapter.call(makeRequest());
        fail('Expected ProviderError to be thrown');
      } catch (error) {
        const pe = error as ProviderError;
        // Our-credential/account failure — not the caller's fault.
        expect(pe.code).toBe(ProviderErrorCode.PROVIDER_AUTH);
        expect(pe.httpStatus).toBe(503);
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      }
    },
  );

  it('throws INVALID_RESPONSE on invalid JSON', async () => {
    const bodyBytes = new TextEncoder().encode('not json');
    globalThis.fetch = jest.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(bodyBytes);
            controller.close();
          },
        }),
        { status: 200 },
      ),
    );

    try {
      await adapter.call(makeRequest());
      fail('Expected ProviderError to be thrown');
    } catch (error) {
      const pe = error as ProviderError;
      expect(pe.code).toBe(ProviderErrorCode.INVALID_RESPONSE);
      expect(pe.message).toBe('Provider returned invalid JSON');
    }
  });

  it('throws RESPONSE_TOO_LARGE when body exceeds limit', async () => {
    // Adapter maxResponseBytes = 1024, send 2000 bytes
    const bigBody = 'x'.repeat(2000);
    const bodyBytes = new TextEncoder().encode(bigBody);
    globalThis.fetch = jest.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(bodyBytes);
            controller.close();
          },
        }),
        { status: 200 },
      ),
    );

    try {
      await adapter.call(makeRequest());
      fail('Expected ProviderError to be thrown');
    } catch (error) {
      const pe = error as ProviderError;
      expect(pe.code).toBe(ProviderErrorCode.RESPONSE_TOO_LARGE);
      expect(pe.httpStatus).toBe(502);
    }
  });

  it('retries on 5xx then succeeds on next attempt', async () => {
    let callCount = 0;
    globalThis.fetch = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(mockFetchResponse({ error: 'internal' }, 500));
      }
      return Promise.resolve(mockFetchResponse({ result: 'ok' }));
    });

    const result = await adapter.call(makeRequest());
    expect(result.body).toEqual({ result: 'ok' });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('includes provider and toolId in all errors', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('fail'));

    try {
      await adapter.call(makeRequest({ toolId: 'weather.get_current' }));
      fail('Expected ProviderError');
    } catch (error) {
      const pe = error as ProviderError;
      expect(pe.provider).toBe('test_provider');
      expect(pe.toolId).toBe('weather.get_current');
    }
  });
});

// ---------------------------------------------------------------------------
// F1/C-6 — retries capped to 0 for any provider not confirmed free
// ---------------------------------------------------------------------------

describe('BaseAdapter retry cap (F1/C-6)', () => {
  const freeAdapter = new TestAdapter({
    provider: 'test_provider', // mocked as unlimited at the top of this file
    baseUrl: 'https://api.test.com',
    timeoutMs: 500,
    maxRetries: 2,
  });

  it('does NOT retry a paid/unclassified provider even if configured with maxRetries > 0', async () => {
    // 'test_provider_paid' is deliberately absent from the jest.mock above —
    // isConfirmedFreeUpstream() must treat \"missing from provider-limits.json\"
    // as paid, the conservative direction (assuming free is what costs money
    // if wrong).
    const paidAdapter = new TestAdapter({
      provider: 'test_provider_paid',
      baseUrl: 'https://api.test.com',
      timeoutMs: 500,
      maxRetries: 2,
    });
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('connection reset'));

    try {
      await paidAdapter.call(makeRequest());
      fail('Expected ProviderError');
    } catch (error) {
      const pe = error as ProviderError;
      expect(pe.code).toBe(ProviderErrorCode.UNAVAILABLE);
      // One attempt only — a retry here would be a second billed call to a
      // paid upstream while the client paid us exactly once.
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    }
  });

  it('still retries a confirmed-free provider (regression check against the mock above)', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('connection reset'));

    try {
      await freeAdapter.call(makeRequest());
      fail('Expected ProviderError');
    } catch (error) {
      expect(globalThis.fetch).toHaveBeenCalledTimes(3); // 1 + 2 configured retries
    }
  });
});

// ---------------------------------------------------------------------------
// AP-2 — signal capture: upstream rate-limit headers + asap-probe flag
// ---------------------------------------------------------------------------

describe('BaseAdapter signal capture (AP-2)', () => {
  const rlKey = 'provider:upstream_rl:test_provider';
  const asapKey = 'probe:asap:test_provider';

  const adapter = new TestAdapter({
    provider: 'test_provider', // mocked as unlimited at the top of this file
    baseUrl: 'https://api.test.com',
    timeoutMs: 500,
    maxRetries: 2,
  });

  it('captures upstream rate-limit headers into Redis on a normal success', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(
        mockFetchResponse({ result: 'ok' }, 200, {
          'X-RateLimit-Limit': '100',
          'X-RateLimit-Remaining': '7',
          'X-RateLimit-Reset': '1700000000',
        }),
      );

    await adapter.call(makeRequest());

    expect(fakeRedis.hashes.get(rlKey)).toEqual(
      expect.objectContaining({ limit: '100', remaining: '7', reset: '1700000000' }),
    );
    expect(fakeRedis.expirations.get(rlKey)).toBe(6 * 60 * 60);
  });

  it('does not touch Redis when the response carries no rate-limit-shaped headers', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(mockFetchResponse({ result: 'ok' }));

    await adapter.call(makeRequest());

    expect(fakeRedis.hashes.has(rlKey)).toBe(false);
  });

  it('captures Retry-After from a 429 even though the call itself throws', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(
        mockFetchResponse({ error: 'rate limited' }, 429, { 'Retry-After': '30' }),
      );

    await expect(adapter.call(makeRequest())).rejects.toMatchObject({
      code: ProviderErrorCode.RATE_LIMIT,
    });

    expect(fakeRedis.hashes.get(rlKey)).toEqual(expect.objectContaining({ retry_after: '30' }));
  });

  it('flags probe:asap:{provider} (SETEX 600) when a ProviderError is thrown', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('connection reset'));

    await expect(adapter.call(makeRequest())).rejects.toMatchObject({
      code: ProviderErrorCode.UNAVAILABLE,
    });

    expect(fakeRedis.strings.get(asapKey)).toBe('1');
    expect(fakeRedis.expirations.get(asapKey)).toBe(600);
  });

  it('flags the asap probe exactly once even after multiple retries', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('connection reset'));
    const setexSpy = jest.spyOn(fakeRedis, 'setex');

    await expect(adapter.call(makeRequest())).rejects.toBeDefined();

    // 3 total attempts (1 + 2 retries) but the asap flag is set once by the
    // call() wrapper, not once per retry inside callInternal().
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    expect(setexSpy).toHaveBeenCalledTimes(1);
  });

  it('does NOT flag an asap probe on success', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(mockFetchResponse({ result: 'ok' }));

    await adapter.call(makeRequest());

    expect(fakeRedis.strings.has(asapKey)).toBe(false);
  });

  it('does not fail the provider call when Redis itself is down', async () => {
    fakeRedis.hmset = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    fakeRedis.setex = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(
        mockFetchResponse({ result: 'ok' }, 200, { 'X-RateLimit-Remaining': '1' }),
      );

    // Must resolve normally — a Redis outage is never allowed to surface as
    // a provider-call failure (best-effort signal capture).
    const result = await adapter.call(makeRequest());
    expect(result.body).toEqual({ result: 'ok' });
  });
});
