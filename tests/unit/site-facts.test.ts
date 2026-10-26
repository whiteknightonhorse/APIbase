/**
 * T-0542: scripts/gen-site-facts.ts and scripts/site-facts.py.
 * The generator is byte-stable and refuses a manual fact whose anchor left the source; the checker
 * reports one STALE_SITE_FACTS line per failing claim row and exits 1 on any.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const PY = join(ROOT, 'scripts', 'site-facts.py');
const GEN = join(ROOT, 'scripts', 'gen-site-facts.ts');

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'site-facts-'));
  dirs.push(d);
  return d;
}

function put(root: string, rel: string, text: string): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
}

function py(root: string): { status: number | null; out: string } {
  const r = spawnSync('python3', ['-I', PY, 'check', '--root', root], { encoding: 'utf8' });
  return { status: r.status, out: r.stdout + r.stderr };
}

const HDR = 'surface\turl\tkind\tpattern\texpect\tfinding\n';
const FACTS = {
  version: '2.2.0',
  tiers: { standard: { count: 24 } },
  example_tools: { 'sabre.search_flights': 'healthy', 'amadeus.flight_search': 'unavailable' },
};

function fixture(rows: string[], pages: Record<string, string>): string {
  const root = tmp();
  put(root, 'static/.well-known/site-facts.json', JSON.stringify(FACTS));
  put(root, 'config/site-claims.tsv', HDR + rows.join('\n') + '\n');
  for (const [p, t] of Object.entries(pages)) put(root, p, t);
  return root;
}

const row = (s: string, kind: string, pat: string, exp: string, f: string): string =>
  [s, 'https://example.invalid/', kind, pat, exp, f].join('\t');

describe('gen-site-facts.ts', () => {
  it('--check is byte-stable against the committed static/.well-known/site-facts.json', () => {
    const r = spawnSync('npx', ['tsx', GEN, '--check'], { cwd: ROOT, encoding: 'utf8' });
    expect(r.stderr).not.toContain('DRIFT');
    expect(r.status).toBe(0);
  }, 180_000);

  it('fails and names the fact when a manual anchor is missing from its source', () => {
    const root = tmp();
    cpSync(
      join(ROOT, 'config', 'site-facts.manual.json'),
      join(root, 'config', 'site-facts.manual.json'),
      {
        recursive: true,
      },
    );
    for (const rel of [
      'src/pipeline/stages/escrow-finalize.stage.ts',
      'src/pipeline/stages/idempotency.stage.ts',
      'src/services/tool-registry.service.ts',
    ]) {
      put(root, rel, readFileSync(join(ROOT, rel), 'utf8'));
    }
    const efs = join(root, 'src/pipeline/stages/escrow-finalize.stage.ts');
    writeFileSync(efs, readFileSync(efs, 'utf8').split('MANUALLY by the operator').join('by hand'));
    const r = spawnSync('npx', ['tsx', GEN, '--check'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, SITE_FACTS_ROOT: root },
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('refund_on_provider_failure.mpp');
    expect(r.stderr).toContain('anchor not found');
  }, 180_000);
});

describe('site-facts.py check', () => {
  it('one bad row gives exactly one STALE line and exit 1; the fixed row gives 0', () => {
    const rows = [
      row('a.html', 'regex-equals', 'BUILD v([0-9.]+)', '{{version}}', 'APIBASE-028'),
      row('b.md', 'must-not-contain', 'never billed', '-', 'APIBASE-001'),
    ];
    const bad = fixture(rows, { 'a.html': 'BUILD v1.7.0', 'b.md': 'all fine' });
    const r = py(bad);
    const stale = r.out.split('\n').filter((l) => l.startsWith('STALE_SITE_FACTS'));
    expect(stale).toEqual(['STALE_SITE_FACTS APIBASE-028 a.html: expected 2.2.0 got 1.7.0']);
    expect(r.out).toContain('site-facts: 1 failures');
    expect(r.status).toBe(1);

    const good = fixture(rows, { 'a.html': 'BUILD v2.2.0', 'b.md': 'all fine' });
    const g = py(good);
    expect(g.out).toContain('site-facts: 0 failures');
    expect(g.status).toBe(0);
  });

  it('tool-ids-healthy fires on an unavailable id and passes on a healthy one', () => {
    const rows = [row('p.md', 'tool-ids-healthy', '-', '-', 'APIBASE-017')];
    const bad = py(fixture(rows, { 'p.md': 'use `amadeus.flight_search` for flights' }));
    expect(bad.status).toBe(1);
    expect(bad.out).toContain(
      'STALE_SITE_FACTS APIBASE-017 p.md: expected every example tool id healthy got amadeus.flight_search=unavailable',
    );
    const good = py(fixture(rows, { 'p.md': 'use `sabre.search_flights` for flights' }));
    expect(good.status).toBe(0);
  });

  it('a claims row whose surface file is missing is a failure, not a skip', () => {
    const r = py(fixture([row('gone.md', 'must-contain', 'x', '-', 'F-99')], {}));
    expect(r.status).toBe(1);
    expect(r.out).toContain(
      'STALE_SITE_FACTS F-99 gone.md: expected surface file in the tree got missing',
    );
  });

  it('a token with no source fails loud and a numeric token compares equal', () => {
    const rows = [
      row(
        'w.html',
        'regex-equals',
        'appeal within (\\d+) days',
        '{{moderation.appeal_window_days}}',
        'APIBASE-023',
      ),
      row('w.html', 'regex-equals', '(\\d+) standard', '{{tiers.standard.count}}', 'APIBASE-015'),
    ];
    const r = py(fixture(rows, { 'w.html': 'appeal within 7 days; 24 standard' }));
    const stale = r.out.split('\n').filter((l) => l.startsWith('STALE_SITE_FACTS'));
    expect(stale).toHaveLength(1);
    expect(stale[0]).toContain('APIBASE-023');
    expect(stale[0]).toContain('no source');
  });
});
