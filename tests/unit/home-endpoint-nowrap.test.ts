/** T-0396: the hero endpoint URL and the two stats never wrap mid-word. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(__dirname, '../../static/assets/site-m.css'), 'utf8');
const rule = (sel: string) => new RegExp(`${sel.replace(/[.]/g, '\\.')}\\{([^}]*)\\}`, 'g');
const bodies = (sel: string) => [...css.matchAll(rule(sel))].map((m) => m[1]).join(';');

describe('home hero endpoint card (T-0396)', () => {
  it('endpoint URL is nowrap, scrolls inside its box and has no break-anywhere', () => {
    const b = bodies('.hm .hm-ep-url code');
    expect(b).toContain('white-space:nowrap');
    expect(b).toContain('overflow-x:auto');
    expect(b).not.toMatch(/word-break:\s*break-all|overflow-wrap:\s*anywhere/);
  });

  it('each stat stays on one line', () => {
    expect(bodies('.hm .hm-n')).toContain('white-space:nowrap');
  });

  it('the card keeps at least 380px (or the full row) so URL + Copy fit', () => {
    expect(bodies('.hm .hm-ep')).toContain('min-width:min(100%,380px)');
  });

  it('stat columns are wide enough for a 30px "404 providers" so the pair stacks instead of overflowing', () => {
    const m = bodies('.hm .hm-ep-nums').match(/minmax\(min\(100%,(\d+)px\),1fr\)/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(190);
  });
});
