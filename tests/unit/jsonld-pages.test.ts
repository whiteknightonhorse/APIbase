/** T-0591: JSON-LD on the inner pages parses and carries the properties Google's Rich Results need; robots.txt and llms-full.txt. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildLlmsFull } from '../../scripts/llms-full';

const ROOT = join(__dirname, '../..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const facts = JSON.parse(read('static/.well-known/site-facts.json'));

function blocks(page: string): any[] {
  const html = read(`static/${page}.html`);
  return [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)].map(
    (m) => JSON.parse(m[1]),
  );
}
const ofType = (page: string, t: string) => blocks(page).filter((b) => b['@type'] === t);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function validate(b: any, canonical: string): void {
  expect(b['@context']).toBe('https://schema.org');
  switch (b['@type']) {
    case 'BreadcrumbList': {
      const items = b.itemListElement;
      expect(items.length).toBeGreaterThanOrEqual(2);
      items.forEach((it: any, i: number) => {
        expect(it['@type']).toBe('ListItem');
        expect(it.position).toBe(i + 1);
        expect(typeof it.name).toBe('string');
        expect(it.item).toMatch(/^https:\/\/apibase\.pro\//);
      });
      expect(items[items.length - 1].item).toBe(canonical);
      break;
    }
    case 'TechArticle':
      expect(b.headline.length).toBeGreaterThan(10);
      expect(b.headline.length).toBeLessThanOrEqual(110);
      expect(b.dateModified).toMatch(ISO);
      expect(b.url).toBe(canonical);
      expect(b.publisher['@type']).toBe('Organization');
      expect(b.publisher.sameAs).toContain('https://github.com/whiteknightonhorse/APIbase');
      break;
    case 'FAQPage':
      expect(b.mainEntity).toHaveLength(12);
      for (const q of b.mainEntity) {
        expect(q['@type']).toBe('Question');
        expect(q.name).toMatch(/\?$/);
        expect(q.acceptedAnswer['@type']).toBe('Answer');
        expect(q.acceptedAnswer.text.length).toBeGreaterThan(20);
        expect(q.acceptedAnswer.text).not.toMatch(/`|<\/?(a|code|strong)[ >]/);
      }
      break;
    case 'Service': {
      const o = b.offers;
      expect(o['@type']).toBe('AggregateOffer');
      expect(o.priceCurrency).toBe('USD');
      expect(Number(o.lowPrice)).toBe(facts.price_range_usd.min);
      expect(Number(o.highPrice)).toBe(facts.price_range_usd.max);
      expect(o.offers.length).toBeGreaterThan(0);
      for (const of of o.offers) {
        expect(of['@type']).toBe('Offer');
        expect(of.priceSpecification.priceCurrency).toBe('USD');
      }
      break;
    }
    default:
      throw new Error(`unexpected JSON-LD type ${b['@type']}`);
  }
}

const ARTICLES = [
  'x402-vs-mpp',
  'what-is-an-mcp-gateway',
  'why',
  'flight-search-intent',
  'image-generation-intent',
  'company-research-intent',
];
const INNER = [...ARTICLES, 'faq', 'pricing', 'connect', 'frameworks', 'about', 'partners'];

describe('JSON-LD on inner pages (T-0591)', () => {
  it.each(INNER)('%s: every block validates and a BreadcrumbList is present', (page) => {
    const canonical = `https://apibase.pro/${page}`;
    expect(read(`static/${page}.html`)).toContain(`<link rel="canonical" href="${canonical}">`);
    for (const b of blocks(page)) validate(b, canonical);
    expect(ofType(page, 'BreadcrumbList')).toHaveLength(1);
  });
  it.each(ARTICLES)('%s carries a TechArticle', (page) => {
    expect(ofType(page, 'TechArticle')).toHaveLength(1);
  });
  it('faq carries FAQPage with every question also visible on the page', () => {
    const html = read('static/faq.html');
    for (const q of ofType('faq', 'FAQPage')[0].mainEntity) {
      expect(html).toContain(`<h2>${q.name}</h2>`);
    }
  });
  it('pricing carries an AggregateOffer from the published price range', () => {
    expect(ofType('pricing', 'Service')).toHaveLength(1);
  });
  it('rejects a broken block (mutation control)', () => {
    const b = ofType('faq', 'FAQPage')[0];
    expect(() => validate({ ...b, mainEntity: b.mainEntity.slice(1) }, 'x')).toThrow();
  });
});

describe('robots.txt AI search bots (T-0591)', () => {
  const robots = read('static/robots.txt');
  it.each([
    'OAI-SearchBot',
    'ChatGPT-User',
    'Claude-SearchBot',
    'Claude-User',
    'Applebot-Extended',
    'Meta-ExternalAgent',
  ])('%s has its own block with Allow and Content-Signal', (bot) => {
    expect(robots).toContain(
      `User-agent: ${bot}\nAllow: /\nContent-Signal: ai-train=yes, search=yes, ai-input=yes\n`,
    );
  });
});

describe('llms-full.txt (T-0591)', () => {
  it('equals the generator output and holds every linked Markdown page', () => {
    const full = read('static/llms-full.txt');
    expect(full).toBe(buildLlmsFull(ROOT));
    for (const p of ['why', 'x402-vs-mpp', 'what-is-an-mcp-gateway', 'faq']) {
      expect(full).toContain(read(`static/${p}.md`).trimEnd());
    }
  });
});
