/** T-INT-05 LG1-LG9. Real express router + real files; in-memory shop_legal_docs. */
import express from 'express';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { ShopTx } from '../../src/shop/db';
import {
  LEGAL_DIR,
  LEGAL_DOC_IDS,
  LegalDocChangedError,
  syncLegalDocs,
} from '../../src/shop/legal/legal-docs';
import { createLegalRouter } from '../../src/shop/routes/legal.router';

jest.mock('../../src/config', () => ({ config: {} }));

const ROOT = resolve(__dirname, '../..');
type Row = { doc_id: string; version: string; sha256: string; url: string; effective_from: string };

function fakeDb(rows: Row[] = []): ShopTx & { rows: Row[] } {
  return {
    rows,
    async $queryRawUnsafe(q: string, ...v: unknown[]) {
      if (q.includes('DISTINCT ON')) {
        const ids = v[0] as string[];
        const out = new Map<string, Row>();
        for (const r of rows) {
          if (!ids.includes(r.doc_id) || Date.parse(r.effective_from) > Date.parse(v[1] as string))
            continue;
          const cur = out.get(r.doc_id);
          const newer =
            cur &&
            (Date.parse(r.effective_from) - Date.parse(cur.effective_from) ||
              r.version.localeCompare(cur.version));
          if (!cur || newer! > 0) out.set(r.doc_id, r);
        }
        return [...out.values()] as never;
      }
      return rows
        .filter((r) => r.doc_id === v[0] && r.version === v[1])
        .map((r) => ({ sha256: r.sha256 })) as never;
    },
    async $executeRawUnsafe(_q: string, ...v: unknown[]) {
      rows.push({
        doc_id: v[0] as string,
        version: v[1] as string,
        sha256: v[2] as string,
        url: v[3] as string,
        effective_from: v[4] as string,
      });
      return 1;
    },
  } as ShopTx & { rows: Row[] };
}

function tmpLegalDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'legal-'));
  for (const id of LEGAL_DOC_IDS) copyFileSync(join(LEGAL_DIR, `${id}.md`), join(d, `${id}.md`));
  return d;
}

async function serve(opts: Parameters<typeof createLegalRouter>[0]) {
  const app = express();
  app.use(createLegalRouter(opts));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, close: () => new Promise((r) => server.close(r)) };
}

const read = (p: string) => readFileSync(p, 'utf-8');
const countries: string[] = JSON.parse(
  read(join(ROOT, 'config/integrator/countries-restricted.json')),
).restricted_entity_countries;

describe('T-INT-05 legal documents', () => {
  it('LG1 index.json: 4 entries, sha256 == sha256sum of the .md', async () => {
    const db = fakeDb();
    await syncLegalDocs(db);
    const s = await serve({ db });
    const idx = (await (await fetch(`${s.base}/legal/index.json`)).json()) as Row[];
    await s.close();
    expect(idx.map((e) => e.doc_id)).toEqual([...LEGAL_DOC_IDS]);
    for (const e of idx) {
      const sum = execFileSync('sha256sum', [join(LEGAL_DIR, `${e.doc_id}.md`)])
        .toString()
        .split(' ')[0];
      expect(e.sha256).toBe(sum);
      expect(e.version).toBe('1.0');
      expect(e.url).toBe(`/legal/${e.doc_id}`);
      expect(Object.keys(e).sort()).toEqual([
        'doc_id',
        'effective_from',
        'sha256',
        'url',
        'version',
      ]);
    }
  });

  it('LG2 text change without a version change fails sync; 1.1 appends and index shows 1.1', async () => {
    const dir = tmpLegalDir();
    const db = fakeDb();
    await syncLegalDocs(db, dir);
    const aup = join(dir, 'aup.md');
    writeFileSync(aup, read(aup) + 'x');
    await expect(syncLegalDocs(db, dir)).rejects.toBeInstanceOf(LegalDocChangedError);
    writeFileSync(aup, read(aup).replace('version: 1.0;', 'version: 1.1;'));
    await syncLegalDocs(db, dir);
    expect(
      db.rows
        .filter((r) => r.doc_id === 'aup')
        .map((r) => r.version)
        .sort(),
    ).toEqual(['1.0', '1.1']);
    const s = await serve({ db, dir, now: () => Date.parse('2030-01-01') });
    const idx = (await (await fetch(`${s.base}/legal/index.json`)).json()) as Row[];
    await s.close();
    expect(idx.find((e) => e.doc_id === 'aup')!.version).toBe('1.1');
  });

  it('LG3 DRAFT banner + noindex until legal-published.json exists; .md never has the banner', async () => {
    const dir = tmpLegalDir();
    const pub = join(dir, 'legal-published.json');
    const s = await serve({ db: fakeDb(), dir, publishedFile: pub });
    let html = await (await fetch(`${s.base}/legal/aup`)).text();
    expect(html).toContain('draft-banner');
    expect(html).toContain('noindex');
    expect(await (await fetch(`${s.base}/legal/aup.md`)).text()).not.toMatch(
      /draft-banner|noindex/,
    );
    writeFileSync(pub, JSON.stringify({ published_at: '2026-10-06T00:00:00Z', by: 'operator' }));
    html = await (await fetch(`${s.base}/legal/aup`)).text();
    expect(html).not.toContain('draft-banner');
    expect(html).not.toContain('noindex');
    expect(await (await fetch(`${s.base}/legal/aup.md`)).text()).not.toMatch(
      /draft-banner|noindex/,
    );
    await s.close();
  });

  const FORBIDDEN: RegExp[] = [
    /1\.5\s?%/,
    /1,5\s?%/,
    /all agents (already )?buy/i,
    /chatgpt (is )?buy/i,
    /instant refund/i,
    /buyer protection/i,
    /legal everywhere/i,
    /no kyc/i,
    /(de facto )?standard for (agent )?payments/i,
    /x402 is the (de facto )?standard/i,
    /все агенты уже покупают/i,
    /chatgpt покупает у вас/i,
    /мгновенный возврат/i,
    /защита покупателя/i,
    /законно везде/i,
    /без kyc/i,
    /x402 — (де-факто )?стандарт/i,
    /\[к проверке юристом\]/i,
    /to be checked by (a )?lawyer/i,
    /подключиться к MCP-серверу/i,
  ];
  const surfaces = [
    ...LEGAL_DOC_IDS.map((id) => join(ROOT, 'static/legal', `${id}.md`)),
    join(ROOT, 'static/terms.html'),
    join(ROOT, 'static/privacy.html'),
  ];

  it('LG4 no hardcoded fee / banned phrases / lawyer marks; §7.1 line present', () => {
    for (const f of surfaces) {
      const t = read(f);
      for (const re of FORBIDDEN)
        expect({ f, re: String(re), hit: re.test(t) }).toMatchObject({ hit: false });
    }
    const line71 = [
      /APIbase is a technology intermediary; buyer funds do not pass through APIbase; the fee is charged to the merchant; the legal entity and jurisdiction will be announced/,
      /средства покупателя не проходят через APIbase/,
    ];
    for (const f of [
      join(ROOT, 'static/legal/merchant-agreement.md'),
      join(ROOT, 'static/terms.html'),
      join(ROOT, 'static/privacy.html'),
    ]) {
      expect(line71[0].test(read(f))).toBe(true);
    }
    expect(line71[1].test(read(join(ROOT, 'static/legal/merchant-agreement.md')))).toBe(true);
    for (const id of LEGAL_DOC_IDS) {
      const t = read(join(ROOT, 'static/legal', `${id}.md`));
      expect(t.split('\n')[0]).toMatch(
        /^<!-- version: 1\.0; effective_from: \d{4}-\d{2}-\d{2}; status: draft accepted by operator without legal review -->$/,
      );
    }
    expect(read(join(ROOT, 'static/legal/merchant-agreement.md'))).toContain(
      '{{INTEGRATOR_FEE_PCT}}',
    );
  });

  it('LG5 aup.md country block == countries-restricted.json (25, no extras)', () => {
    const t = read(join(ROOT, 'static/legal/aup.md'));
    const block = /<!-- countries:start -->([\s\S]*?)<!-- countries:end -->/.exec(t)![1];
    const codes = block.match(/[A-Z]{2}/g)!;
    expect(countries).toHaveLength(25);
    expect(codes.sort()).toEqual([...countries].sort());
  });

  it('LG6 merchant-agreement.md carries the §11.1 terms', () => {
    const t = read(join(ROOT, 'static/legal/merchant-agreement.md'));
    for (const w of [
      '7 days',
      '48 hours',
      '12 months',
      'Tempo',
      'Base',
      'invoice',
      'счёт',
      'не является продавцом',
    ]) {
      expect(t).toContain(w);
    }
  });

  it('LG7 Accept: text/markdown on /legal/dpa returns the file', async () => {
    const s = await serve({ db: fakeDb() });
    const r = await fetch(`${s.base}/legal/dpa`, { headers: { accept: 'text/markdown' } });
    const body = await r.text();
    await s.close();
    expect(r.headers.get('content-type')).toMatch(/text\/markdown/);
    expect(body).toBe(read(join(ROOT, 'static/legal/dpa.md')));
  });

  it('LG8 terms/privacy: everything outside the new block is unchanged', () => {
    for (const n of ['terms', 'privacy']) {
      const now = read(join(ROOT, `static/${n}.html`));
      expect(now).toContain('<!-- integrator-legal:start -->');
      const stripped = now.replace(
        /<!-- integrator-legal:start -->[\s\S]*?<!-- integrator-legal:end -->\n\n/,
        '',
      );
      expect(stripped).toBe(read(join(ROOT, `tests/unit/fixtures/${n}.before-int05.html`)));
    }
  });

  it('LG9 unknown doc → 404; 61 requests/min → 429', async () => {
    const s = await serve({ db: fakeDb() });
    expect((await fetch(`${s.base}/legal/unknown`)).status).toBe(404);
    expect((await fetch(`${s.base}/legal/terms`)).status).toBe(404);
    const codes: number[] = [];
    for (let i = 0; i < 58; i++) codes.push((await fetch(`${s.base}/legal/unknown`)).status);
    expect(codes.every((c) => c === 404)).toBe(true);
    expect((await fetch(`${s.base}/legal/unknown`)).status).toBe(429);
    await s.close();
  });
});
