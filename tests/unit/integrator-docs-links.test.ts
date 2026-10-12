/**
 * T-0317: the merchant guide is published at /integrator/docs and every documentation_url points
 * there (the old /docs/integrator had no route and answered 404).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createIntegratorRouter, INTEGRATOR_DIR } from '../../src/shop/routes/integrator.router';

jest.mock('../../src/config', () => ({ config: {} }));

const ROOT = join(__dirname, '..', '..');

const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};

const files = [
  ...walk(join(ROOT, 'src')),
  ...walk(join(ROOT, 'static')),
  ...walk(join(ROOT, 'scripts', 'shop')),
].filter((f) => /\.(ts|md|html|txt|json)$/.test(f));

let server: ReturnType<express.Express['listen']>;
let base: string;

beforeAll(() => {
  const app = express().use(createIntegratorRouter({ dir: INTEGRATOR_DIR, limit: 10_000 }));
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const get = async (md = false) => {
  const r = await fetch(
    `${base}/integrator/docs`,
    md ? { headers: { accept: 'text/markdown' } } : {},
  );
  return { status: r.status, type: r.headers.get('content-type') ?? '', text: await r.text() };
};

describe('integrator docs page (T-0317)', () => {
  it('D1: serves HTML and Markdown', async () => {
    const html = await get();
    expect(html.status).toBe(200);
    expect(html.type).toMatch(/text\/html/);
    const md = await get(true);
    expect(md.status).toBe(200);
    expect(md.type).toMatch(/text\/markdown/);
    expect(md.text.startsWith('# APIbase Integrator')).toBe(true);
  });

  it('D2: every /integrator/docs#anchor in src and static exists as an id in the page', async () => {
    const anchors = new Set<string>();
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(/\/integrator\/docs#([A-Za-z0-9_-]+)/g)) {
        anchors.add(m[1]);
      }
    }
    expect(anchors.size).toBeGreaterThan(0);
    const html = (await get()).text;
    const missing = [...anchors].filter((a) => !html.includes(`id="${a}"`));
    expect(missing).toEqual([]);
  });

  it('D3: no file in src or static still contains /docs/integrator', () => {
    const bad = files.filter((f) => readFileSync(f, 'utf8').includes('/docs/integrator'));
    expect(bad).toEqual([]);
  });
});
