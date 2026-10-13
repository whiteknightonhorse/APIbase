/** T-0342: main sitemap covers app-served pages; sync-counts --check verifies robots.txt Sitemap URLs. */
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const run = (script: string, args: string[], env: Record<string, string> = {}) =>
  spawnSync('bash', [join(ROOT, 'scripts', script), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ROOT, ...env },
  });

describe('gen-sitemap.sh --print', () => {
  const out = run('gen-sitemap.sh', ['--print']).stdout;
  const locs = [...out.matchAll(/<loc>https:\/\/apibase\.pro([^<]*)<\/loc>/g)].map((m) => m[1]);

  it.each(['/integrator', '/integrator/docs', '/legal/aup', '/shops', '/video/'])(
    'lists %s',
    (p) => {
      expect(locs).toContain(p);
    },
  );

  it.each(['/integrator/connect', '/autopilot/incident'])('omits noindex %s', (p) => {
    expect(locs).not.toContain(p);
  });

  it('omits /m/ pages and has no duplicates', () => {
    expect(locs.filter((l) => l.startsWith('/m/'))).toEqual([]);
    expect(new Set(locs).size).toBe(locs.length);
  });
});

describe('sync-counts.sh --check robots sitemap fetch', () => {
  it('fails with ROBOTS_SITEMAP_404 when a stubbed fetch returns 404', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sitemap-stub-'));
    const stub = join(dir, 'fetch404.sh');
    writeFileSync(stub, '#!/bin/sh\necho 404\n');
    chmodSync(stub, 0o755);
    const r = run('sync-counts.sh', ['--check'], { SITEMAP_FETCH_CMD: stub });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('ROBOTS_SITEMAP_404');
  }, 120_000);
});
