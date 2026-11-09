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
  LegalEffectiveFromError,
  syncLegalDocs,
} from '../../src/shop/legal/legal-docs';
import {
  createLegalRouter,
  renderMarkdown,
  stripHtmlComments,
} from '../../src/shop/routes/legal.router';

import { logger } from '../../src/config/logger';
import { fixtureDb } from './helpers/legal-fixture-db';

const FAR = () => Date.parse('2030-01-01');

jest.mock('../../src/config', () => ({ config: {} }));

const ROOT = resolve(__dirname, '../..');
type Row = { doc_id: string; version: string; sha256: string; url: string; effective_from: string };

type Extra = {
  rows: Row[];
  acceptances: Array<{ doc_id: string; version: string }>;
  emails: Array<{ msg_id: string; status: string }>;
};

function fakeDb(rows: Row[] = []): ShopTx & Extra {
  const acceptances: Extra['acceptances'] = [];
  const emails: Extra['emails'] = [];
  return {
    rows,
    acceptances,
    emails,
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
      if (q.includes('max(effective_from)')) {
        const ts = rows
          .filter((r) => r.doc_id === v[0] && (!q.includes('version <> $2') || r.version !== v[1]))
          .map((r) => Date.parse(r.effective_from));
        return [{ max_from: ts.length ? new Date(Math.max(...ts)).toISOString() : null }] as never;
      }
      if (q.includes('FROM shop_acceptances')) {
        const n = acceptances.filter((a) => a.doc_id === v[0] && a.version === v[1]).length;
        return [{ n: BigInt(n) }] as never;
      }
      if (q.includes('FROM email_events')) {
        // msg_id LIKE 'legal-notice:%:<doc_id>:<version>' AND status = 'sent'
        const n = emails.filter(
          (e) =>
            e.status === 'sent' &&
            e.msg_id.startsWith('legal-notice:') &&
            e.msg_id.endsWith(`:${v[0]}:${v[1]}`),
        ).length;
        return [{ n: BigInt(n) }] as never;
      }
      return rows
        .filter((r) => r.doc_id === v[0] && r.version === v[1])
        .map((r) => ({ sha256: r.sha256, effective_from: r.effective_from })) as never;
    },
    async $executeRawUnsafe(q: string, ...v: unknown[]) {
      if (q.trim().startsWith('UPDATE shop_legal_docs')) {
        const r = rows.find((x) => x.doc_id === v[0] && x.version === v[1])!;
        r.sha256 = v[2] as string;
        r.effective_from = v[4] as string;
        return 1;
      }
      rows.push({
        doc_id: v[0] as string,
        version: v[1] as string,
        sha256: v[2] as string,
        url: v[3] as string,
        effective_from: v[4] as string,
      });
      return 1;
    },
  } as ShopTx & Extra;
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
    const s = await serve({ db, now: () => Date.parse('2030-01-01') });
    const all = (await (await fetch(`${s.base}/legal/index.json`)).json()) as Array<
      Row & { registry?: boolean }
    >;
    await s.close();
    const idx = all.filter((e) => e.registry !== false);
    expect(idx.map((e) => e.doc_id)).toEqual([...LEGAL_DOC_IDS]);
    for (const e of idx) {
      const sum = execFileSync('sha256sum', [join(LEGAL_DIR, `${e.doc_id}.md`)])
        .toString()
        .split(' ')[0];
      expect(e.sha256).toBe(sum);
      expect(e.version).toBe(['merchant-agreement', 'aup'].includes(e.doc_id) ? '1.5' : '1.4');
      expect(e.url).toBe(`/legal/${e.doc_id}`);
      expect(Object.keys(e).sort()).toEqual([
        'doc_id',
        'effective_from',
        'hash_of',
        'sha256',
        'source_url',
        'url',
        'version',
      ]);
    }
  });

  it('LG2 text change without a version change fails sync; 1.6 appends and index shows 1.6', async () => {
    const dir = tmpLegalDir();
    const db = fakeDb();
    await syncLegalDocs(db, dir);
    const aup = join(dir, 'aup.md');
    writeFileSync(aup, read(aup) + 'x');
    // In force (now after effective_from): a text change is refused.
    await expect(syncLegalDocs(db, dir, FAR())).rejects.toBeInstanceOf(LegalDocChangedError);
    const bumped = read(aup).replace('version: 1.5;', 'version: 1.6;');
    writeFileSync(aup, bumped);
    await expect(syncLegalDocs(db, dir)).rejects.toBeInstanceOf(LegalEffectiveFromError);
    writeFileSync(
      aup,
      bumped.replace(/effective_from: \d{4}-\d{2}-\d{2}/, 'effective_from: 2026-12-11'),
    );
    await syncLegalDocs(db, dir);
    expect(
      db.rows
        .filter((r) => r.doc_id === 'aup')
        .map((r) => r.version)
        .sort(),
    ).toEqual(['1.5', '1.6']);
    const s = await serve({ db, dir, now: () => Date.parse('2030-01-01') });
    const idx = (await (await fetch(`${s.base}/legal/index.json`)).json()) as Row[];
    await s.close();
    expect(idx.find((e) => e.doc_id === 'aup')!.version).toBe('1.6');
  });

  describe('T-0722 re-issue of a scheduled, never-accepted, never-notified version', () => {
    const NOW = Date.parse('2026-11-09T00:00:00Z');
    const REISSUED = '2026-12-24';
    // Registry as of the T-0695 release: aup 1.3 in force, aup 1.5 scheduled for 2026-11-26.
    async function setup() {
      const dir = tmpLegalDir();
      const aup = join(dir, 'aup.md');
      const shipped = read(aup);
      writeFileSync(
        aup,
        shipped.replace(/effective_from: \d{4}-\d{2}-\d{2}/, 'effective_from: 2026-11-26'),
      );
      const db = fakeDb([
        {
          doc_id: 'aup',
          version: '1.3',
          sha256: 'a'.repeat(64),
          url: '/legal/aup',
          effective_from: '2026-10-12T00:00:00.000Z',
        },
      ]);
      await syncLegalDocs(db, dir, NOW);
      writeFileSync(
        aup,
        shipped.replace(/effective_from: \d{4}-\d{2}-\d{2}/, `effective_from: ${REISSUED}`),
      );
      return { dir, db, aup };
    }
    const aupRows = (db: { rows: Row[] }) => db.rows.filter((r) => r.doc_id === 'aup');

    it('RI1 all three guards green: the row is updated in place, one row per version, one warn line', async () => {
      const { dir, db, aup } = await setup();
      const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined as never);
      // Another merchant's notice for a different version, and a queued (unsent) notice for 1.5.
      db.emails.push({ msg_id: 'legal-notice:m1:aup:1.3', status: 'sent' });
      db.emails.push({ msg_id: 'legal-notice:m1:aup:1.5', status: 'queued' });
      db.acceptances.push({ doc_id: 'aup', version: '1.3' });
      await syncLegalDocs(db, dir, NOW);
      const sum = execFileSync('sha256sum', [aup]).toString().split(' ')[0];
      expect(aupRows(db).map((r) => r.version)).toEqual(['1.3', '1.5']);
      const r15 = aupRows(db).find((r) => r.version === '1.5')!;
      expect(r15.sha256).toBe(sum);
      expect(r15.effective_from).toBe(`${REISSUED}T00:00:00.000Z`);
      const lines = warn.mock.calls.filter((c) => c[1] === 'legal doc re-issued before effect');
      expect(lines).toHaveLength(1);
      expect(lines[0][0]).toEqual({
        doc_id: 'aup',
        version: '1.5',
        from: '2026-11-26T00:00:00.000Z',
        to: `${REISSUED}T00:00:00.000Z`,
      });
      warn.mockRestore();
      // Idempotent: a second start with the same file changes nothing.
      await syncLegalDocs(db, dir, NOW);
      expect(aupRows(db)).toHaveLength(2);
    });

    it('RI2a registered version already in effect -> LegalDocChangedError, row untouched', async () => {
      const { dir, db } = await setup();
      const before = JSON.stringify(db.rows);
      await expect(
        syncLegalDocs(db, dir, Date.parse('2026-11-26T00:00:00Z')),
      ).rejects.toBeInstanceOf(LegalDocChangedError);
      expect(JSON.stringify(db.rows)).toBe(before);
    });

    it('RI2b an acceptance of the version exists -> LegalDocChangedError, row untouched', async () => {
      const { dir, db } = await setup();
      const before = JSON.stringify(db.rows);
      db.acceptances.push({ doc_id: 'aup', version: '1.5' });
      await expect(syncLegalDocs(db, dir, NOW)).rejects.toBeInstanceOf(LegalDocChangedError);
      expect(JSON.stringify(db.rows)).toBe(before);
    });

    it('RI2c a notice for the version was sent -> LegalDocChangedError, row untouched', async () => {
      const { dir, db } = await setup();
      const before = JSON.stringify(db.rows);
      db.emails.push({ msg_id: 'legal-notice:0b5e-merchant:aup:1.5', status: 'sent' });
      await expect(syncLegalDocs(db, dir, NOW)).rejects.toBeInstanceOf(LegalDocChangedError);
      expect(JSON.stringify(db.rows)).toBe(before);
    });

    it('RI2d the re-issued date is not later than another registered version -> LegalEffectiveFromError', async () => {
      const { dir, db, aup } = await setup();
      writeFileSync(
        aup,
        read(aup).replace(/effective_from: \d{4}-\d{2}-\d{2}/, 'effective_from: 2026-10-12'),
      );
      await expect(
        syncLegalDocs(db, dir, Date.parse('2026-10-01T00:00:00Z')),
      ).rejects.toBeInstanceOf(LegalEffectiveFromError);
    });

    it('RI2e the re-issued date is already past -> LegalDocChangedError (never re-issued into force)', async () => {
      const { dir, db, aup } = await setup();
      writeFileSync(
        aup,
        read(aup).replace(/effective_from: \d{4}-\d{2}-\d{2}/, 'effective_from: 2026-11-01'),
      );
      await expect(syncLegalDocs(db, dir, NOW)).rejects.toBeInstanceOf(LegalDocChangedError);
    });
  });

  it('LG3 DRAFT banner + noindex until legal-published.json exists; .md never has the banner', async () => {
    const dir = tmpLegalDir();
    const pub = join(dir, 'legal-published.json');
    const s = await serve({ db: fixtureDb(), dir, publishedFile: pub, now: FAR });
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
    /to be checked by (a )?lawyer/i,
    /not a legal opinion/i,
    /\bdraft\b/i,
    /will be announced/i,
    /are also refused/i,
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
    // T-0582: the operator is named truthfully; the one-sentence role line survives without the DAO wording.
    const line71 =
      /APIbase is a technology intermediary; buyer funds do not pass through APIbase; the fee is charged to the merchant\./;
    for (const f of [
      join(ROOT, 'static/legal/merchant-agreement.md'),
      join(ROOT, 'static/terms.html'),
      join(ROOT, 'static/privacy.html'),
    ]) {
      expect(line71.test(read(f))).toBe(true);
    }
    for (const f of [...surfaces, join(ROOT, 'docs/payments.md')]) {
      expect(read(f)).not.toMatch(/decentrali[sz]ed autonomous/i);
    }
    expect(read(join(ROOT, 'static/legal/dpa.md'))).not.toContain('European Union');
    expect(read(join(ROOT, 'static/legal/dpa.md'))).toContain('Hillsboro');
    for (const id of LEGAL_DOC_IDS) {
      const t = read(join(ROOT, 'static/legal', `${id}.md`));
      const head = new RegExp(
        `^<!-- version: ${{ 'merchant-agreement': '1\\.5', aup: '1\\.5', dpa: '1\\.4', 'refund-framework': '1\\.4' }[id]}; effective_from: 2026-12-10; status: in force; drafted by the operator without legal review -->$`,
      );
      expect(t.split('\n')[0]).toMatch(head);
    }
    for (const id of LEGAL_DOC_IDS) {
      const lines = read(join(ROOT, 'static/legal', `${id}.md`)).split('\n');
      const hv = /^<!-- version: (\S+?);/.exec(lines[0])!;
      const h1 = /^# .+ v(\S+)$/.exec(lines[1]);
      expect({ id, h1: h1 && h1[1] }).toEqual({ id, h1: hv[1] });
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
    for (const w of ['7 days', '48 hours', '12 months', 'Tempo', 'Base', 'invoice']) {
      expect(t).toContain(w);
    }
  });

  it('LG7 Accept: text/markdown on /legal/dpa returns the file', async () => {
    const s = await serve({ db: fixtureDb(), now: FAR });
    const r = await fetch(`${s.base}/legal/dpa`, { headers: { accept: 'text/markdown' } });
    const body = await r.text();
    await s.close();
    expect(r.headers.get('content-type')).toMatch(/text\/markdown/);
    expect(body).toBe(
      read(join(ROOT, 'static/legal/dpa.md')).replace(
        /\{\{INTEGRATOR_FEE_PCT\}\}/g,
        '0% during the pilot',
      ),
    );
  });

  it('LG8 terms/privacy keep the integrator block and carry the T-0582 sections', () => {
    // T-0582 rewrites the legal text of both pages (operator, law, sanctions, controller, bases,
    // recipients, retention, rights), so the old before-int05 word-for-word comparison is retired.
    for (const n of ['terms', 'privacy']) {
      const now = read(join(ROOT, `static/${n}.html`));
      expect(now).toContain('<!-- integrator-legal:start -->');
      expect(now).toContain('<!-- integrator-legal:end -->');
      expect(now).toContain('Changes take effect 30 days after they are posted at /legal');
      expect(now).toContain('without a lawyer and are not legal advice');
    }
    const terms = read(join(ROOT, 'static/terms.html'));
    expect(terms).toContain('id="12a-sanctions"');
    expect(terms).toContain('law of England and Wales');
    const privacy = read(join(ROOT, 'static/privacy.html'));
    for (const id of ['controller', '4a-legal-bases', '9a-your-rights', '6-data-retention']) {
      expect(privacy).toContain(`id="${id}"`);
    }
    expect(privacy.match(/an individual independent open-source developer/g)).toHaveLength(1);
    for (const t of [terms, privacy]) {
      expect(t).not.toContain('effective immediately upon posting');
      expect(t).not.toMatch(/decentrali[sz]ed autonomous/i);
    }
  });

  it('LG9b aup.md prohibited block == prohibited-categories.json, served byte-for-byte', async () => {
    const file = join(ROOT, 'config/integrator/prohibited-categories.json');
    const prohibited: Array<{ text: string }> = JSON.parse(read(file)).prohibited;
    const block = /<!-- prohibited:start -->([\s\S]*?)<!-- prohibited:end -->/.exec(
      read(join(ROOT, 'static/legal/aup.md')),
    )![1];
    expect(block.trim()).toBe(prohibited.map((p) => p.text).join('; ') + '.');
    const s = await serve({ db: fakeDb() });
    const r = await fetch(`${s.base}/legal/prohibited-categories.json`);
    const body = Buffer.from(await r.arrayBuffer());
    await s.close();
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toMatch(/application\/json/);
    expect(r.headers.get('cache-control')).toBe('public, max-age=3600');
    expect(body.equals(readFileSync(file))).toBe(true);
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

describe('LG10 renderMarkdown strips comments completely', () => {
  it('LG10a removes a terminated comment', () => {
    const out = renderMarkdown('x <!-- hidden --> y');
    expect(out).not.toContain('hidden');
    expect(out).not.toContain('<!--');
    expect(out).toContain('<p>x');
  });

  it('LG10b leaves no raw comment markers behind nested openers', () => {
    const out = renderMarkdown('a <!<!---->-- b');
    expect(out).not.toContain('<!--');
    expect(out).not.toContain('-->');
    expect(out).toContain('<p>a');
  });

  it('LG10c stripHtmlComments handles adjacent comments and plain text', () => {
    expect(stripHtmlComments('<!-- a --><!-- b -->c')).toBe('c');
    expect(stripHtmlComments('no comments')).toBe('no comments');
  });
});

describe('T-0401 renderMarkdown links bare site paths', () => {
  it('wraps a prose path in <a> with trailing dot outside; code stays code', () => {
    const out = renderMarkdown('See /legal and /pricing. Also `/legal/x.json` here.');
    expect(out).toContain('<a href="/legal">/legal</a>');
    expect(out).toContain('<a href="/pricing">/pricing</a>.');
    expect(out).toContain('<code>/legal/x.json</code>');
    expect(out).not.toContain('<a href="/legal/x.json"');
  });
});
