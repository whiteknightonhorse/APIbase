/** T-INT-28 HP1-HP9: homepage redesign with the Integrator block (terminal style kept). */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const html = () => read('static/index.html');
const SECTION_ORDER = [
  'hero',
  'audience',
  'start',
  'integrator',
  'sea-hunter',
  'numbers',
  'faq',
  'links',
];

/** Bodies of executable inline scripts (JSON-LD data blocks are not code). */
const inlineScripts = (s: string) =>
  [...s.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
    .filter((m) => !/type="application\/ld\+json"/.test(m[1]))
    .map((m) => m[2]);

/** Anything that points off the origin or pulls an outside file. */
const externalResources = (s: string) => [
  ...[...s.matchAll(/<script\b[^>]*\bsrc=/g)].map((m) => m[0]),
  ...[...s.matchAll(/<link\b[^>]*rel="(?:stylesheet|preload|prefetch|modulepreload)"[^>]*>/g)].map(
    (m) => m[0],
  ),
  ...[...s.matchAll(/<(?:img|iframe|video|audio|source|embed|object)\b[^>]*>/g)].map((m) => m[0]),
  ...[...s.matchAll(/@import|url\(\s*['"]?https?:/g)].map((m) => m[0]),
];

describe('HP1 size', () => {
  it('HTML is at most 35 KB', () => {
    expect(Buffer.byteLength(html())).toBeLessThanOrEqual(35 * 1024);
  });
});

describe('HP2 block order', () => {
  it('<section id=...> order is the 13.2 order, one h1, no boot screen', () => {
    const ids = [...html().matchAll(/<section id="([a-z-]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(SECTION_ORDER);
    expect(html().match(/<h1[ >]/g)).toHaveLength(1);
    expect(html()).not.toMatch(/boot-screen|sessionStorage/);
  });
  it('the Integrator block carries the canon, the /integrator button and the sea-hunter slot text', () => {
    const h = html();
    const block = /<section id="integrator"[\s\S]*?<\/section>/.exec(h)![0];
    expect(block).toContain(
      "Sell to AI agents. One link on your site, and a buyer's agent places and pays the order by itself. USDC settles to your wallet.",
    );
    expect(block).toMatch(/<a class="btn p" href="\/integrator">Connect AI payment<\/a>/);
    expect(/<section id="sea-hunter"[\s\S]*?<\/section>/.exec(h)![0]).toContain(
      'AI Fleet — Sea Hunter',
    );
  });
  it('no external resources', () => {
    expect(externalResources(html())).toEqual([]);
  });
  it('mutation: an external <script src> is detected', () => {
    const bad = html().replace(
      '</body>',
      '<script src="https://cdn.example.com/x.js"></script></body>',
    );
    expect(externalResources(bad).length).toBeGreaterThan(0);
  });
});

describe('HP3 no FAQPage markup', () => {
  it('FAQPage absent; mutation: adding it is detected', () => {
    expect(html()).not.toMatch(/FAQPage/);
    const bad = html().replace(
      '</head>',
      '<script type="application/ld+json">{"@type":"FAQPage"}</script></head>',
    );
    expect(bad).toMatch(/FAQPage/);
  });
});

describe('HP4 FAQ in the DOM', () => {
  it('every FAQ answer is server-rendered inside <details>', () => {
    const faq = /<section id="faq">([\s\S]*?)<\/section>/.exec(html())![1];
    const items = [
      ...faq.matchAll(
        /<details>\s*<summary>([^<]+)<\/summary>\s*<p>([\s\S]*?)<\/p>\s*<\/details>/g,
      ),
    ];
    expect(items.length).toBeGreaterThanOrEqual(6);
    for (const m of items) expect(m[2].replace(/<[^>]+>/g, '').length).toBeGreaterThan(40);
    expect(faq).toContain('Model Context Protocol');
  });
  it('burger nav is a <details> with the same links', () => {
    const burger = /<details class="nav-burger">([\s\S]*?)<\/details>/.exec(html())![1];
    expect(burger).toContain('href="/integrator"');
    expect(read('static/index.html')).toMatch(
      /@media\(max-width:768px\)\{[^}]*nav\.nav-full\{display:none\}[^}]*\.nav-burger\{display:block\}/,
    );
  });
});

describe('HP5 no fake terminal status', () => {
  it('no PID / TTY / Uptime', () => {
    for (const w of [/\bPID\b/, /\bTTY\b/, /Uptime/]) expect(html()).not.toMatch(w);
  });
});

describe('HP6 forbidden phrases', () => {
  const FORBIDDEN = [
    /all agents (are )?already buy/i,
    /ChatGPT (buys|purchases) from you/i,
    /instant refund/i,
    /buyer protection/i,
    /legal everywhere/i,
    /no KYC/i,
    /(de facto )?standard for (agent )?payments/i,
    /connect to (the|an) MCP server/i,
    /1[.,]5 ?%/,
  ];
  for (const f of ['static/index.html', 'static/index.md']) {
    it(`${f} has none of the 1 forbidden phrases or the 1.5% literal`, () => {
      for (const rx of FORBIDDEN)
        expect([f, rx.source, rx.test(read(f))]).toEqual([f, rx.source, false]);
    });
  }
  it('the fee phrase reads 0% fee during the pilot while the fee is off', () => {
    expect(JSON.parse(read('static/.well-known/mcp.json')).integrator.fee_enabled).toBe(false);
    expect(html()).toContain('<!--fee-->0% fee during the pilot<!--/fee-->');
  });
});

describe('HP7 markdown', () => {
  it('index.md has the Integrator block and the /integrator link', () => {
    const md = read('static/index.md');
    expect(md).toContain('Integrator');
    expect(md).toContain('https://apibase.pro/integrator');
    expect(md).toContain(
      "Sell to AI agents. One link on your site, and a buyer's agent places and pays the order by itself.",
    );
  });
});

describe('HP8 inline JS budget', () => {
  it('at most 40 lines of inline script in total', () => {
    const lines = inlineScripts(html()).reduce((n, b) => n + b.trim().split('\n').length, 0);
    expect(lines).toBeLessThanOrEqual(40);
  });
});

describe('HP9 reduced motion', () => {
  const css = () => /<style>([\s\S]*?)<\/style>/.exec(html())![1];
  it('every animation declaration sits in a prefers-reduced-motion: no-preference block', () => {
    const c = css();
    expect(c).toContain('prefers-reduced-motion:reduce');
    const start = c.indexOf('@media(prefers-reduced-motion:no-preference){');
    expect(start).toBeGreaterThan(-1);
    const rest = c.slice(0, start) + c.slice(c.indexOf('@media(prefers-reduced-motion:reduce)'));
    const guarded = c.slice(start, c.indexOf('@media(prefers-reduced-motion:reduce)'));
    expect(rest).not.toMatch(/animation\s*:/);
    expect(guarded).toMatch(/animation:/);
  });
  it('the integrator theme stays a byte copy of the homepage style (TD1 guard)', () => {
    const h = html();
    expect(read('static/integrator/_theme.css').trim()).toBe(
      h.slice(h.indexOf('<style>') + 7, h.indexOf('</style>')).trim(),
    );
  });
});

describe('HP11 facts render', () => {
  const run = (cwd: string) =>
    spawnSync('python3', [join(ROOT, 'scripts/integrator-facts.py'), 'check'], {
      cwd,
      encoding: 'utf8',
    });
  const copyTree = () => {
    const dir = mkdtempSync(join(tmpdir(), 'homeint-'));
    for (const f of [
      'static/index.html',
      'static/index.md',
      'static/pricing.html',
      'static/llms.txt',
      'static/.well-known/mcp.json',
      'static/integrator/index.html',
      'static/integrator/llms.txt',
      'static/integrator/index.md',
    ]) {
      mkdirSync(dirname(join(dir, f)), { recursive: true });
      copyFileSync(join(ROOT, f), join(dir, f));
    }
    return dir;
  };
  it('check passes on the tree and fails when the merchants line or the fee phrase drifts', () => {
    expect(run(ROOT).status).toBe(0);
    const dir = copyTree();
    const p = join(dir, 'static/index.html');
    // the committed count moves with every merchant (the baseline is mcp.json): drift it from whatever it is now
    const now = Number(/Merchants connected so far: (\d+)\./.exec(html())?.[1]);
    expect(Number.isInteger(now)).toBe(true);
    writeFileSync(
      p,
      html().replace(
        `Merchants connected so far: ${now}.`,
        `Merchants connected so far: ${now + 6}.`,
      ),
    );
    expect(run(dir).status).toBe(1);
    writeFileSync(p, html().replace('0% fee during the pilot', '1% fee'));
    expect(run(dir).status).toBe(1);
  });
  it('zero merchants renders the block without a number', () => {
    const dir = copyTree();
    const mcp = join(dir, 'static/.well-known/mcp.json');
    writeFileSync(
      mcp,
      JSON.stringify({ ...JSON.parse(read('static/.well-known/mcp.json')), merchants_count: 0 }),
    );
    expect(run(dir).status).toBe(1);
    expect(
      spawnSync('python3', [join(ROOT, 'scripts/integrator-facts.py'), 'render'], { cwd: dir })
        .status,
    ).toBe(0);
    expect(readFileSync(join(dir, 'static/index.html'), 'utf8')).toContain(
      '<!--merchants--><!--/merchants-->',
    );
  });
});
