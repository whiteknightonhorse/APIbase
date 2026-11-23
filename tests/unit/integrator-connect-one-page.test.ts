/**
 * T-0869 (REQUEST-SOUKBASE-R5-1-1116 ruling-1): a live handoff of mode register with grant_requested
 * opens one page with one button. The page is rendered by the router (the handoff store is stubbed) and
 * runs in jsdom with a stubbed wallet and fetch.
 */
import express from 'express';
import { webcrypto } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { ALLOWED_CATEGORIES } from '../../src/shop/moderation/categories';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createIntegratorRouter,
  loadPartners,
  partners,
} from '../../src/shop/routes/integrator.router';

jest.mock('../../src/config', () => ({ config: {} }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM, VirtualConsole } = require('jsdom');

const HID = '11111111-2222-3333-4444-555555555555';
const EXP = '0x' + 'cd'.repeat(20);
const RET = partners().find((p) => p.id === 'soukbase')!.return_url;
const FULL = {
  name: 'Northside Kicks',
  site_url: 'https://northside.example',
  contact_email: 'owner@northside.example',
  category: ALLOWED_CATEGORIES[0],
  country: 'DE',
  slug: 'northside-kicks',
};
type Row = {
  prefill: Record<string, string> | null;
  mode: 'register' | 'grant';
  grant_requested: boolean;
} | null;

let row: Row = null;
let server: ReturnType<express.Express['listen']>;
let base = '';
beforeAll(() => {
  const db = {
    $queryRawUnsafe: async () => (row ? [{ handoff_id: HID, expected_wallet: EXP, ...row }] : []),
    $executeRawUnsafe: async () => 0,
  };
  const app = express();
  app.use(createIntegratorRouter({ limit: 10_000, db: db as never }));
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const render = async (r: Row, qs = `?from=soukbase&handoff=${HID}`) => {
  row = r;
  return (await fetch(`${base}/integrator/connect${qs}`)).text();
};
const pfOf = (html: string) =>
  JSON.parse(/<script type="application\/json" id="pf">(.*?)<\/script>/.exec(html)![1]);

async function boot(
  prefill: Record<string, string>,
  o: {
    wallet?: boolean;
    nonce409?: string;
    session?: Record<string, string>;
    /** T-0943: the answers of /legal/index.json and /legal/index.next.json ('fail': a 503) */
    legal?: { now: unknown[] | 'fail'; next: unknown[] | 'fail' };
    /** T-0943: matchMedia('(pointer: coarse)') matches (a touch screen) */
    coarse?: boolean;
    html?: string;
  } = {},
) {
  const html = o.html ?? (await render({ prefill, mode: 'register', grant_requested: true }));
  const calls: { url: string; method: string; body: string }[] = [];
  const reqs: string[] = [];
  const navs: string[] = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    virtualConsole: new VirtualConsole().sendTo(console),
    pretendToBeVisual: true,
    url: `https://apibase.pro/integrator/connect?from=soukbase&handoff=${HID}`,
    beforeParse(w: any) {
      Object.defineProperty(w, 'crypto', { value: webcrypto, configurable: true });
      w.TextEncoder = TextEncoder;
      if (o.session) w.sessionStorage.setItem('apibase_connect', JSON.stringify(o.session));
      w.matchMedia = (q: string) => ({ matches: !!o.coarse && q === '(pointer: coarse)' });
      if (o.wallet !== false)
        w.ethereum = {
          chainId: '0x2105',
          request: async (r: any) => {
            reqs.push(r.method);
            return r.method === 'eth_requestAccounts' ? [EXP] : '0xsig';
          },
        };
      w.fetch = async (url: string, init: any = {}) => {
        calls.push({ url, method: init.method || 'GET', body: init.body || '' });
        const res = (s: number, d: unknown) => ({ ok: s < 400, status: s, json: async () => d });
        if (url === '/legal/index.json' || url === '/legal/index.next.json') {
          const v = o.legal ? o.legal[url === '/legal/index.json' ? 'now' : 'next'] : [];
          return v === 'fail' ? res(503, { error_code: 'legal_index_unavailable' }) : res(200, v);
        }
        if (url.startsWith('/api/v1/shop/auth/nonce?purpose=handoff'))
          return o.nonce409
            ? res(409, { error_code: o.nonce409, message: 'taken' })
            : res(200, { message: 'combined message' });
        if (url === '/api/v1/shop/merchants/handoff')
          return res(201, { slug: FULL.slug, status: 'active', grant: { partner: 'soukbase' } });
        return res(404, {});
      };
    },
  });
  const w = dom.window,
    d = w.document,
    $ = (id: string) => d.getElementById(id),
    F = ($('f') as any).elements;
  d.getElementById('pt').addEventListener('click', (e: any) => {
    e.preventDefault();
    navs.push(e.currentTarget.href);
  });
  /** shown to the person: no hidden ancestor, not inside a closed details (its summary excepted) */
  const visible = (e: any): boolean => {
    for (let x = e; x && x !== d.body; x = x.parentElement) {
      if (x.hidden || x.style.display === 'none') return false;
      const p = x.parentElement;
      if (p && p.tagName === 'DETAILS' && !p.open && x.tagName !== 'SUMMARY') return false;
    }
    return true;
  };
  const inputs = () =>
    [...d.querySelectorAll('input, select')]
      .filter((e: any) => e.type !== 'hidden' && visible(e))
      .map((e: any) => e.name);
  const press = async (until: () => boolean) => {
    $('nx').click();
    for (let i = 0; i < 200 && !until(); i++) await new Promise((r) => setTimeout(r, 10));
    await new Promise((r) => setTimeout(r, 20));
  };
  const handoffPosts = () => calls.filter((c) => c.url === '/api/v1/shop/merchants/handoff');
  return { w, d, $, F, visible, inputs, press, calls, reqs, navs, handoffPosts };
}

describe('T-0869 one-page handoff: render', () => {
  it('one_page is in #pf only for register + grant_requested; other pages carry no one-page markup', async () => {
    expect(
      pfOf(await render({ prefill: FULL, mode: 'register', grant_requested: true })),
    ).toMatchObject({ one_page: true, mode: 'register', grant_requested: true });
    const plain = await render(null, '?from=soukbase');
    const others = [
      plain,
      await render(null, ''),
      await render({ prefill: FULL, mode: 'register', grant_requested: false }),
      await render({ prefill: FULL, mode: 'grant', grant_requested: false }),
      await render(null),
    ];
    for (const h of others) {
      expect(h).not.toContain('one_page'); // the dispatcher's grep
      expect(h).not.toContain('the payment partner of');
      expect(h).not.toContain('<details id="more">');
      expect(h).not.toContain('<div data-row=');
    }
  });
});

describe('T-0869 one-page handoff: page', () => {
  it('full prefill: no visible input but T-0867 line, bar hidden, one button, documents above it, More options closed', async () => {
    const p = await boot(FULL);
    expect(p.inputs()).toEqual([]);
    expect(p.visible(p.$('ce-line'))).toBe(true);
    expect(p.$('bar').hidden).toBe(true);
    expect(p.d.querySelectorAll('h2')).toHaveLength(0);
    const btns = [...p.d.querySelectorAll('button')].filter(
      (b: any) => p.visible(b) && !b.closest('#ce-line'),
    );
    expect(btns.map((b: any) => b.textContent)).toEqual(['Sign with wallet']);
    expect(p.visible(p.$('bk'))).toBe(false);
    expect(p.d.querySelector('.cn-eye').textContent).toBe(
      'This is APIbase, the payment partner of Soukbase.',
    );
    const subs = [...p.d.querySelectorAll('#hd .lp-sub')].map((e: any) => e.textContent);
    expect(subs).toEqual([
      'We open the store page apibase.pro/m/northside-kicks for Northside Kicks, where AI agents order and pay. Soukbase adds your products and receives your orders.',
      'Payouts in USDC on Base go to the wallet you sign with (0xcdcd…cdcd). It costs nothing.',
    ]);
    const docs = p.$('op-docs');
    expect(docs.textContent).toBe(
      'By signing you accept the Merchant Agreement, Acceptable Use Policy, Data Processing Addendum and Refund Framework.',
    );
    const links = [...docs.querySelectorAll('a')];
    expect(links.map((a: any) => a.getAttribute('href'))).toEqual([
      '/legal/merchant-agreement',
      '/legal/aup',
      '/legal/dpa',
      '/legal/refund-framework',
    ]);
    for (const a of links) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(p.visible(a)).toBe(true);
      expect(
        a.compareDocumentPosition(p.$('nx')) & p.w.Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    // T-0943: the line on where to stop the partner sits between the documents line and the button (was: directly above it)
    expect(docs.nextElementSibling.id).toBe('op-stop');
    expect(docs.nextElementSibling.nextElementSibling.querySelector('#nx')).not.toBeNull();
    expect(p.$('nx').closest('p').nextElementSibling.textContent).toBe(
      'One free signature. No gas, no money leaves your wallet.',
    );
    const more = p.$('more');
    expect(more.open).toBe(false);
    expect(more.querySelector('summary').textContent).toBe('More options');
    expect(more.querySelectorAll('#sig li')).toHaveLength(4);
    for (const n of ['payout_wallet_base', 'payout_wallet_tempo', 'support_email'])
      expect(more.contains(p.F[n])).toBe(true);
    expect(more.textContent).toContain('Document versions');
    expect(more.contains(p.$('wh'))).toBe(true);
    expect(
      [...more.querySelectorAll('[data-sd]')].map((s: any) => s.textContent).slice(0, 2),
    ).toEqual(['Northside Kicks', 'https://northside.example']);
    // the sent values are in the form, not shown
    for (const [n, v] of Object.entries(FULL)) expect(p.F[n].value).toBe(v);
  });

  it('prefill without country: the Country select is visible and nothing else', async () => {
    const { country: _c, ...rest } = FULL;
    const p = await boot(rest);
    expect(p.inputs()).toEqual(['country']);
  });

  it('one press: one personal_sign, one POST /merchants/handoff with every prefill value, then the browser returns', async () => {
    const p = await boot(FULL, {
      session: { name: 'Another Shop', slug: 'another-shop', country: 'FR' },
    });
    await p.press(() => p.navs.length > 0);
    expect(p.reqs.filter((m) => m === 'personal_sign')).toHaveLength(1);
    expect(p.handoffPosts()).toHaveLength(1);
    const body = JSON.parse(p.handoffPosts()[0].body);
    expect(body).toMatchObject(FULL);
    expect(body.handoff_id).toBe(HID);
    expect(p.navs).toEqual([`${RET}?apibase_slug=${FULL.slug}&handoff=${HID}`]);
    expect(p.$('out').textContent).toBe('Returning to Soukbase...');
  });

  it('slug_taken: the Shop address field is shown with the message; the page stays one page', async () => {
    const p = await boot(FULL, { nonce409: 'slug_taken' });
    expect(p.visible(p.F.slug)).toBe(false);
    await p.press(() => p.visible(p.F.slug));
    expect(p.visible(p.F.slug)).toBe(true);
    expect(p.d.querySelector('[data-for=slug]').textContent).toBe(
      'This address is taken — try northside-kicks-shop',
    );
    expect(p.inputs()).toEqual(['slug']);
    expect(p.$('bar').hidden).toBe(true);
    expect(p.$('nx').textContent).toBe('Sign with wallet');
    expect(p.reqs.filter((m) => m === 'personal_sign')).toHaveLength(0);
  });

  it('an invalid sent value is shown with its error and focus; no wallet is asked', async () => {
    const p = await boot({ ...FULL, site_url: 'https://localhost' });
    expect(p.visible(p.F.site_url)).toBe(false);
    await p.press(() => p.visible(p.F.site_url));
    expect(p.inputs()).toEqual(['site_url']);
    expect(p.d.querySelector('[data-for=site_url]').textContent).toContain(
      'Enter the full website address',
    );
    expect(p.d.activeElement).toBe(p.F.site_url);
    expect(p.reqs).toEqual([]);
    expect(p.calls.filter((c) => c.url.startsWith('/api/'))).toEqual([]);
  });

  it('no wallet in the browser: #nw is shown openly and the button is hidden', async () => {
    const p = await boot(FULL, { wallet: false });
    expect(p.visible(p.$('nw'))).toBe(true);
    expect(p.$('nx').hidden).toBe(true);
  });
});

describe('T-0943 partner view of the connect page', () => {
  const dom = (html: string) => new JSDOM(html).window.document;
  /** links whose target is not a new tab: an explicit target other than _blank (the page has <base target="_blank">) */
  const sameTab = (d: any) =>
    [...d.querySelectorAll('a')].filter(
      (a: any) => a.hasAttribute('target') && a.getAttribute('target') !== '_blank',
    );

  it('live, dead and no handoff: no site navigation, no nav-sub, no footers; one bar with APIbase and Back to Soukbase', async () => {
    const pages = [
      await render({ prefill: FULL, mode: 'register', grant_requested: true }),
      await render({ prefill: FULL, mode: 'register', grant_requested: false }),
      await render({ prefill: null, mode: 'grant', grant_requested: false }),
      await render(null), // dead handoff
      await render(null, '?from=soukbase'),
    ];
    for (const h of pages) {
      const d = dom(h);
      expect(d.querySelector('.nav-full, .nav-burger')).toBeNull();
      expect(h).not.toContain('nav-sub');
      expect(d.querySelector('.site-footer, .footer, .footer-row')).toBeNull();
      expect(d.getElementById('ft')).toBeNull();
      expect(h).not.toContain('Registering through an AI agent or the API? See the');
      expect(d.querySelector('head base').getAttribute('target')).toBe('_blank');
      expect(d.querySelectorAll('head base')).toHaveLength(1);
      const bar = d.querySelector('.ho-bar');
      expect(bar.querySelector('.brand').tagName).toBe('SPAN');
      expect(bar.querySelector('.brand').textContent).toBe('APIbase');
      const same = sameTab(d);
      expect(same.map((a: any) => a.id).sort()).toEqual(['ho-back', 'pt']);
      const back = d.getElementById('ho-back');
      expect(back.textContent).toBe('← Back to Soukbase');
      expect(back.getAttribute('target')).toBe('_self');
      expect(back.getAttribute('href')).toBe('https://soukbase.com');
      expect(d.getElementById('pt').getAttribute('target')).toBe('_self');
      expect(h).toContain('/assets/site-m.css'); // APIbase keeps its own look
    }
  });

  it('the plain page keeps the site navigation, the tabs and the footers', async () => {
    for (const qs of ['', '?from=nobody']) {
      const h = await render(null, qs);
      const d = dom(h);
      expect(d.querySelector('.nav-full')).not.toBeNull();
      expect(h).toContain('<nav class="nav-sub"');
      expect(d.querySelector('.site-footer')).not.toBeNull();
      expect(d.getElementById('ft')).not.toBeNull();
      expect(d.getElementById('ho-back')).toBeNull();
      expect(d.querySelector('base')).toBeNull();
    }
  });

  it('back_url wins over site; a non-https back_url stops the start', async () => {
    const reg = [{ ...partners()[0], back_url: 'https://soukbase.com/sell/dashboard' }];
    const app = express();
    app.use(createIntegratorRouter({ limit: 10_000, partners: reg }));
    const srv = app.listen(0);
    try {
      const h = await (
        await fetch(
          `http://127.0.0.1:${(srv.address() as AddressInfo).port}/integrator/connect?from=soukbase`,
        )
      ).text();
      expect(dom(h).getElementById('ho-back').getAttribute('href')).toBe(
        'https://soukbase.com/sell/dashboard',
      );
    } finally {
      srv.close();
    }
    const dir = mkdtempSync(join(tmpdir(), 'partners-'));
    try {
      const f = join(dir, 'partners.json');
      const base0 = JSON.parse(JSON.stringify(partners()[0]));
      for (const bad of ['http://soukbase.com/back', '', 7]) {
        writeFileSync(f, JSON.stringify([{ ...base0, back_url: bad }]));
        expect(() => loadPartners(f)).toThrow(/back_url|https|Invalid URL/);
      }
      writeFileSync(f, JSON.stringify([{ ...base0, back_url: 'https://soukbase.com/b' }]));
      expect(loadPartners(f)[0].back_url).toBe('https://soukbase.com/b');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('T-0943 More options, #nw, category', () => {
  it('the fold has no deep link, no "Copy link" and no agent guide link; it stays closed', async () => {
    const p = await boot(FULL);
    const more = p.$('more');
    expect(more.open).toBe(false);
    expect(more.innerHTML).not.toContain('metamask.app.link');
    expect(more.innerHTML).not.toContain('go.cb-w.com');
    expect(more.textContent).not.toContain('Copy link');
    expect(more.querySelector('a[href="/integrator/agent-guide"]')).toBeNull();
    expect(more.contains(p.F.support_email)).toBe(true);
  });

  it('#nw on a fine pointer: the wallet help link only; on a coarse pointer: the heading and the deep links', async () => {
    const fine = await boot(FULL, { wallet: false });
    const nw = fine.$('nw');
    expect(fine.visible(nw)).toBe(true);
    const shown = (p: any) =>
      [...p.$('nw').querySelectorAll('a, h3, button')]
        .filter((e: any) => p.visible(e))
        .map((e: any) => e.textContent);
    expect(shown(fine)).toEqual(["Don't have a wallet yet?"]);
    const coarse = await boot(FULL, { wallet: false, coarse: true });
    expect(shown(coarse)).toEqual([
      'Open this page in your wallet app',
      'Open in MetaMask',
      'Open in Coinbase Wallet',
      'Finish on a computer',
      'Copy link',
      "Don't have a wallet yet?",
      'Registering through an AI agent or the API?',
    ]);
  });

  it('category: value is the slug, the text is words; the store details line shows the words; the posted body carries the slug', async () => {
    const p = await boot(FULL);
    const o = [...p.F.category.options].find((x: any) => x.value === 'digital-goods');
    expect(o.textContent).toBe('Digital goods');
    const saas = [...p.F.category.options].find((x: any) => x.value === 'saas-subscriptions');
    expect(saas.textContent).toBe('SaaS subscriptions');
    expect(p.F.category.value).toBe('digital-goods');
    expect(p.d.querySelector('[data-sd=category]').textContent).toBe('Digital goods');
    await p.press(() => p.navs.length > 0);
    expect(JSON.parse(p.handoffPosts()[0].body).category).toBe('digital-goods');
  });
});

describe('T-0943 document versions in words', () => {
  const doc = (id: string, v: string, at = '2026-10-12T00:00:00Z') => ({
    doc_id: id,
    version: v,
    sha256: id.slice(0, 2).padEnd(64, '0'),
    effective_from: at,
    url: `/legal/${id}`,
  });
  const NOW = [
    doc('refund-framework', '1.0'),
    doc('merchant-agreement', '1.2'),
    doc('aup', '1.0'),
    doc('dpa', '1.1'),
    { doc_id: 'terms', sha256: 'f'.repeat(64), url: '/terms', registry: false },
  ];
  const TODAY =
    'You accept the versions in force today: Merchant Agreement v1.2, Acceptable Use Policy v1.0, Data Processing Addendum v1.1, Refund Framework v1.0.';
  const settle = () => new Promise((r) => setTimeout(r, 50));
  const block = (p: any) => p.$('dv');
  const noPathLinks = (p: any) =>
    expect(
      [...p.d.querySelectorAll('a')].filter((a: any) => a.textContent.trim().startsWith('/')),
    ).toEqual([]);

  it('the two sentences from the lists; the link and the technical details', async () => {
    const p = await boot(FULL, {
      legal: {
        now: NOW,
        next: [
          doc('refund-framework', '1.1', '2026-12-10T00:00:00Z'),
          doc('merchant-agreement', '1.3', '2026-12-10T00:00:00Z'),
          { doc_id: 'terms', version: '3', effective_from: '2026-12-01T00:00:00Z' },
        ],
      },
    });
    await settle();
    expect(p.$('dvt').textContent).toBe(
      `${TODAY} New versions take effect on 10 December 2026: Merchant Agreement v1.3, Refund Framework v1.1. Until then the versions above apply.`,
    );
    const all = [...block(p).querySelectorAll('a')].find(
      (a: any) => a.textContent === 'All versions and dates',
    );
    expect(all.getAttribute('href')).toBe('/legal');
    const tech = block(p).querySelector('details');
    expect(tech.open).toBe(false);
    expect(tech.querySelector('summary').textContent).toBe('Technical details');
    expect(p.$('docs').textContent.split('\n')).toEqual([
      `merchant-agreement v1.2 sha256:${'me'.padEnd(64, '0')}`,
      `aup v1.0 sha256:${'au'.padEnd(64, '0')}`,
      `dpa v1.1 sha256:${'dp'.padEnd(64, '0')}`,
      `refund-framework v1.0 sha256:${'re'.padEnd(64, '0')}`,
    ]);
    const ml = [...tech.querySelectorAll('a')].find(
      (a: any) => a.textContent === 'Machine-readable list',
    );
    expect(ml.getAttribute('href')).toBe('/legal/index.json');
    noPathLinks(p);
    expect(p.d.body.innerHTML).not.toContain('latest effective');
  });

  it('one sentence per date', async () => {
    const p = await boot(FULL, {
      legal: {
        now: NOW,
        next: [
          doc('dpa', '2.0', '2027-01-05T00:00:00Z'),
          doc('aup', '1.1', '2026-12-10T00:00:00Z'),
        ],
      },
    });
    await settle();
    expect(p.$('dvt').textContent).toBe(
      `${TODAY} New versions take effect on 10 December 2026: Acceptable Use Policy v1.1. Until then the versions above apply. New versions take effect on 5 January 2027: Data Processing Addendum v2.0. Until then the versions above apply.`,
    );
  });

  it('index.next.json empty: no second sentence', async () => {
    const p = await boot(FULL, { legal: { now: NOW, next: [] } });
    await settle();
    expect(p.$('dvt').textContent).toBe(TODAY);
    noPathLinks(p);
  });

  it.each([
    ['index.json', { now: 'fail' as const, next: [] }],
    ['index.next.json', { now: NOW, next: 'fail' as const }],
  ])('%s does not load: the fallback line with the link', async (_n, legal) => {
    const p = await boot(FULL, { legal });
    await settle();
    const t = p.$('dvt');
    expect(t.textContent).toBe('Versions could not be loaded. See all versions and dates.');
    expect(t.querySelector('a').getAttribute('href')).toBe('/legal');
    expect(p.$('dva').hidden).toBe(true);
    noPathLinks(p);
  });

  it('the plain page carries the same block in step 2', async () => {
    const h = await render(null, '');
    const d = new JSDOM(h).window.document;
    const s2 = d.getElementById('s2');
    expect(s2.querySelector('#dv')).not.toBeNull();
    expect(s2.textContent).toContain('Document versions');
    expect(h).not.toContain('Current versions and hashes');
    expect(h).not.toContain('latest effective');
  });
});

describe('T-0943 where to stop the partner, in words', () => {
  const SENT = 'You can stop Soukbase any time at apibase.pro/integrator/permissions.';
  const HREF = '/integrator/permissions?partner=soukbase';

  it('one-page view: one sentence under the documents line, the address links to the partner row', async () => {
    const p = await boot(FULL);
    const s = p.$('op-stop');
    expect(s.textContent).toBe(SENT);
    expect(s.querySelector('a').getAttribute('href')).toBe(HREF);
    expect(s.querySelector('a').textContent).toBe('apibase.pro/integrator/permissions');
    expect(p.visible(s)).toBe(true);
    expect(p.$('op-docs').nextElementSibling).toBe(s);
    expect(p.d.body.innerHTML.replace(/<script[\s\S]*?<\/script>/g, '')).not.toContain(
      '/merchants/me/grants',
    ); // the API route is not page text
    expect(p.d.body.textContent.split(SENT)).toHaveLength(2);
  });

  it('grant view: the sentence in place of "You can revoke it any time." and "Revocable any time."', async () => {
    const h = await render({ prefill: null, mode: 'grant', grant_requested: false });
    const d = new JSDOM(h).window.document;
    const lead = d.querySelector('#hd .lp-sub');
    expect(lead.textContent).toContain(
      `It gets no access to payouts, keys, orders or refunds. ${SENT}`,
    );
    expect(lead.querySelector('a').getAttribute('href')).toBe(HREF);
    expect(h).not.toContain('revoke it any time');
    expect(h).not.toContain('Revocable any time.');
    expect(h.replace(/<script[\s\S]*?<\/script>/g, '')).not.toContain('/merchants/me/grants');
    expect(d.body.textContent.split(SENT)).toHaveLength(2);
  });
});
