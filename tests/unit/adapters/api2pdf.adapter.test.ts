// T-11 (2026-09-05) / Fable ruling-5 REJECT: Api2PdfAdapter.parseResponse()
// used to return `{...raw, body: {...}}`, which BaseAdapter.call() assigns
// straight into `raw.body` (base.adapter.ts: `raw.body =
// this.parseResponse(raw, req)`). That landed the parsed fields one level
// too deep at `raw.body.body.*` instead of `raw.body.*` — so
// provider-call.stage.ts's `raw.body.cost_usd` read (ruling-1 C.1) always
// saw `undefined` and `execution_ledger.upstream_cost_usd` stayed NULL for
// every real pdf.* call. This test drives the real adapter through a mocked
// fetch (not a hand-built `raw` object) so a regression of the nesting bug
// fails here instead of only showing up as a silently-NULL ledger column in
// production.
jest.mock('../../../src/config/provider-limits.json', () => ({
  api2pdf: { limit_type: 'paid', paid_balance: true },
}));

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

import { Api2PdfAdapter } from '../../../src/adapters/api2pdf';
import type { ProviderRequest } from '../../../src/types/provider';

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

function makeRequest(overrides?: Partial<ProviderRequest>): ProviderRequest {
  return {
    toolId: 'pdf.from_url',
    params: { url: 'https://example.com/report' },
    requestId: 'req_test',
    ...overrides,
  };
}

describe('Api2PdfAdapter.parseResponse (real adapter.call() path)', () => {
  const adapter = new Api2PdfAdapter('fake-key');

  it('surfaces cost_usd, pdf_url etc. FLAT at raw.body — not nested under raw.body.body', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse({
        success: true,
        pdf: 'https://cdn.api2pdf.com/out.pdf',
        mbOut: 0.42,
        cost: 0.00058256,
        responseId: 'resp_123',
      }),
    );

    const raw = await adapter.call(makeRequest());

    // This is the exact duck-typed read provider-call.stage.ts does.
    const body = raw.body as Record<string, unknown>;
    expect(typeof body.cost_usd).toBe('number');
    expect(body.cost_usd).toBeCloseTo(0.00058256);
    expect(body.pdf_url).toBe('https://cdn.api2pdf.com/out.pdf');
    expect(body.file_size_mb).toBe(0.42);
    expect(body.response_id).toBe('resp_123');

    // The regression this test guards: body must NOT be double-wrapped.
    expect(body.body).toBeUndefined();
    expect(body.status).toBeUndefined();
  });

  it('surfaces a flat error body when the provider reports success: false', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(mockFetchResponse({ success: false, error: 'invalid html' }));

    const raw = await adapter.call(makeRequest());
    const body = raw.body as Record<string, unknown>;
    expect(body).toEqual({ error: 'invalid html' });
  });
});
