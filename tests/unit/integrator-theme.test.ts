/** T-INT-34 TD1-TD7. The /integrator theme is a byte copy of the homepage <style>. */
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

  it('TD2: every hex colour of _page.css exists in _theme.css', () => {
    const theme = new Set(
      (rd(resolve(DIR, '_theme.css')).match(HEX) ?? []).map((h) => h.toLowerCase()),
    );
    const page = (rd(resolve(DIR, '_page.css')).match(HEX) ?? []).map((h) => h.toLowerCase());
    expect(page.length).toBeGreaterThan(0);
    expect(page.filter((h) => !theme.has(h))).toEqual([]);
  });

  it('TD3: every page wears the terminal shell and no foreign style or font', async () => {
    for (const p of PAGES) {
      const t = await get(p);
      for (const needle of [
        '<div class="window">',
        '<div class="titlebar">',
        '<nav><a class="brand"',
        "font-family:'JetBrains Mono','Fira Code','Cascadia Code','Courier New',monospace",
        '<div class="footer">',
      ]) {
        expect([p, t.includes(needle)]).toEqual([p, true]);
      }
      for (const bad of [
        'ui-monospace',
        '#4cc2ff',
        '#0b0e11',
        'fonts.googleapis',
        '<link rel="stylesheet"',
      ]) {
        expect([p, t.includes(bad)]).toEqual([p, false]);
      }
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

  it('TD7: _page.css is at most 110 lines', () => {
    expect(rd(resolve(DIR, '_page.css')).trimEnd().split('\n').length).toBeLessThanOrEqual(110);
  });
});
