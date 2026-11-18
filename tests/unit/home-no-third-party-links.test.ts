/** T-0913: the home page carries no links to third-party sites (AGENT-SCAN-1118 q-4). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// operator ruling 2026-11-18: a new entry needs an operator yes
const ALLOWED = {
  hosts: ['apibase.pro'], // and any *.apibase.pro
  prefixes: ['https://github.com/whiteknightonhorse/APIbase'],
  exact: ['https://x.com/apibase_pro'],
};

const ROOT = join(__dirname, '../..');

function isOurs(url: string): boolean {
  const abs = url.startsWith('//') ? 'https:' + url : url;
  let host = '';
  try {
    host = new URL(abs).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (ALLOWED.hosts.some((h) => host === h || host.endsWith('.' + h))) return true;
  if (
    ALLOWED.prefixes.some(
      (p) =>
        url === p || url.startsWith(p + '/') || url.startsWith(p + '?') || url.startsWith(p + '#'),
    )
  )
    return true;
  return ALLOWED.exact.includes(url);
}

function offenders(file: string, text: string): string[] {
  const urls: string[] = [];
  if (file.endsWith('.html')) {
    const body = text.replace(/<!--[\s\S]*?-->/g, ' ');
    for (const m of body.matchAll(/(?<![\w-])(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
      const v = (m[1] ?? m[2] ?? '').trim();
      if (/^(?:https?:)?\/\//i.test(v)) urls.push(v);
    }
  } else {
    for (const m of text.matchAll(/https?:\/\/[^\s<>)"'\]]+/gi))
      urls.push(m[0].replace(/[.,;:]+$/, ''));
  }
  return urls.filter((u) => !isOurs(u)).map((u) => `${file}: third-party URL ${u}`);
}

describe('home page has no third-party links', () => {
  for (const f of ['static/index.html', 'static/index.md']) {
    it(`${f}: every external URL is ours`, () => {
      expect(offenders(f, readFileSync(join(ROOT, f), 'utf8'))).toEqual([]);
    });
  }
  it('the check catches a third-party URL and a foreign GitHub repo', () => {
    expect(
      offenders('x.html', '<a href="https://8004scan.io/agents/base/399542">x</a>'),
    ).toHaveLength(1);
    expect(offenders('x.html', '<a href="https://github.com/other/repo">x</a>')).toHaveLength(1);
    expect(
      offenders('x.html', '<a href="https://github.com/whiteknightonhorse/APIbase-evil">x</a>'),
    ).toHaveLength(1);
    expect(offenders('x.html', '<script src="//cdn.example.com/a.js"></script>')).toHaveLength(1);
  });
});
