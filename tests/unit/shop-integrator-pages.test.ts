/** T-INT-17 IP1-IP12. Real express router + the real files in static/integrator. */
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createIntegratorRouter, PLATFORMS } from '../../src/shop/routes/integrator.router';

jest.mock('../../src/config', () => ({ config: {} }));

const F5_TEXT =
  'Base: USDC is native; x402 is an open Coinbase protocol for paying HTTP requests in USDC; our facilitator settles. Tempo: settlement and network fees in a stablecoin; native splits and sessions (MPP).';

const SECTION_IDS = [
  'offer',
  'how-it-works',
  'demo-shop',
  'options',
  'quickstart',
  'check',
  'fee',
  'security',
  'faq',
  'legal',
  'aipush',
  'buyers',
];

const CODES_6_4 = [
  'quote_expired',
  'out_of_stock',
  'payment_required',
  'payment_amount_mismatch',
  'payment_pending',
  'quote_already_paying',
  'pii_required',
  'pii_plaintext_rejected',
  'merchant_unavailable',
  'country_not_supported',
  'category_prohibited',
  'terms_not_accepted',
  'already_placed',
  'test_sku_daily_cap',
];

const FORBIDDEN = [
  'all agents already buy',
  'chatgpt buys from you',
  'instant refund',
  'buyer protection',
  'legal everywhere',
  'no kyc',
  'de facto',
  'standard',
  'connect to the mcp server',
];

const ENV_KEYS = [
  'INTEGRATOR_FEE_ENABLED',
  'INTEGRATOR_FEE_BPS',
  'INTEGRATOR_MIN_ORDER_USD',
  'MERCHANTS_COUNT',
  'SANDBOX_STATUS',
] as const;
const saved: Record<string, string | undefined> = {};

let server: ReturnType<express.Express['listen']>;
let base: string;

beforeAll(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  const app = express();
  app.use(createIntegratorRouter({ limit: 10_000 }));
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const get = async (path: string, md = false) => {
  const r = await fetch(`${base}${path}`, md ? { headers: { accept: 'text/markdown' } } : {});
  return { status: r.status, type: r.headers.get('content-type') ?? '', text: await r.text() };
};

const PAGES = [
  '/integrator',
  '/integrator/agent-guide',
  '/integrator/buyers',
  '/integrator/wallet',
  '/integrator/why-base-tempo',
  '/integrator/connect',
  ...PLATFORMS.map((p) => `/integrator/platforms/${p}`),
];

describe('integrator pages', () => {
  it('IP1: 12 sections in the §13.1 order', async () => {
    const { text } = await get('/integrator');
    const ids = [...text.matchAll(/<section id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(SECTION_IDS);
  });

  it('IP2: EN canon, fee on and off', async () => {
    process.env.INTEGRATOR_FEE_ENABLED = 'true';
    process.env.INTEGRATOR_FEE_BPS = '150';
    let { text } = await get('/integrator');
    expect(text).toContain(
      "Sell to AI agents. One link on your site, and a buyer's agent places and pays the order by itself. USDC settles to your wallet. 1.5% fee.",
    );
    process.env.INTEGRATOR_FEE_ENABLED = 'false';
    ({ text } = await get('/integrator'));
    expect(text).toContain('USDC settles to your wallet. 0% fee during the pilot.');
    expect(text).not.toContain('{{');
  });

  it('IP3: no forbidden phrases, no hard-coded 1.5%', async () => {
    const raw = await Promise.all(
      [
        '/integrator',
        '/integrator/agent-guide',
        '/integrator/buyers',
        '/integrator/wallet',
        '/integrator/why-base-tempo',
        '/integrator/connect',
        '/integrator/llms.txt',
        ...PLATFORMS.map((p) => `/integrator/platforms/${p}`),
      ].flatMap((p) => [get(p), get(p, true)]),
    );
    for (const { text } of raw) {
      const low = text.toLowerCase();
      for (const phrase of FORBIDDEN) expect(low).not.toContain(phrase);
    }
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dir = path.resolve(__dirname, '../../static/integrator');
    for (const f of ['index.html', 'index.md', 'llms.txt']) {
      const t = fs.readFileSync(path.join(dir, f), 'utf-8');
      expect(t).not.toMatch(/1\.5\s?%|1,5\s?%/);
    }
  });

  it('IP4: Accept text/markdown gives 12 headings; llms.txt has 5 guide links', async () => {
    const r = await get('/integrator', true);
    expect(r.type).toContain('text/markdown');
    expect(r.text.match(/^## /gm)).toHaveLength(12);
    const llms = (await get('/integrator/llms.txt')).text;
    for (const l of ['agent-guide', 'buyers', 'why-base-tempo', 'wallet', 'platforms/shopify']) {
      expect(llms).toContain(`https://apibase.pro/integrator/${l}`);
    }
  });

  it('IP5: why-base-tempo carries the F-5 text, no evaluative words', async () => {
    for (const md of [false, true]) {
      const { text } = await get('/integrator/why-base-tempo', md);
      expect(text).toContain(F5_TEXT);
      expect(text.toLowerCase()).not.toMatch(/de facto|standard/);
    }
  });

  it('IP6: connect form: checkbox, personal_sign, both POST paths, no external script, JS <= 40 lines', async () => {
    const { text } = await get('/integrator/connect');
    expect(text).toContain('<input type="checkbox"');
    expect(text).toContain('personal_sign');
    expect(text).toContain('/api/v1/shop/merchants');
    expect(text).toContain('/acceptances');
    expect(text).toContain('checkbox+wallet_signature');
    expect(text).not.toMatch(/<script[^>]*\ssrc=/i);
    const js = [...text.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1].trim());
    expect(js).toHaveLength(1);
    expect(js[0].split('\n').length).toBeLessThanOrEqual(40);
    expect(text).toContain('<option>digital-goods</option>');
    expect(text).toContain('agent-guide');
  });

  it('IP7: HTML <= 35 KB, 390 px friendly viewport, no external resources', async () => {
    const { text } = await get('/integrator');
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(35 * 1024);
    expect(text).toContain('name="viewport"');
    expect(text).not.toMatch(/<(?:script|link|img|iframe)[^>]+(?:src|href)="https?:/i);
    expect(text).not.toMatch(/<script/i);
  });

  it('IP8: agent-guide has all 14 §6.4 anchors and the wallet precondition first', async () => {
    const { text } = await get('/integrator/agent-guide');
    for (const c of CODES_6_4) expect(text).toContain(`id="${c}"`);
    const firstLi = /<h2 id="preconditions">[\s\S]*?<li>([\s\S]*?)<\/li>/.exec(text);
    expect(firstLi?.[1].toLowerCase()).toContain('wallet');
    const order = [
      'nonce',
      'register',
      'accept_terms',
      'catalog_upsert',
      'webhook_set',
      'check',
      'pay test-sku',
      'payment_verified',
    ];
    let at = -1;
    for (const step of order) {
      const i = text.toLowerCase().indexOf(`. ${step}</h2>`);
      expect(i).toBeGreaterThan(at);
      at = i;
    }
  });

  it('IP9: five platform pages, none with <script', async () => {
    expect(PLATFORMS).toHaveLength(5);
    for (const p of PLATFORMS) {
      for (const md of [false, true]) {
        const r = await get(`/integrator/platforms/${p}`, md);
        expect(r.status).toBe(200);
        expect(r.text).not.toMatch(/<script/i);
      }
    }
    expect((await get('/integrator/platforms/nope')).status).toBe(404);
  });

  it('IP10: block 6 carries the sandbox token, rendered text does not promise one', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const tpl = fs.readFileSync(
      path.resolve(__dirname, '../../static/integrator/index.html'),
      'utf-8',
    );
    expect(/<section id="check">[\s\S]*?\{\{SANDBOX_STATUS\}\}[\s\S]*?<\/section>/.test(tpl)).toBe(
      true,
    );
    const { text } = await get('/integrator');
    const block = /<section id="check">([\s\S]*?)<\/section>/.exec(text)![1];
    expect(block).toContain('Sandbox: not yet available — use the $0.01 test SKU on mainnet');
    expect(block.toLowerCase()).not.toMatch(/sandbox (is|will be) (available|live)|coming soon/);
    process.env.SANDBOX_STATUS = 'Sandbox: open at /sandbox';
    expect((await get('/integrator')).text).toContain('Sandbox: open at /sandbox');
  });

  it('IP11: the two buttons point at /integrator/connect and /m/apibase-demo', async () => {
    const { text } = await get('/integrator');
    const btns = [...text.matchAll(/<a class="btn[^"]*" href="([^"]+)">/g)].map((m) => m[1]);
    expect(btns).toEqual(['/integrator/connect', '/m/apibase-demo']);
  });

  it('IP12: no contact_email or wallet addresses in the pages or their Markdown', async () => {
    for (const p of PAGES.filter((x) => !x.endsWith('/connect'))) {
      for (const md of [false, true]) {
        const { text } = await get(p, md);
        expect(text).not.toMatch(/contact_email/);
        expect(text).not.toMatch(/0x[0-9a-fA-F]{40}/);
      }
    }
  });
});
