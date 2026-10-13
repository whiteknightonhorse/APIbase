import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const footer = readFileSync(resolve(ROOT, 'config/page-footer.html'), 'utf-8');
const css = readFileSync(resolve(ROOT, 'static/assets/site-m.css'), 'utf-8');

describe('T-0399 footer column headings', () => {
  const navs = [...footer.matchAll(/<nav aria-label="([^"]+)">(.*?)<\/nav>/g)];

  it('has four columns whose heading is the same element and class', () => {
    expect(navs.map((m) => m[1])).toEqual(['For agents', 'For merchants', 'Company', 'Legal']);
    for (const m of navs) {
      expect(m[2].startsWith('<div class="sf-h">')).toBe(true);
    }
  });

  it('no heading carries its own font-size or style', () => {
    for (const m of navs) {
      const heading = m[2].slice(0, m[2].indexOf('</div>'));
      expect(heading).not.toMatch(/style=|font-size/);
    }
  });

  it('a link inside a heading inherits size and drops link padding/height', () => {
    const rule = css.match(/\.site-footer nav \.sf-h a\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/font:inherit/);
    expect(rule![1]).toMatch(/min-height:0/);
    expect(rule![1]).toMatch(/padding:0/);
  });
});
