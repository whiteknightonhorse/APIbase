/**
 * T-0426 (ruling-2 B): two mppx lanes. The charge lane runs on `mppx` (0.13.x); the stream lane
 * stays byte-identical on the alias `mppx-legacy` (npm:mppx@0.8.2). No import crosses lanes.
 */
import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../..');
const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf8');

const STREAM_LANE = [
  'src/shop/stream-session.ts',
  'src/shop/mppx-legacy.ts',
  'src/shop/stream.service.ts',
  'src/shop/stream-merchant.service.ts',
  'scripts/shop/probe-tip1034-payee.ts',
  'packages/stream-settler/src/settler.ts',
  'tests/unit/helpers/shop-stream-merchant-real-mppx.child.ts',
];

/** Module specifiers named in import()/require()/resolve()/from clauses (comments excluded). */
function specifiers(src: string): string[] {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  return [...code.matchAll(/(?:import\(|require\(|resolve\(|from\s+)\s*['"]([^'"]+)['"]/g)].map(
    (m) => m[1],
  );
}

describe('mppx lane separation (T-0426)', () => {
  it.each(STREAM_LANE)('%s imports only mppx-legacy, never mppx', (file) => {
    const specs = specifiers(read(file)).filter(
      (s) => s === 'mppx' || s.startsWith('mppx/') || s.startsWith('mppx-legacy'),
    );
    expect(specs.length).toBeGreaterThan(0);
    for (const s of specs) expect(s.startsWith('mppx-legacy')).toBe(true);
  });

  it('the charge lane (mpp.middleware.ts) never imports mppx-legacy', () => {
    const src = read('src/middleware/mpp.middleware.ts');
    expect(specifiers(src).some((s) => s.startsWith('mppx-legacy'))).toBe(false);
    expect(src).not.toContain('sessionLegacy');
  });

  it('package.json pins the alias to the exact 0.8.2', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.dependencies['mppx-legacy']).toBe('npm:mppx@0.8.2');
    expect(pkg.dependencies['mppx']).toMatch(/^\^0\.13\./);
  });
});
