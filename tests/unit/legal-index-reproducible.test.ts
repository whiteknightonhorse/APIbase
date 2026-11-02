import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { createLegalRouter } from '../../src/shop/routes/legal.router';
import { LEGAL_DOC_IDS, latestLegalRows } from '../../src/shop/legal/legal-docs';
import { diskRows, fixtureDb } from './helpers/legal-fixture-db';

jest.mock('../../src/config', () => ({ config: {} }));

const NOW = Date.parse('2026-11-02T00:00:00Z');
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

// v1 = the files on disk, effective; v2 = a scheduled version with different bytes.
const v1 = diskRows().map((r) => ({
  ...r,
  version: '1.0',
  effective_from: '2026-10-01T00:00:00.000Z',
}));
const v2 = v1.map((r) => ({
  ...r,
  version: '2.0',
  effective_from: '2026-12-01T00:00:00.000Z',
  body_md:
    r.body_md.replace(
      /^<!--.*-->/,
      '<!-- version: 2.0; effective_from: 2026-12-01; status: t -->',
    ) + '\nV2 TEXT {{INTEGRATOR_FEE_PCT}}\n',
}));

async function serve() {
  const app = express();
  app.use(createLegalRouter({ db: fixtureDb([...v1, ...v2]), now: () => NOW }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, close: () => new Promise((r) => server.close(r)) };
}

type Entry = {
  doc_id: string;
  version?: string;
  sha256: string;
  hash_of: string;
  source_url: string;
};
const bytes = async (url: string) => Buffer.from(await (await fetch(url)).arrayBuffer());

describe('T-0669 every published sha256 is reproducible from source_url', () => {
  it('index.json: sha256(GET source_url) === entry.sha256 for the four registry ids', async () => {
    const s = await serve();
    const res = await fetch(`${s.base}/legal/index.json`);
    expect(res.headers.get('link')).toBe('</legal/index.next.json>; rel="next"');
    const idx = (await res.json()) as Entry[];
    for (const id of LEGAL_DOC_IDS) {
      const e = idx.find((x) => x.doc_id === id)!;
      expect(e.version).toBe('1.0');
      expect(e.hash_of).toBe('source');
      expect(e.source_url).toBe(`/legal/${id}.src.md?version=1.0`);
      const r = await fetch(`${s.base}${e.source_url}`);
      expect(sha(Buffer.from(await r.arrayBuffer()))).toBe(e.sha256);
      expect(r.headers.get('etag')).toBe(`"sha256-${e.sha256}"`);
      expect(r.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
      expect(r.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    }
    await s.close();
  });

  it('default .src.md serves the current effective version with max-age=300', async () => {
    const s = await serve();
    const r = await fetch(`${s.base}/legal/aup.src.md`);
    expect(r.headers.get('cache-control')).toBe('public, max-age=300');
    expect(Buffer.from(await r.arrayBuffer()).toString()).toBe(
      v1.find((x) => x.doc_id === 'aup')!.body_md,
    );
    await s.close();
  });

  it('index.next.json lists scheduled v2 with a matching hash; ?version=v2 returns v2 bytes', async () => {
    const s = await serve();
    const next = (await (await fetch(`${s.base}/legal/index.next.json`)).json()) as Entry[];
    for (const id of LEGAL_DOC_IDS) {
      const e = next.find((x) => x.doc_id === id)!;
      expect(e.version).toBe('2.0');
      expect(sha(await bytes(`${s.base}${e.source_url}`))).toBe(e.sha256);
    }
    const r = await fetch(`${s.base}/legal/dpa.src.md?version=2.0`);
    expect(await r.text()).toContain('V2 TEXT');
    // terms/privacy 2.0 are scheduled in config/site-docs-register.json
    for (const id of ['terms', 'privacy']) {
      const e = next.find((x) => x.doc_id === id)!;
      expect(e).toMatchObject({
        version: '2.0',
        effective_from: '2026-11-26',
        hash_of: 'legal-body',
      });
    }
    await s.close();
  });

  it('.md and HTML render the current effective row, not the v2 disk file; .md differs from .src.md only by the fee token', async () => {
    const s = await serve();
    for (const id of LEGAL_DOC_IDS) {
      const src = await (await fetch(`${s.base}/legal/${id}.src.md`)).text();
      const md = await (await fetch(`${s.base}/legal/${id}.md`)).text();
      expect(md).not.toContain('V2 TEXT');
      expect(md).toBe(src.replace(/\{\{INTEGRATOR_FEE_PCT\}\}/g, '0% during the pilot'));
      const html = await (await fetch(`${s.base}/legal/${id}`)).text();
      expect(html).not.toContain('V2 TEXT');
    }
    await s.close();
  });

  it('terms/privacy: sha256(GET /legal/<page>.body.txt) === index entry', async () => {
    const s = await serve();
    const idx = (await (await fetch(`${s.base}/legal/index.json`)).json()) as Entry[];
    for (const id of ['terms', 'privacy']) {
      const e = idx.find((x) => x.doc_id === id)!;
      expect(e).toMatchObject({ hash_of: 'legal-body', source_url: `/legal/${id}.body.txt` });
      const r = await fetch(`${s.base}${e.source_url}`);
      expect(r.headers.get('content-type')).toBe('text/plain; charset=utf-8');
      expect(sha(Buffer.from(await r.arrayBuffer()))).toBe(e.sha256);
    }
    await s.close();
  });

  it('unknown or malformed version -> 404 unknown_version', async () => {
    const s = await serve();
    for (const q of ['9.9', '..%2Fx', 'a']) {
      const r = await fetch(`${s.base}/legal/aup.src.md?version=${q}`);
      expect(r.status).toBe(404);
      expect(((await r.json()) as { error_code: string }).error_code).toBe('unknown_version');
    }
    const arr = await fetch(`${s.base}/legal/aup.src.md?version=1.0&version=2.0`);
    expect(arr.status).toBe(404);
    expect((await fetch(`${s.base}/legal/nope.src.md`)).status).toBe(404);
    await s.close();
  });

  it('the terms guard still selects through latestLegalRows (effective rows only)', async () => {
    const rows = await latestLegalRows(fixtureDb([...v1, ...v2]), LEGAL_DOC_IDS, NOW);
    expect(rows.map((r) => r.version)).toEqual(['1.0', '1.0', '1.0', '1.0']);
  });

  it('.src.md handler never substitutes the fee token', () => {
    const src = readFileSync(join(__dirname, '../../src/shop/routes/legal.router.ts'), 'utf-8');
    const a = src.indexOf('.src\\.md$/');
    const b = src.indexOf('.body\\.txt$/');
    expect(a).toBeGreaterThan(0);
    expect(src.slice(a, b)).not.toContain('replace(');
  });
});
