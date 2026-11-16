/**
 * T-0869 (REQUEST-SOUKBASE-R5-1-1116 ruling-1): a live handoff of mode register with grant_requested
 * opens one page with one button. The page is rendered by the router (the handoff store is stubbed) and
 * runs in jsdom with a stubbed wallet and fetch.
 */
import express from 'express';
import { webcrypto } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { ALLOWED_CATEGORIES } from '../../src/shop/moderation/categories';
import { createIntegratorRouter, partners } from '../../src/shop/routes/integrator.router';

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
  o: { wallet?: boolean; nonce409?: string; session?: Record<string, string> } = {},
) {
  const html = await render({ prefill, mode: 'register', grant_requested: true });
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
        if (url.startsWith('/legal')) return res(200, []);
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
    expect(docs.nextElementSibling.querySelector('#nx')).not.toBeNull(); // directly above the button
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
