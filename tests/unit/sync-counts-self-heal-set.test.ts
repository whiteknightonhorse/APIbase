/** T-0687: every file home-facts.py checks must be rewritten by its render, after site-facts.json is regenerated. */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const py = (code: string, cwd: string) =>
  spawnSync('python3', ['-I', '-c', code], { cwd, encoding: 'utf8', timeout: 60000 });

describe('sync-counts self-heal covers everything the check side compares', () => {
  it('every generator write path is in the cron FILES as printed by its own derivation (T-0697)', () => {
    const r = spawnSync('bash', ['scripts/sync-counts-cron.sh', '--print-files'], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 60000,
    });
    expect(r.status).toBe(0);
    const files = new Set(r.stdout.split('\n').filter(Boolean));
    const py1 = py(
      `import sys,json,importlib.util as u
def L(n,p):
    s=u.spec_from_file_location(n,p); m=u.module_from_spec(s); s.loader.exec_module(m); return m
h=L('hf','scripts/home-facts.py'); i=L('itf','scripts/integrator-facts.py')
print(json.dumps(sorted(set(h.FILES+h.BAR_PAGES+h.BAR_PRICE_ONLY+[h.INTEGRATOR_BAR]+i.RENDERED+list(i.TOKEN_FILES)+i.HOME_FILES))))`,
      ROOT,
    );
    expect(py1.status).toBe(0);
    const declared: string[] = JSON.parse(py1.stdout);
    // gen-discovery.ts: every static/ literal that is a write target (literal or via a resolved variable).
    const src = readFileSync(join(ROOT, 'scripts/gen-discovery.ts'), 'utf8');
    const vars = new Map<string, string>();
    for (const m of src.matchAll(/(\w+)\s*=\s*resolve\(ROOT,\s*'(static\/[^']+)'\)/g))
      vars.set(m[1], m[2]);
    const gen: string[] = [];
    for (const c of src.matchAll(/write(?:Text|Json)IfChanged\(\s*([^\n]*\n?[^\n]*)/g)) {
      const lit = /resolve\(ROOT,\s*'(static\/[^']+)'\)/.exec(c[1]);
      const rel = /resolve\((\w+),\s*'([^']+)'\)/.exec(c[1]);
      const id = /^(\w+)\s*,/.exec(c[1].trim());
      if (lit) gen.push(lit[1]);
      else if (rel && vars.has(rel[1])) gen.push(`${vars.get(rel[1])}/${rel[2]}`);
      else if (id && vars.has(id[1])) gen.push(vars.get(id[1]) as string);
    }
    expect(gen).toEqual(expect.arrayContaining(['static/.well-known/mcp.json']));
    expect(declared).toContain('static/pricing.md');
    for (const p of [...declared, ...gen]) expect([p, files.has(p)]).toEqual([p, true]);
  });

  it('sync-counts.sh renders home facts again after gen-site-facts.ts', () => {
    const s = readFileSync(join(ROOT, 'scripts/sync-counts.sh'), 'utf8');
    const gen = s.indexOf('npx tsx scripts/gen-site-facts.ts > /tmp');
    const last = s.lastIndexOf('python3 scripts/home-facts.py render');
    const first = s.indexOf('python3 scripts/home-facts.py render');
    expect(gen).toBeGreaterThan(0);
    expect(first).toBeLessThan(gen);
    expect(last).toBeGreaterThan(gen);
  });

  it('render after a site-facts change makes pricing.html pass check and check-bar again', () => {
    const dir = mkdtempSync(join(tmpdir(), 'scc-heal-'));
    try {
      const files = [
        'scripts/home-facts.py',
        'static/.well-known/mcp.json',
        'static/.well-known/site-facts.json',
        'static/pricing.html',
        'static/index.html',
        'static/terms.html',
        'static/privacy.html',
        'static/contact.html',
        'static/policy-moderation.html',
        'static/integrator/index.html',
      ];
      for (const f of files) {
        mkdirSync(dirname(join(dir, f)), { recursive: true });
        cpSync(join(ROOT, f), join(dir, f));
      }
      const sfp = join(dir, 'static/.well-known/site-facts.json');
      const sf = JSON.parse(readFileSync(sfp, 'utf8'));
      sf.tiers.micro.count += 5;
      sf.tiers.standard.count -= 5;
      writeFileSync(sfp, JSON.stringify(sf));
      const before = readFileSync(join(dir, 'static/pricing.html'), 'utf8');
      const stale = spawnSync('python3', ['scripts/home-facts.py', 'check-bar'], {
        cwd: dir,
        encoding: 'utf8',
      });
      expect(stale.status).toBe(1);
      expect(stale.stdout).toContain('static/pricing.html');
      expect(spawnSync('python3', ['scripts/home-facts.py', 'render'], { cwd: dir }).status).toBe(
        0,
      );
      expect(readFileSync(join(dir, 'static/pricing.html'), 'utf8')).not.toBe(before);
      for (const c of ['check', 'check-bar']) {
        expect(
          spawnSync('python3', ['scripts/home-facts.py', c], { cwd: dir, encoding: 'utf8' }).status,
        ).toBe(0);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
