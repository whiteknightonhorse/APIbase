/** T-INT-15 PG5 (nginx parity), PG11 (/catalog links /shops). No DB. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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
  it('T-0295 /about is served from static/about.html like /partners (host `location /` already proxies it)', () => {
    const conf = read('nginx/nginx.conf');
    expect(container.has('/about')).toBe(true);
    expect(host.has('/about')).toBe(false);
    expect(conf).toMatch(
      /location = \/about \{\s*root \/var\/www\/static;\s*try_files \/about\.html =404;\s*\}/,
    );
  });
  it('the mount-nginx parity script is green', () => {
    execFileSync('python3', ['scripts/check-mount-nginx-parity.py'], { cwd: ROOT });
  });
});

describe('PG11 /catalog', () => {
  it('has a Shops section linking /shops (page and generator)', () => {
    expect(read('static/catalog.html')).toMatch(/<h2>Shops<\/h2>[\s\S]*href="\/shops"/);
    expect(read('scripts/gen-catalog-page.ts')).toMatch(/<h2>Shops<\/h2>[\s\S]*href="\/shops"/);
  });
});

describe('T-0860 demo shop domain proof', () => {
  it('static/.well-known/apibase-merchant.txt is exactly the demo slug', () => {
    expect(read('static/.well-known/apibase-merchant.txt')).toBe('apibase-demo\n');
  });
  it('nginx serves it as plain text before the generic .well-known prefix block', () => {
    const conf = read('nginx/nginx.conf');
    const exact = conf.indexOf('location = /.well-known/apibase-merchant.txt');
    expect(exact).toBeGreaterThan(-1);
    expect(exact).toBeLessThan(conf.indexOf('location /.well-known/ {'));
    expect(conf).toMatch(
      /location = \/\.well-known\/apibase-merchant\.txt \{\s*root \/var\/www\/static;\s*default_type text\/plain;\s*\}/,
    );
  });
  it('the docs state how to verify, once', () => {
    expect(read('static/integrator/docs.md')).toContain('**Domain verification.**');
    expect(read('static/integrator/index.md')).toContain(
      'How to verify: /integrator/docs (Domain verification).',
    );
  });
});
