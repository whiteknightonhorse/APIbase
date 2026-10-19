/** T-0383: content-parity gate (scripts/page-parity.py) in --render mode, plus mutations that must FAIL. */
import express from 'express';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { onboardRouter } from '../../src/routes/onboard.router';
import { createIntegratorRouter } from '../../src/shop/routes/integrator.router';
import { createLegalRouter } from '../../src/shop/routes/legal.router';

jest.mock('../../src/config', () => ({ config: {} }));
jest.mock('../../src/config/index', () => ({ config: {} }));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/services/onboard.service', () => ({
  checkIpRateLimit: jest.fn(),
  createSubmission: jest.fn(),
}));

const ROOT = resolve(__dirname, '../..');
const FIX = join(ROOT, 'tests/fixtures/page-baseline');
const SCRIPT = join(ROOT, 'scripts/page-parity.py');
const names = readdirSync(FIX)
  .filter((f) => f.endsWith('.txt') && !f.endsWith('.allow.txt'))
  .map((f) => f.slice(0, -4));
const pathOf = (n: string) => (n === 'home' ? '/' : `/${n.replace(/_/g, '/')}`);
// Rendered from the database: only the fetch mode (PARITY_BASE) can compare them.
const DB_PAGES = ['shops', 'm_apibase-demo'];

const parity = (args: string[], root = ROOT) =>
  spawnSync('python3', ['-I', SCRIPT, ...args], {
    env: { ...process.env, ROOT: root },
    encoding: 'utf-8',
  });

let server: ReturnType<express.Express['listen']>;
let base: string;
let dir: string;
beforeAll(async () => {
  const app = express();
  app.use(createIntegratorRouter({ limit: 10_000 }));
  app.use(createLegalRouter({ db: {} as never }));
  app.use(onboardRouter);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  dir = mkdtempSync(join(tmpdir(), 'page-parity-'));
  for (const n of names) {
    if (!/^(integrator|legal_|onboard)/.test(n)) continue;
    const r = await fetch(`${base}${pathOf(n)}`, { headers: { accept: 'text/html' } });
    expect([n, r.status]).toEqual([n, 200]);
    writeFileSync(join(dir, `${n}.html`), await r.text());
  }
});
afterAll(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('T-0383 page-parity gate', () => {
  it('PP1: 35 baseline pages are in tests/fixtures/page-baseline', () => {
    expect(names).toHaveLength(35);
    expect(readdirSync(FIX)).toContain('dashboard-api.json');
  });

  it('PP2: static and app-rendered pages keep text, hrefs and ids (--render)', () => {
    const r = parity(['--render', '--rendered-dir', dir]);
    expect(r.stdout.split('\n').filter((l) => l.startsWith('PARITY_FAIL'))).toEqual([]);
    expect(r.status).toBe(0);
    const skipped = r.stdout.split('\n').filter((l) => l.startsWith('PARITY_SKIP'));
    expect(skipped.map((l) => l.split(' ')[1].replace(':', '')).sort()).toEqual(
      [...DB_PAGES].sort(),
    );
  });

  describe('mutations', () => {
    let tmp: string;
    beforeEach(() => {
      tmp = mkdtempSync(join(tmpdir(), 'page-parity-root-'));
      cpSync(join(ROOT, 'static'), join(tmp, 'static'), { recursive: true });
      mkdirSync(join(tmp, 'tests/fixtures'), { recursive: true });
      cpSync(FIX, join(tmp, 'tests/fixtures/page-baseline'), { recursive: true });
      mkdirSync(join(tmp, 'scripts'), { recursive: true });
      cpSync(
        join(ROOT, 'scripts/discovery-snapshot.tsv'),
        join(tmp, 'scripts/discovery-snapshot.tsv'),
      );
    });
    afterEach(() => rmSync(tmp, { recursive: true, force: true }));
    const mutate = (f: string, fn: (s: string) => string) => {
      const file = join(tmp, f);
      const before = readFileSync(file, 'utf-8');
      const after = fn(before);
      expect(after).not.toBe(before);
      writeFileSync(file, after);
    };

    it('PP3: the untouched copy passes', () => {
      expect(parity(['home', 'about', '--render'], tmp).status).toBe(0);
    });

    it('PP4: deleting one FAQ sentence from static/index.html fails', () => {
      mutate('static/index.html', (s) => {
        const faq = s.slice(s.indexOf('id="faq"'));
        const sentence = /<p>([^<]{40,}?\.)(?:\s|<)/.exec(faq)![1];
        return s.replace(sentence, '');
      });
      const r = parity(['home', '--render'], tmp);
      expect(r.status).toBe(1);
      expect(r.stdout).toContain('PARITY_FAIL home: missing text');
    });

    it('PP5: deleting a link or an element id fails', () => {
      mutate('static/index.html', (s) =>
        s
          .replace('href="/.well-known/mcp.json"', 'href="/.well-known/mcp-v2.json"')
          .replace('id="numbers"', 'id="figures"'),
      );
      const r = parity(['home', '--render'], tmp);
      expect(r.status).toBe(1);
      expect(r.stdout).toContain('PARITY_FAIL home: missing href /.well-known/mcp.json');
      expect(r.stdout).toContain('PARITY_FAIL home: missing id numbers');
    });

    it('PP6: an undeclared removal fails, a declared decoration removal does not', () => {
      mutate('static/privacy.html', (s) => s.replace('Privacy', 'Notice'));
      expect(parity(['privacy', '--render'], tmp).status).toBe(1);
      // the allow-list takes decoration only: the old titlebar text is listed, ordinary words are not
      const allow = readFileSync(join(FIX, 'privacy.allow.txt'), 'utf-8');
      expect(allow).toContain('apibase@prod');
      expect(allow).not.toMatch(/^Privacy$/m);
    });

    it('PP8: a new release tag in the BUILD label passes, a lost BUILD label fails', () => {
      const base = join(tmp, 'tests/fixtures/page-baseline');
      const page = (body: string) =>
        writeFileSync(join(tmp, 'static/about.html'), `<html><body>${body}</body></html>`);
      writeFileSync(join(base, 'about.txt'), 'Stay tuned. BUILD: v1.0.0');
      writeFileSync(join(base, 'about.meta.json'), '{"links":[],"ids":[],"scripts":0}');
      writeFileSync(join(base, 'about.allow.txt'), '');
      page(
        '<p>Stay tuned.</p><span>BUILD: <a href="https://example.test/v1.7.0">v1.7.0</a></span>',
      );
      expect(parity(['about', '--render'], tmp).status).toBe(0);
      page('<p>Stay tuned.</p>');
      expect(parity(['about', '--render'], tmp).status).toBe(1);
    });

    it('PP7: a changed date or count passes, a lost dated sentence fails', () => {
      const base = join(tmp, 'tests/fixtures/page-baseline');
      const page = (body: string) =>
        writeFileSync(join(tmp, 'static/about.html'), `<html><body>${body}</body></html>`);
      writeFileSync(
        join(base, 'about.txt'),
        'Stay tuned. Last synced 2026-10-13 with 1398 tools today.',
      );
      writeFileSync(join(base, 'about.meta.json'), '{"links":[],"ids":[],"scripts":0}');
      writeFileSync(join(base, 'about.allow.txt'), '');
      page('<p>Stay tuned.</p><p>Last synced 2026-10-14 with 1401 tools today.</p>');
      expect(parity(['about', '--render'], tmp).status).toBe(0);
      page('<p>Stay tuned.</p>');
      const r = parity(['about', '--render'], tmp);
      expect(r.status).toBe(1);
      expect(r.stdout).toContain('PARITY_FAIL about: missing text Last synced');
    });

    it('PP9: labelled counts are volatile, a lost "numbers" sentence fails', () => {
      const base = join(tmp, 'tests/fixtures/page-baseline');
      const page = (body: string) =>
        writeFileSync(join(tmp, 'static/about.html'), `<html><body>${body}</body></html>`);
      writeFileSync(
        join(base, 'about.txt'),
        'Stay tuned. Merchants connected so far: 2. The numbers PRV: 404 TOOLS: 1398',
      );
      writeFileSync(join(base, 'about.meta.json'), '{"links":[],"ids":[],"scripts":0}');
      writeFileSync(join(base, 'about.allow.txt'), '');
      page(
        '<p>Stay tuned.</p><p>Merchants connected so far: 1.</p><p>The numbers</p><span>PRV: 405</span> <span>TOOLS: 1405</span>',
      );
      expect(parity(['about', '--render'], tmp).status).toBe(0);
      page('<p>Stay tuned.</p>');
      const r = parity(['about', '--render'], tmp);
      expect(r.status).toBe(1);
      expect(r.stdout).toContain('PARITY_FAIL about: missing text Merchants connected so far:');
    });

    const CARD = /<article class="cat-card"[\s\S]*?<\/article>\n?/g;
    const cardOf = (s: string) => {
      const card = s.match(CARD)![3];
      return {
        card,
        name: /<h3>([^<]+)<\/h3>/.exec(card)![1],
        n: Number(/<b>(\d+)<\/b> tools/.exec(card)![1]),
      };
    };

    it('PP10: a catalog card missing from the grid fails with its name and count', () => {
      const { card, name, n } = cardOf(readFileSync(join(tmp, 'static/catalog.html'), 'utf-8'));
      mutate('static/catalog.html', (s) => s.replace(card, ''));
      const r = parity(['catalog', '--render'], tmp);
      expect(r.status).toBe(1);
      expect(r.stdout).toContain(`PARITY_FAIL catalog: missing provider ${name} ${n}`);
    });

    it('PP11: a catalog card with a wrong tool count fails', () => {
      const { card, name, n } = cardOf(readFileSync(join(tmp, 'static/catalog.html'), 'utf-8'));
      mutate('static/catalog.html', (s) =>
        s.replace(card, card.replace(`<b>${n}</b> tools`, `<b>${n + 1}</b> tools`)),
      );
      const r = parity(['catalog', '--render'], tmp);
      expect(r.status).toBe(1);
      expect(r.stdout).toContain(`PARITY_FAIL catalog: missing provider ${name} ${n}`);
    });

    it('PP12: the untouched catalog copy passes against its own snapshot', () => {
      expect(parity(['catalog', '--render'], tmp).status).toBe(0);
    });
  });
});
