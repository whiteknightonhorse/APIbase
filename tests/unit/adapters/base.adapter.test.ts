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

  return new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(bodyBytes);
      controller.close();
    },
  }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

beforeEach(() => {
  jest.restoreAllMocks();
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
    globalThis.fetch = jest.fn().mockResolvedValue(
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
    globalThis.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse({ error: 'internal' }, 500),
    );

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

  it('throws INVALID_RESPONSE on 4xx client error without retry', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse({ error: 'bad request' }, 400),
    );

    try {
      await adapter.call(makeRequest());
      fail('Expected ProviderError to be thrown');
    } catch (error) {
      const pe = error as ProviderError;
      expect(pe.code).toBe(ProviderErrorCode.INVALID_RESPONSE);
      expect(pe.httpStatus).toBe(502);
      // 4xx is not retryable — only 1 attempt
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    }
  });

  it('throws INVALID_RESPONSE on invalid JSON', async () => {
    const bodyBytes = new TextEncoder().encode('not json');
    globalThis.fetch = jest.fn().mockResolvedValue(
      new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(bodyBytes);
          controller.close();
        },
      }), { status: 200 }),
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
      new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(bodyBytes);
          controller.close();
        },
      }), { status: 200 }),
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
