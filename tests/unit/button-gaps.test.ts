/** T-0384b: adjacent buttons always have a gap; the Sea Hunter frame follows the canvas's own ratio. */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const css = readFileSync(join(ROOT, 'static/assets/site-m.css'), 'utf8');
const pages = readdirSync(join(ROOT, 'static')).filter((f) => f.endsWith('.html'));

describe('button gaps (T-0384b)', () => {
  it('site-m.css gives button groups a flex gap and a sibling fallback', () => {
    expect(css).toMatch(/\.btn-row,\.hm-cta\{display:flex;flex-wrap:wrap;gap:12px\}/);
    expect(css).toMatch(/\.btn\+\.btn\{margin-left:12px\}/);
  });

  it('no two .btn siblings in static pages sit outside a gap container', () => {
    for (const f of pages) {
      const html = readFileSync(join(ROOT, 'static', f), 'utf8');
      const re =
        /<([a-z0-9]+)([^>]*)>((?:(?!<\/\1>)[\s\S])*?<(?:a|button)\b[^>]*class="[^"]*\bbtn\b[^"]*"[\s\S]*?<(?:a|button)\b[^>]*class="[^"]*\bbtn\b[^"]*"[\s\S]*?)<\/\1>/g;
      for (const m of html.matchAll(re)) {
        if (m[1] === 'html' || m[1] === 'body' || m[1] === 'main' || m[1] === 'section') continue;
        expect(`${f}: ${m[2]}`).toMatch(/class="[^"]*\b(btn-row|hm-cta)\b/);
      }
    }
  });

  it('the Sea Hunter frame has no fixed aspect ratio and lets the canvas set its height', () => {
    expect(css).not.toMatch(/\.hm-frame\{[^}]*aspect-ratio/);
    expect(css).toMatch(/\.hm-frame canvas\{[^}]*width:100%;height:auto/);
    expect(css).not.toMatch(/\.hm-frame\{[^}]*max-width/);
  });
});
