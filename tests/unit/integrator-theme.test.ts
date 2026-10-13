/** T-INT-34 TD1-TD7. The /integrator theme is a byte copy of the homepage <style>; T-0383: both also share static/assets/site-m.css. */
import express from 'express';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createIntegratorRouter, PLATFORMS } from '../../src/shop/routes/integrator.router';

jest.mock('../../src/config', () => ({ config: {} }));

const ROOT = resolve(__dirname, '../..');
const DIR = resolve(ROOT, 'static/integrator');
const rd = (p: string) => readFileSync(p, 'utf-8');
const HEX = /#[0-9a-f]{3,8}/gi;

const PAGES = [
  '/integrator',
  '/integrator/agent-guide',
  '/integrator/buyers',
  '/integrator/wallet',
  '/integrator/why-base-tempo',
  '/integrator/connect',
  ...PLATFORMS.map((p) => `/integrator/platforms/${p}`),
];

let server: ReturnType<express.Express['listen']>;
let base: string;
beforeAll(() => {
  const app = express();
  app.use(createIntegratorRouter({ limit: 10_000 }));
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());
const get = async (path: string) => (await fetch(`${base}${path}`)).text();

describe('integrator terminal theme', () => {
  it('TD1: _theme.css is the homepage <style> text, byte for byte', () => {
    const home = rd(resolve(ROOT, 'static/index.html'));
    const css = home.slice(home.indexOf('<style>') + 7, home.indexOf('</style>'));
    expect(rd(resolve(DIR, '_theme.css')).trim()).toBe(css.trim());
  });

  it('TD2: every hex colour of _page.css exists in _theme.css or site-m.css', () => {
    const theme = new Set(
      (rd(resolve(DIR, '_theme.css')) + rd(resolve(ROOT, 'static/assets/site-m.css')))
        .match(HEX)!
        .map((h) => h.toLowerCase()),
    );
    const page = (rd(resolve(DIR, '_page.css')).match(HEX) ?? []).map((h) => h.toLowerCase());
    expect(page.length).toBeGreaterThan(0);
    // T-0376: the human-first landing (.lp) has its own neutral palette from the design reference.
    const landing = new Set([
      '#0b0b0b',
      '#111',
      '#222',
      '#f2f2f2',
      '#9a9a9a',
      '#00ff41',
      '#0c0c0c',
    ]);
    expect(page.filter((h) => !theme.has(h) && !landing.has(h))).toEqual([]);
  });

  it('TD3: every page wears the design-M shell and no foreign style or font', async () => {
    const home = rd(resolve(ROOT, 'static/index.html'));
    const shared = /<link rel="stylesheet" href="\/assets\/site-m\.css\?v=[0-9a-f]{8}">/.exec(
      home,
    )![0];
    for (const p of PAGES) {
      const t = await get(p);
      for (const needle of [
        '<div class="page-shell">',
        '<!--site-nav-->',
        shared, // same theme source as the homepage: one versioned stylesheet
        '<nav class="nav-sub"',
        "font-family:Seravek,'Gill Sans Nova'",
        '<div class="footer">',
        '<footer class="site-footer">',
      ]) {
        expect([p, t.includes(needle)]).toEqual([p, true]);
      }
      for (const bad of [
        '<div class="window">',
        '<div class="titlebar">',
        'titlebar',
        'text-shadow',
        'JetBrains',
        'ui-monospace',
        '#4cc2ff',
        '#0b0e11',
        'fonts.googleapis',
      ]) {
        expect([p, t.includes(bad)]).toEqual([p, false]);
      }
      expect([p, t.replace(shared, '').includes('<link rel="stylesheet"')]).toEqual([p, false]);
    }
  });

  it('TD4: /integrator monitor line, two buttons, one MERCHANTS_COUNT token', async () => {
    const t = await get('/integrator');
    expect(t).toContain('class="sys-monitor"');
    expect(t).not.toContain('{{');
    expect(t.match(/<a class="btn/g)).toHaveLength(2);
    const demo = /<section id="demo-shop">([\s\S]*?)<\/section>/.exec(t)![1];
    expect(demo).not.toContain('class="btn');
    const tpl = rd(resolve(DIR, 'index.html'));
    expect(tpl.split('{{MERCHANTS_COUNT}}')).toHaveLength(2);
  });

  it('TD5: _page.css honours prefers-reduced-motion', () => {
    expect(rd(resolve(DIR, '_page.css'))).toContain('prefers-reduced-motion');
  });

  it('TD6: no Cyrillic in the integrator files', () => {
    let out = '';
    try {
      out = execSync(
        "grep -rnP '[\\x{0400}-\\x{04FF}]' static/integrator src/shop/integrator src/shop/routes/integrator.router.ts",
        { cwd: ROOT, encoding: 'utf-8', env: { ...process.env, LC_ALL: 'C.UTF-8' } },
      );
    } catch (e) {
      expect((e as { status?: number }).status).toBe(1);
    }
    expect(out).toBe('');
  });

  it('TD7: _page.css is at most 140 lines', () => {
    // T-0381: room for the human landing/sign-up/storefront styles (T-0376..0378)
    expect(rd(resolve(DIR, '_page.css')).trimEnd().split('\n').length).toBeLessThanOrEqual(140);
  });
});
