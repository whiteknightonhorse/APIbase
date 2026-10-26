/** T-0535: every static/integrator/**.md is reachable by path; /legal renders HTML for browsers. */
import express from 'express';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createIntegratorRouter } from '../../src/shop/routes/integrator.router';
import { createLegalRouter } from '../../src/shop/routes/legal.router';

jest.mock('../../src/config', () => ({ config: {} }));

const DIR = join(__dirname, '../../static/integrator');
const serve = (router: express.Router) => {
  const app = express();
  app.use(router);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, close: () => new Promise((r) => server.close(r)) };
};

describe('T-0535 integrator .md path twins', () => {
  const files = [
    ...readdirSync(DIR)
      .filter((f) => f.endsWith('.md'))
      .map((f) => f),
    ...readdirSync(join(DIR, 'platforms'))
      .filter((f) => f.endsWith('.md'))
      .map((f) => `platforms/${f}`),
  ];

  it('walks twelve files', () => expect(files).toHaveLength(12));

  it.each(files)('/integrator/%s is served as Markdown with a canonical Link', async (f) => {
    const s = serve(createIntegratorRouter({ limit: 1000 }));
    const r = await fetch(`${s.base}/integrator/${f}`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    expect(r.headers.get('link')).toMatch(/rel="canonical"/);
    expect((await r.text()).startsWith('#')).toBe(true);
    await s.close();
  });

  it('/integrator.md aliases /integrator/index.md and equals the Accept form of /integrator', async () => {
    const s = serve(createIntegratorRouter({ limit: 1000 }));
    const a = await (await fetch(`${s.base}/integrator.md`)).text();
    const b = await (await fetch(`${s.base}/integrator/index.md`)).text();
    const c = await (
      await fetch(`${s.base}/integrator`, { headers: { accept: 'text/markdown' } })
    ).text();
    expect(a).toBe(b);
    expect(a).toBe(c);
    await s.close();
  });

  it('unknown platform .md is still 404', async () => {
    const s = serve(createIntegratorRouter({ limit: 1000 }));
    expect((await fetch(`${s.base}/integrator/platforms/nope.md`)).status).toBe(404);
    await s.close();
  });
});

describe('T-0535 GET /legal for browsers', () => {
  const db = {
    $queryRawUnsafe: async () => [
      {
        doc_id: 'aup',
        version: '1.0',
        sha256: 'a'.repeat(64),
        url: '/legal/aup',
        effective_from: '2026-10-01T00:00:00.000Z',
      },
    ],
  };
  it('Accept text/html renders one h1; JSON and index.json are unchanged', async () => {
    const s = serve(createLegalRouter({ db: db as never }));
    const h = await fetch(`${s.base}/legal`, { headers: { accept: 'text/html' } });
    const html = await h.text();
    expect(h.headers.get('content-type')).toMatch(/text\/html/);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('Legal documents');
    expect(html).toContain('href="/legal/aup.md"');
    expect(html).toContain('a'.repeat(64));
    const j = await fetch(`${s.base}/legal`, { headers: { accept: 'application/json' } });
    expect(Array.isArray(await j.json())).toBe(true);
    const ij = await fetch(`${s.base}/legal/index.json`, { headers: { accept: 'text/html' } });
    expect(Array.isArray(await ij.json())).toBe(true);
    await s.close();
  });
});
