/**
 * T-0272: seed-demo-merchant emits the one-time api_key right after accept_terms and can resume
 * catalog/webhooks/check with an existing key.
 */
import { submit, resume, DEMO_CATALOG, type FetchFn } from '../../scripts/shop/seed-demo-merchant';

const WALLET = '0x' + '1'.repeat(40);
const sigs = {
  wallet: WALLET,
  register: { message: 'm1', signature: '0xaa' },
  accept_terms: { message: 'doc v1 sha256:abc', signature: '0xbb' },
  encryption_key: { signature: '0xcc' },
};

const json = (status: number, body: unknown) =>
  ({ status, text: async () => JSON.stringify(body) }) as unknown as Response;

function mockFetch(failCatalog: boolean, calls: string[]): FetchFn {
  return (async (url: string, init: { method: string }) => {
    const path = new URL(url).pathname;
    calls.push(`${init.method} ${path}`);
    if (path.endsWith('/merchants')) {
      return json(200, {
        merchant_id: 'mid-1',
        docs_to_accept: [{ doc_id: 'doc', version: '1', sha256: 'abc' }],
      });
    }
    if (path.endsWith('/acceptances')) return json(200, { api_key: 'mk_live_test' });
    if (path.endsWith('/catalog')) {
      return failCatalog
        ? json(500, { error_code: 'boom' })
        : json(200, { upserted: DEMO_CATALOG.length });
    }
    return json(200, { ok: true });
  }) as unknown as FetchFn;
}

const opts = {
  baseUrl: 'http://x.test',
  signatures: sigs,
  payoutBase: WALLET,
  payoutTempo: WALLET,
};

describe('seed-demo-merchant resume', () => {
  it('reports the key before the catalog and flags a late failure', async () => {
    const calls: string[] = [];
    const seen: string[] = [];
    await expect(
      submit(
        { ...opts, onAcceptTerms: (r) => seen.push(`${r.api_key}@${calls.length}`) },
        mockFetch(true, calls),
      ),
    ).rejects.toThrow(/api_key already written to stdout/);
    expect(seen).toEqual(['mk_live_test@2']);
    expect(calls[calls.length - 1]).toBe('PUT /api/v1/shop/merchants/me/catalog');
  });

  it('resume runs catalog and check with the given key, no register/accept', async () => {
    const calls: string[] = [];
    const r = await resume(
      { baseUrl: 'http://x.test', apiKey: 'mk_live_test' },
      mockFetch(false, calls),
    );
    expect(r.api_key).toBe('mk_live_test');
    expect(calls).toEqual([
      'PUT /api/v1/shop/merchants/me/catalog',
      'GET /api/v1/shop/merchants/me/check',
    ]);
  });
});
