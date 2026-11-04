import type { AddressInfo } from 'node:net';
import express from 'express';
import { createLegalRouter } from '../../src/shop/routes/legal.router';
import { runLegalNotice } from '../../src/jobs/legal-notice.job';
import type { ShopDeps } from '../../src/shop/merchant-lifecycle.service';
import { diskRows, fixtureDb } from './helpers/legal-fixture-db';

jest.mock('../../src/config', () => ({ config: {} }));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const NOW = Date.parse('2026-11-02T00:00:00Z');
const v1 = diskRows().map((r) => ({
  ...r,
  version: '1.0',
  effective_from: '2026-10-01T00:00:00.000Z',
}));
const v2 = v1.map((r) => ({
  ...r,
  version: '2.0',
  effective_from: '2026-12-01T00:00:00.000Z',
  body_md: r.body_md + '\nV2 TEXT\n',
}));

async function serve(rows: typeof v1, at = NOW) {
  const app = express();
  app.use(createLegalRouter({ db: fixtureDb(rows), now: () => at }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, close: () => new Promise((r) => server.close(r)) };
}

const LINE = 'Version 2.0 of this document takes effect 2026-12-01; read it at';

describe('T-0695 scheduled version is visible to humans', () => {
  it('index HTML lists "Scheduled versions" with the ?version=2.0 link', async () => {
    const s = await serve([...v1, ...v2]);
    const html = await (
      await fetch(`${s.base}/legal`, { headers: { accept: 'text/html' } })
    ).text();
    expect(html).toContain('Scheduled versions');
    expect(html).toContain('the current version stays in force until then');
    expect(html).toContain('href="/legal/merchant-agreement.src.md?version=2.0"');
    await s.close();
  });

  it('document page and .md twin carry the notice line; .src.md bytes are unchanged', async () => {
    const s = await serve([...v1, ...v2]);
    const html = await (await fetch(`${s.base}/legal/aup`)).text();
    expect(html).toContain(`<p class="lg-notice">${LINE} <a href="/legal/aup.src.md?version=2.0">`);
    const md = await (await fetch(`${s.base}/legal/aup.md`)).text();
    expect(md).toContain(`\n${LINE} /legal/aup.src.md?version=2.0.\n`);
    const src = Buffer.from(await (await fetch(`${s.base}/legal/aup.src.md`)).arrayBuffer());
    expect(src.toString()).toBe(v1.find((x) => x.doc_id === 'aup')!.body_md);
    expect(src.toString()).not.toContain('takes effect');
    await s.close();
  });

  it('no scheduled row: no section, no line', async () => {
    // 2030: also past every future date in config/site-docs-register.json (static pages).
    const s = await serve(v1, Date.parse('2030-01-01T00:00:00Z'));
    const html = await (
      await fetch(`${s.base}/legal`, { headers: { accept: 'text/html' } })
    ).text();
    expect(html).not.toContain('Scheduled versions');
    expect(await (await fetch(`${s.base}/legal/aup`)).text()).not.toContain('lg-notice"');
    expect(await (await fetch(`${s.base}/legal/aup.md`)).text()).not.toContain('takes effect');
    await s.close();
  });
});

/** In-memory shop_legal_docs / shop_merchants / email_events / outbox. */
function fakeDeps(merchants: Array<{ merchant_id: string; status: string }>, versions: string[]) {
  const mail = new Set<string>();
  const outbox: string[] = [];
  const db = {
    $queryRawUnsafe: async (sql: string) =>
      /shop_legal_docs/.test(sql)
        ? versions.map((version) => ({
            doc_id: 'aup',
            version,
            effective_from: '2026-12-01T00:00:00.000Z',
          }))
        : merchants.filter((m) => m.status === 'active'),
    $executeRawUnsafe: async (sql: string, ...a: unknown[]) => {
      if (/INTO email_events/.test(sql)) {
        const k = String(a[0]);
        if (mail.has(k)) return 0;
        mail.add(k);
        return 1;
      }
      outbox.push(String(a[0]));
      return 1;
    },
  };
  const deps = { db, transaction: (fn: (tx: any) => unknown) => fn(db) } as unknown as ShopDeps;
  return { deps, mail, outbox };
}

describe('T-0695 e-mail notice job', () => {
  const ms = [
    { merchant_id: 'a1', status: 'active' },
    { merchant_id: 'b2', status: 'active' },
    { merchant_id: 'c3', status: 'suspended' },
  ];

  it('two runs: one event per active merchant per (doc, version); inactive excluded', async () => {
    const f = fakeDeps(ms, ['2.0']);
    const first = await runLegalNotice(f.deps, NOW);
    const second = await runLegalNotice(f.deps, NOW);
    expect(first.queued).toBe(2);
    expect(second.queued).toBe(0);
    expect([...f.mail].sort()).toEqual(['legal-notice:a1:aup:2.0', 'legal-notice:b2:aup:2.0']);
    expect(f.outbox).toEqual(['shop.legal.new_version', 'shop.legal.new_version']);
  });

  it('a second scheduled version is a new key', async () => {
    const f = fakeDeps(ms, ['2.0']);
    await runLegalNotice(f.deps, NOW);
    const f2 = { ...f, deps: fakeDeps(ms, ['2.0', '3.0']).deps };
    expect((await runLegalNotice(f2.deps, NOW)).queued).toBe(4);
  });
});
