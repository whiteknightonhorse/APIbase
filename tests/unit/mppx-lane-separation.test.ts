/**
 * T-0426 (ruling-2 B): two mppx lanes. The charge lane runs on `mppx` (0.15.x since T-0566); the
 * stream lane stays byte-identical on the alias `mppx-legacy` (npm:mppx@0.8.2). No import crosses lanes.
 * T-0566 T5: every settle stays on the legacy lane (root mppx 0.14+ settle() is out of scope).
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
    expect(pkg.dependencies['mppx']).toMatch(/^\^0\.15\./);
  });
});

/** Every .ts file under src/ and packages/<name>/src (declaration files included). */
function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const r = path.join(rel, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'node_modules' && e.name !== 'dist') walk(r);
      } else if (e.name.endsWith('.ts')) out.push(r);
    }
  };
  walk('src');
  for (const p of fs.readdirSync(path.join(root, 'packages'))) {
    if (fs.existsSync(path.join(root, 'packages', p, 'src'))) walk(path.join('packages', p, 'src'));
  }
  return out;
}

const isRootMppx = (s: string) => s === 'mppx' || s.startsWith('mppx/');
const isLegacy = (s: string) => s === 'mppx-legacy' || s.startsWith('mppx-legacy/');
const SETTLE_MARKERS = ['settle(', 'settleOnChain', 'sessionLegacy', 'ChannelStore'];

/** Code without comments, plus the root-mppx ambient module bodies of a .d.ts as "imports". */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
function rootMppxSections(file: string, src: string): string[] {
  const code = stripComments(src);
  const sections: string[] = [];
  if (specifiers(src).some(isRootMppx)) sections.push(code);
  if (file.endsWith('.d.ts')) {
    // declare module 'mppx/server' { ... } up to the next top-level declare module
    for (const m of code.matchAll(
      /declare module '(mppx(?:\/[^']*)?)' \{([\s\S]*?)(?=\ndeclare module |$)/g,
    )) {
      sections.push(m[2]);
    }
  }
  return sections;
}

describe('T-0566 T5: settle stays out of the root mppx lane', () => {
  const files = sourceFiles();

  it('the scan sees the known lane files', () => {
    expect(files).toContain('src/middleware/mpp.middleware.ts');
    expect(files).toContain('packages/stream-settler/src/settler.ts');
    expect(files).toContain('src/types/mppx.d.ts');
  });

  it('no file importing or declaring root mppx contains settle(/settleOnChain/sessionLegacy/ChannelStore', () => {
    const offenders: string[] = [];
    for (const f of files) {
      for (const section of rootMppxSections(f, read(f))) {
        for (const m of SETTLE_MARKERS) if (section.includes(m)) offenders.push(`${f}: ${m}`);
      }
    }
    expect(offenders).toEqual([]);
    // T-0655: the upstream payer signs a provider's Tempo charge (client side, no settle code).
    expect(files.filter((f) => specifiers(read(f)).some(isRootMppx))).toEqual([
      'src/middleware/mpp.middleware.ts',
      'src/payments/upstream-payer.ts',
    ]);
  });

  it('every file with a settle marker that imports mppx imports only mppx-legacy', () => {
    const settleFiles = files.filter((f) => {
      const code = stripComments(read(f));
      return SETTLE_MARKERS.some((m) => code.includes(m));
    });
    const mppxSettleFiles = settleFiles.filter((f) =>
      specifiers(read(f)).some((s) => isRootMppx(s) || isLegacy(s)),
    );
    // the two known settle call sites (stream.service.ts:474, stream-settler settler.ts:218)
    expect(mppxSettleFiles).toEqual(
      expect.arrayContaining([
        'src/shop/stream.service.ts',
        'packages/stream-settler/src/settler.ts',
      ]),
    );
    for (const f of mppxSettleFiles) {
      const specs = specifiers(read(f)).filter((s) => isRootMppx(s) || isLegacy(s));
      expect({ f, specs: specs.filter((s) => !isLegacy(s)) }).toEqual({ f, specs: [] });
    }
  });
});
