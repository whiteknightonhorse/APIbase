import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const html = readFileSync(join(__dirname, '../../static/policy-moderation.html'), 'utf8');

function newSection(): string {
  const start = html.indexOf('id="merchant-catalogs"');
  expect(start).toBeGreaterThan(-1);
  const end = html.indexOf('<h2>', start);
  return html.slice(start, end).replace(/<[^>]*>/g, '');
}

describe('policy-moderation page, merchant catalogs section', () => {
  it('has the section id', () => {
    expect(html).toContain('id="merchant-catalogs"');
  });

  it('links to the AUP categories, the AUP countries and the integrator moderation docs', () => {
    expect(html).toContain('href="/legal/aup#categories"');
    expect(html).toContain('href="/legal/aup"');
    expect(html).toContain('href="/docs/integrator#moderation"');
  });

  it('has no 4-digit count in the system header', () => {
    const m = /<div class="sys-monitor">([\s\S]*?)<\/div>/.exec(html);
    expect(m).not.toBeNull();
    expect(m![1]).not.toMatch(/1[0-9]{3}/);
  });

  it('has no digits in the new section', () => {
    expect(newSection()).not.toMatch(/[0-9]/);
  });
});
