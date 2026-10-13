/** T-0398: design M polish batch 1 - hero before facts strip, top-aligned example row, grouped status legend. */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const STATIC = join(resolve(__dirname, '../..'), 'static');
const read = (f: string): string => readFileSync(join(STATIC, f), 'utf-8');

describe('site-m polish batch 1 (T-0398)', () => {
  it('pricing: the status strip comes after the H1 and lead', () => {
    const html = read('pricing.html');
    const h1 = html.indexOf('<h1>');
    const lead = html.indexOf('class="mk-lead"');
    const strip = html.indexOf('class="mk-stats"');
    expect(h1).toBeGreaterThan(-1);
    expect(strip).toBeGreaterThan(lead);
    expect(lead).toBeGreaterThan(h1);
    for (const l of ['PRICE:', 'RAILS:', 'MINIMUM:'])
      expect(html).toContain(`<span class="label">${l}</span>`);
  });

  it('integrator: the example row is top-aligned', () => {
    const css = read('assets/site-m.css');
    const rule = /\.ig \.ig-example\{([^}]*)\}/.exec(css);
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/align-items:\s*(flex-)?start/);
    expect(rule![1]).not.toMatch(/align-items:\s*center/);
  });

  it('dashboard: each legend dot shares an inline-flex parent with its label', () => {
    const html = read('dashboard.html');
    const line = html.split('\n').find((l) => l.includes('class="latency-legend"')) ?? '';
    const items =
      line.match(
        /<span class="legend-item"><span class="status-dot dot-[gour]"><\/span>(healthy|slow|down|pending)<\/span>/g,
      ) ?? [];
    expect(items).toHaveLength(4);
    expect(html).toMatch(
      /\.legend-item\{[^}]*display:inline-flex[^}]*gap:4px[^}]*margin-left:16px/,
    );
  });
});
