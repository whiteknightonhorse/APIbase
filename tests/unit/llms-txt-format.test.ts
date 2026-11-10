import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '../..');
const text = readFileSync(resolve(ROOT, 'static/llms.txt'), 'utf8');
const lines = text.split('\n');
const LINK = /^- \[[^\]]+\]\(https:\/\/[^)\s]+\)(: .+)?$/;

function section(name: string): string[] {
  const i = lines.indexOf(`## ${name}`);
  if (i < 0) return [];
  const out: string[] = [];
  for (let j = i + 1; j < lines.length && !/^## /.test(lines[j]); j++) {
    if (lines[j].trim() !== '') out.push(lines[j]);
  }
  return out;
}
const SECTIONS = ['Docs', 'Machine-readable', 'Optional'];

describe('llms.txt format (llmstxt.org)', () => {
  it('(a) exactly one H1, on line 1', () => {
    const h1 = lines.map((l, i) => (/^# /.test(l) ? i : -1)).filter((i) => i >= 0);
    expect(h1).toEqual([0]);
  });
  it('(b) blockquote follows the H1', () => {
    const next = lines.slice(1).find((l) => l.trim() !== '');
    expect(next?.startsWith('> ')).toBe(true);
  });
  it('(c) required sections exist and hold only link lines', () => {
    for (const s of SECTIONS) {
      const body = section(s);
      expect(body.length).toBeGreaterThan(0);
      for (const l of body) expect(l).toMatch(LINK);
    }
  });
  it('(d) at least 15 link lines', () => {
    const n = SECTIONS.reduce((a, s) => a + section(s).filter((l) => LINK.test(l)).length, 0);
    expect(n).toBeGreaterThanOrEqual(15);
  });
  it('(e) linked .md pages exist and are the expected six', () => {
    const paths = new Set<string>();
    for (const m of text.matchAll(/https:\/\/apibase\.pro\/([A-Za-z0-9._/-]+?\.md)\b/g))
      paths.add(m[1]);
    for (const p of paths) expect(existsSync(resolve(ROOT, 'static', p))).toBe(true);
    expect([...paths].sort()).toEqual(
      [
        'auth.md',
        'faq.md',
        'pricing.md',
        'what-is-an-mcp-gateway.md',
        'why.md',
        'x402-vs-mpp.md',
      ].sort(),
    );
  });
  it('(f) no counts or prices in the link sections', () => {
    for (const s of SECTIONS)
      for (const l of section(s))
        expect(l).not.toMatch(/\d+ (tools|providers|categories|merchants)|\$\d/);
  });
  it('(g) Optional is the last H2', () => {
    const h2 = lines.filter((l) => /^## /.test(l));
    expect(h2[h2.length - 1]).toBe('## Optional');
  });
});
