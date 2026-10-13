/** T-0385: the nine marketing pages use the design-M layout (hero, .mk scope) and carry no terminal chrome. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const PAGES = [
  'why',
  'pricing',
  'partners',
  'frameworks',
  'connect',
  'about',
  'company-research-intent',
  'flight-search-intent',
  'image-generation-intent',
];
const css = readFileSync(join(ROOT, 'static/assets/site-m.css'), 'utf8');

describe('marketing pages design M (T-0385)', () => {
  it.each(PAGES)('%s has the mk shell, a hero with one h1 and no terminal chrome', (name) => {
    const html = readFileSync(join(ROOT, `static/${name}.html`), 'utf8');
    expect(html).toContain('<div class="page-shell mk">');
    expect(html).toMatch(/<header class="mk-hero">\s*<span class="m-caption">[^<]+<\/span>\s*<h1>/);
    expect(html.match(/<h1>/g)).toHaveLength(1);
    expect(html).not.toMatch(
      /STATUS: ONLINE|BUILD: v|class="sys-monitor"|class="terminal"|cursor-blink/,
    );
    expect(html).not.toMatch(/text-shadow\s*:\s*0/);
  });

  it('frameworks keeps all 13 framework sections', () => {
    const html = readFileSync(join(ROOT, 'static/frameworks.html'), 'utf8');
    const h2 = html.match(/<h2[ >]/g) ?? [];
    expect(h2.length).toBeGreaterThanOrEqual(13);
    for (const id of [
      'claude',
      'cursor',
      'windsurf',
      'openai',
      'langchain',
      'google-adk',
      'crewai',
      'copilot',
      'sunpeak',
      'rest',
    ]) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it('site-m.css defines the mk scope', () => {
    expect(css).toMatch(/\.mk \.mk-hero\{/);
    expect(css).toMatch(/\.mk \.jump a\{[^}]*min-height:44px/);
  });
});
