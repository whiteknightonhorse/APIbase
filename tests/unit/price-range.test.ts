/** T-0341: one generated price range and one generated header bar. */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPriceRange, formatUsd } from '../../scripts/price-range';

const ROOT = join(__dirname, '../..');

const FIXTURE = [
  'a.free\tp1\t0',
  'a.one\tp1\t0.0005',
  'a.two\tp1\t0.001',
  'b.one\tp2\t0.001',
  'b.two\tp2\t0.002',
  'b.three\tp2\t0.002',
  'c.one\tp3\t0.003',
  'c.two\tp3\t0.003',
  'c.three\tp3\t0.004',
  'c.four\tp3\t0.005',
  'd.big\tp4\t29.99',
].join('\n');

describe('buildPriceRange', () => {
  it('min over priced tools, max over all, nearest-rank p90 over priced tools', () => {
    const r = buildPriceRange(FIXTURE);
    expect(r.min).toBe(0.0005);
    expect(r.max).toBe(29.99);
    expect(r.p90).toBe(0.005); // 10 priced tools, rank ceil(9) = 9
    expect(r.text).toBe('$0.0005–$29.99 per call (90% of tools <= $0.005)');
  });
  it('formats with at least two decimals and no trailing zeros', () => {
    expect(formatUsd(1)).toBe('1.00');
    expect(formatUsd(0.001)).toBe('0.001');
    expect(formatUsd(29.99)).toBe('29.99');
  });
  it('rejects a snapshot without a price column', () => {
    expect(() => buildPriceRange('a.b\tp1')).toThrow(/bad price/);
  });
  it('the committed snapshot yields exactly what mcp.json carries', () => {
    const snap = readFileSync(join(ROOT, 'scripts/discovery-snapshot.tsv'), 'utf8');
    const mcp = JSON.parse(readFileSync(join(ROOT, 'static/.well-known/mcp.json'), 'utf8'));
    expect(mcp.price_range_usd).toEqual(buildPriceRange(snap));
  });
});

describe('header bar and range checks (mutation)', () => {
  const run = (cwd: string, cmd: string) =>
    spawnSync('python3', [join(ROOT, 'scripts/home-facts.py'), cmd], { cwd, encoding: 'utf8' });

  it('check-bar / check-range are green on the tree and red on a hand-edited bar', () => {
    expect(run(ROOT, 'check-bar').status).toBe(0);
    expect(run(ROOT, 'check-range').status).toBe(0);

    const dir = mkdtempSync(join(tmpdir(), 'bar-'));
    cpSync(join(ROOT, 'static'), join(dir, 'static'), { recursive: true });
    const terms = join(dir, 'static/terms.html');
    const html = readFileSync(terms, 'utf8');
    const mcp = JSON.parse(readFileSync(join(ROOT, 'static/.well-known/mcp.json'), 'utf8'));
    const bar = mcp.price_range_usd.text.replace('<', '&lt;');
    expect(html).toContain(bar);
    writeFileSync(terms, html.replace(bar, '$0.001–$1.00'));
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    const bad = run(dir, 'check-bar');
    expect(bad.status).toBe(1);
    expect(bad.stdout).toContain('static/terms.html');
    expect(run(dir, 'check-range').status).toBe(1);
  });
});
