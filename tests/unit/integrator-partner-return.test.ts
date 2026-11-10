/** T-0728: partner registry and the Continue-on-partner button on /integrator/connect. */
import express from 'express';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createIntegratorRouter, loadPartners } from '../../src/shop/routes/integrator.router';

jest.mock('../../src/config', () => ({ config: {} }));

let server: ReturnType<express.Express['listen']>;
let base: string;
beforeAll(() => {
  const app = express();
  app.use(createIntegratorRouter({ limit: 10_000 }));
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());
const get = async (q: string) => (await fetch(`${base}/integrator/connect${q}`)).text();

describe('partner return', () => {
  it('from=soukbase renders the button from the registry, slug appended client-side only', async () => {
    const h = await get('?from=soukbase');
    expect(h.match(/Continue on Soukbase/g)).toHaveLength(1);
    expect(h).toContain('data-return="https://soukbase.com/sell/apibase/return"');
    expect(h).toContain('name="partner" value="soukbase"');
    expect(h).toContain("'?apibase_slug=' + encodeURIComponent(slug)");
    expect(h).not.toMatch(/apibase_slug=[^'"]*(api_key|wallet|email)/);
  });
  it('unknown or non-string from renders nothing extra and is not echoed', async () => {
    const plain = await get('');
    for (const q of ['?from=evil', '?from=%3Cx%3E', '?from[]=soukbase']) {
      const h = await get(q);
      expect(h).toBe(plain);
      expect(h).not.toContain('evil');
    }
    expect(plain).not.toContain('id="pt"');
    expect(plain).not.toContain('{{PARTNER}}');
  });
  it('keeps Vary and noindex', async () => {
    const r = await fetch(`${base}/integrator/connect?from=soukbase`);
    expect(r.headers.get('vary')).toMatch(/Accept/i);
    expect(await r.text()).toContain('noindex');
  });
  it('invalid partners.json fails', () => {
    const d = mkdtempSync(join(tmpdir(), 'pt-'));
    const w = (s: string) => {
      const f = join(d, 'p.json');
      writeFileSync(f, s);
      return f;
    };
    expect(() => loadPartners(w('{nope'))).toThrow();
    expect(() => loadPartners(w('{}'))).toThrow();
    expect(() => loadPartners(w('[{"id":"a"}]'))).toThrow();
    expect(() =>
      loadPartners(w('[{"id":"ab","name":"A","site":"http://a.io","return_url":"http://a.io/r"}]')),
    ).toThrow();
  });
});
