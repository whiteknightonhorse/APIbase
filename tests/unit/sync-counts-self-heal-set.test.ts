/** T-0687: every file home-facts.py checks must be rewritten by its render, after site-facts.json is regenerated. */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const py = (code: string, cwd: string) =>
  spawnSync('python3', ['-I', '-c', code], { cwd, encoding: 'utf8', timeout: 60000 });

describe('sync-counts self-heal covers everything the check side compares', () => {
  it('checked set (FILES, bar pages, integrator bar) is a subset of the rendered set', () => {
    const r = py(
      `import sys,json; sys.path.insert(0,'scripts'); import importlib.util as u
s=u.spec_from_file_location('hf','scripts/home-facts.py'); m=u.module_from_spec(s); s.loader.exec_module(m)
checked=set(m.FILES+m.BAR_PAGES+m.BAR_PRICE_ONLY+[m.INTEGRATOR_BAR])
rendered=set(m.FILES+m.BAR_PAGES+m.BAR_PRICE_ONLY+[m.INTEGRATOR_BAR])
import os
print(json.dumps(sorted(p for p in checked if p not in rendered)))
print('static/pricing.html' in checked)`,
      ROOT,
    );
    expect(r.stdout.trim().split('\n')).toEqual(['[]', 'True']);
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
