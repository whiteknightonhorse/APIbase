import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const STATIC = resolve(__dirname, '../../static');
const SITE_STACK =
  "Seravek,'Gill Sans Nova',Ubuntu,Calibri,'DejaVu Sans',source-sans-pro,sans-serif";

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      if (f !== 'assets' && f !== 'video' && f !== 'img') walk(p, out);
    } else if (/\.(html|css)$/.test(f)) out.push(p);
  }
  return out;
}

describe('T-0391a one font stack site-wide', () => {
  it('no page or page stylesheet sets font-family outside site-m.css (except the site stack, inherit, monospace)', () => {
    const bad: string[] = [];
    for (const file of walk(STATIC)) {
      const src = readFileSync(file, 'utf-8');
      for (const m of src.matchAll(/font-family\s*:\s*([^;}]+)/g)) {
        const v = m[1].trim().replace(/\s+/g, '');
        const ok =
          v === 'inherit' ||
          v.includes('var(--mono)') ||
          v.includes('monospace') ||
          v === SITE_STACK.replace(/\s+/g, '');
        if (!ok) bad.push(`${file}: ${m[1].trim()}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('site-m.css spaces the .nav-sub links', () => {
    const css = readFileSync(join(STATIC, 'assets/site-m.css'), 'utf-8');
    expect(css).toMatch(/\.nav-sub\{[^}]*gap:var\(--s2\)\s+var\(--s3\)/);
  });
});
