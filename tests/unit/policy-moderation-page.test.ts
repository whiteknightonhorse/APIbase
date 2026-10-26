import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const html = readFileSync(join(__dirname, '../../static/policy-moderation.html'), 'utf8');

function newSection(): string {
  const start = html.indexOf('id="merchant-catalogs"');
  expect(start).toBeGreaterThan(-1);
  const end = html.indexOf('<h2', start);
  return html.slice(start, end).replace(/<[^>]*>/g, '');
}

describe('policy-moderation page, merchant catalogs section', () => {
  it('has the section id', () => {
    expect(html).toContain('id="merchant-catalogs"');
  });

  it('links to the AUP categories, the AUP countries and the integrator moderation docs', () => {
    expect(html).toContain('href="/legal/aup#categories"');
    expect(html).toContain('href="/legal/aup"');
    expect(html).toContain('href="/integrator/docs#catalog"');
  });

  it('has no hand-typed 4-digit count in the system header (generated bar, T-0341)', () => {
    const m = /<div class="sys-monitor">([\s\S]*?)<\/div>/.exec(html);
    expect(m).not.toBeNull();
    const tools = JSON.parse(
      readFileSync(join(__dirname, '../../static/.well-known/mcp.json'), 'utf8'),
    ).tools_count;
    expect(m![1].replace(`<strong>${tools}</strong>`, '')).not.toMatch(/1[0-9]{3}/);
  });

  it('has no digits in the new section except the nightly model-review cap (T-0569), which equals the runner default', () => {
    const cap = /DEFAULT_CAP = (\d+)/.exec(
      readFileSync(join(__dirname, '../../scripts/moderation/layer3_review.py'), 'utf8'),
    );
    expect(cap).not.toBeNull();
    const text = newSection()
      .replace(`up to ${cap![1]} items per night`, '')
      .replace('/api/v1/dashboard', '');
    expect(newSection()).toContain(`up to ${cap![1]} items per night`);
    expect(text).not.toMatch(/[0-9]/);
  });
});
