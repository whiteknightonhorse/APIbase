/** T-INT-15 PG5 (nginx parity), PG6 (shop sitemap shards), PG11 (/catalog links /shops). No DB. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const locations = (conf: string) =>
  new Set([...conf.matchAll(/^\s*location\s+(?:=\s*)?(\/\S*)\s*\{/gm)].map((m) => m[1]));
const PATHS = ['/m/', '/shops', '/legal', '/integrator'];

describe('PG5 nginx locations', () => {
  const host = locations(read('nginx/apibase-host.conf'));
  const container = locations(read('nginx/nginx.conf'));
  it('both files carry the four locations (parity)', () => {
    for (const p of PATHS) {
      expect([p, host.has(p)]).toEqual([p, true]);
      expect([p, container.has(p)]).toEqual([p, true]);
    }
  });
  it('the container proxies them to the api backend like /api/', () => {
    const conf = read('nginx/nginx.conf');
    for (const p of PATHS) {
      const re = new RegExp(
        `location ${p.replace('/', '\\/')} \\{[^}]*proxy_pass http://api_backend;`,
      );
      expect([p, re.test(conf)]).toEqual([p, true]);
    }
  });
  it('the mount-nginx parity script is green', () => {
    execFileSync('python3', ['scripts/check-mount-nginx-parity.py'], { cwd: ROOT });
  });
});

describe('PG6 shop sitemap shards', () => {
  it('10 001 shops -> shard 1 (10 000) + shard 2 (1), index lists both, no /p/ or /cart', () => {
    const dir = mkdtempSync(join(tmpdir(), 'shopmap-'));
    const slugs = join(dir, 'slugs.txt');
    writeFileSync(slugs, Array.from({ length: 10001 }, (_, i) => `shop-${i}\n`).join(''));
    execFileSync('bash', ['scripts/gen-sitemap.sh', '--shops'], {
      cwd: ROOT,
      env: { ...process.env, ROOT, SITEMAP_DIR: dir, SHOP_SLUGS_FILE: slugs },
    });
    const count = (f: string) => (readFileSync(join(dir, f), 'utf8').match(/<loc>/g) ?? []).length;
    expect(count('sitemap-shops-1.xml')).toBe(10000);
    expect(count('sitemap-shops-2.xml')).toBe(1);
    expect(readdirSync(dir).filter((f) => f.startsWith('sitemap-shops-')).length).toBe(3);
    const index = readFileSync(join(dir, 'sitemap-shops-index.xml'), 'utf8');
    expect(index).toContain('https://apibase.pro/sitemap-shops-1.xml');
    expect(index).toContain('https://apibase.pro/sitemap-shops-2.xml');
    const all =
      readFileSync(join(dir, 'sitemap-shops-1.xml'), 'utf8') +
      readFileSync(join(dir, 'sitemap-shops-2.xml'), 'utf8');
    expect(all).toContain('<loc>https://apibase.pro/m/shop-10000</loc>');
    expect(all).not.toMatch(/\/p\/|\/cart/);
  });
});

describe('PG11 /catalog', () => {
  it('has a Shops section linking /shops (page and generator)', () => {
    expect(read('static/catalog.html')).toMatch(/<h2>Shops<\/h2>[\s\S]*href="\/shops"/);
    expect(read('scripts/gen-catalog-page.ts')).toMatch(/<h2>Shops<\/h2>[\s\S]*href="\/shops"/);
  });
});
