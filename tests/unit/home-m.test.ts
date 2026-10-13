/** T-0384: home page in design M keeps the Sea Hunter widget wired and the new hero pieces in place. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const html = readFileSync(join(ROOT, 'static/index.html'), 'utf8');
const idsOf = (s: string) => new Set([...s.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const widget = /<!--sea-js--><script>([\s\S]*?)<\/script><!--\/sea-js-->/.exec(html)![1];

describe('home design M (T-0384)', () => {
  it('the Sea Hunter markup keeps its ids, the JSON link and sits in a 16:9 frame', () => {
    const ids = idsOf(html);
    for (const id of ['sh-cv', 'sh-txt', 'sh-pause']) expect(ids.has(id)).toBe(true);
    expect(html).toContain('<a href="/api/v1/fleet/sea">Fleet data (JSON)</a>');
    expect(html).toMatch(/<div class="hm-frame">\s*<canvas id="sh-cv"/);
    const css = readFileSync(join(ROOT, 'static/assets/site-m.css'), 'utf8');
    expect(css).toMatch(/\.hm-frame\{[^}]*aspect-ratio:16\/9/);
  });

  it('the inline widget script parses and finds its elements on the page ids', () => {
    expect(() => new Function(widget)).not.toThrow();
    const ids = idsOf(html);
    const asked: string[] = [];
    const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
    const el = { getContext: () => ctx, addEventListener: () => undefined, clientWidth: 640 };
    const doc = {
      getElementById: (id: string) => {
        asked.push(id);
        return ids.has(id) ? el : null;
      },
      readyState: 'complete',
      addEventListener: () => undefined,
      createElement: () => el,
    };
    const never = () => new Promise(() => undefined);
    new Function('document', 'window', 'fetch', 'requestAnimationFrame', widget)(
      doc,
      {},
      never,
      () => 0,
    );
    expect(asked.sort()).toEqual(['sh-cv', 'sh-pause', 'sh-txt']);
    expect(asked.every((id) => ids.has(id))).toBe(true);
  });

  it('the hero has the endpoint card with Copy and generated counters', () => {
    expect(html).toContain('<code id="hm-ep">https://apibase.pro/mcp</code>');
    expect(html).toMatch(/<button type="button" id="hm-copy" aria-label="Copy endpoint">/);
    expect(html).toMatch(/<span class="hm-n">\d{3,} tools<\/span>/);
    expect(html).toMatch(/<span class="hm-n">\d{3,} providers<\/span>/);
    expect(html).toContain('<a class="hm-shoplink" href="/shops">');
  });
});
