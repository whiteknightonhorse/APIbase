/**
 * T-0942 (REQ-AB-R7-1 item 5): /integrator/permissions, where a seller stops a partner with one
 * wallet signature. The served page runs in jsdom with fake EIP-6963 providers and a fake fetch; the
 * Markdown twin is served by Accept and by path, byte for byte, and states the same outcomes.
 */
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createIntegratorRouter, partners } from '../../src/shop/routes/integrator.router';

jest.mock('../../src/config', () => ({ config: {} }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM, VirtualConsole } = require('jsdom');

let server: ReturnType<express.Express['listen']>;
let base: string;
beforeAll(() => {
  const app = express();
  app.use(createIntegratorRouter({ limit: 10_000 }));
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const ACCT = '0x' + 'ab'.repeat(20);
const SERVER_TEXT = 'apibase.pro: stop Soukbase acting for your store\nAddress: x';
const hex = (m: string) => '0x' + Buffer.from(m, 'utf8').toString('hex');

type Answer = { status: number; body: Record<string, unknown> };

async function boot(
  o: {
    query?: string;
    wallets?: string[];
    /** the POST answer (default 200 revoked) */
    post?: Answer;
    /** personal_sign rejects with this wallet code */
    signErr?: number;
  } = {},
) {
  const q = o.query ?? '';
  const html = await (await fetch(`${base}/integrator/permissions${q}`)).text();
  const log: { who: string; method: string; params?: unknown }[] = [];
  const calls: { url: string; method: string; body?: string }[] = [];
  const mk = (name: string) => ({
    request: async (r: { method: string; params?: unknown }) => {
      log.push({ who: name, method: r.method, params: r.params });
      if (r.method === 'eth_requestAccounts') return [ACCT];
      if (r.method === 'personal_sign') {
        if (o.signErr) throw Object.assign(new Error('User rejected'), { code: o.signErr });
        return '0xsig';
      }
      return null;
    },
  });
  const wallets = (o.wallets ?? ['MetaMask']).map((n) => ({ name: n, p: mk(n) }));
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    virtualConsole: new VirtualConsole().sendTo(console),
    pretendToBeVisual: true,
    url: `https://apibase.pro/integrator/permissions${q}`,
    beforeParse(w: any) {
      w.TextEncoder = TextEncoder;
      w.addEventListener('eip6963:requestProvider', () => {
        wallets.forEach((f, i) =>
          w.dispatchEvent(
            new w.CustomEvent('eip6963:announceProvider', {
              detail: {
                info: { uuid: 'u' + i, name: f.name, rdns: 'r' + i, icon: '' },
                provider: f.p,
              },
            }),
          ),
        );
      });
      w.fetch = async (url: string, init: any = {}) => {
        calls.push({ url, method: init.method || 'GET', body: init.body });
        const a: Answer = url.startsWith('/api/v1/shop/auth/nonce')
          ? { status: 200, body: { message: SERVER_TEXT, nonce: 'n' } }
          : (o.post ?? { status: 200, body: { partner: 'soukbase', revoked: true } });
        return { ok: a.status < 300, status: a.status, json: async () => a.body };
      };
    },
  });
  const w = dom.window,
    d = w.document;
  const rows = () => [...d.querySelectorAll('#pl li')] as any[];
  const out = (i = 0) => rows()[i].querySelector('.pm-out');
  const settle = () => new Promise((r) => setTimeout(r, 60));
  return { w, d, rows, out, log, calls, settle };
}

describe('T-0942 /integrator/permissions page (jsdom)', () => {
  it('heading, paragraph, one row per registry partner with one Stop button; noindex; no provider request on load', async () => {
    const p = await boot();
    expect(p.d.querySelector('h1').textContent).toBe('Partners that sell for you');
    expect(p.d.querySelector('meta[name=robots]').getAttribute('content')).toMatch(/noindex/);
    expect(p.rows()).toHaveLength(partners().length);
    const r = p.rows()[0];
    expect(r.dataset.partner).toBe('soukbase');
    expect(r.querySelector('b').textContent).toBe('Soukbase');
    expect([...r.querySelectorAll('button')].map((b: any) => b.textContent)).toEqual([
      'Stop Soukbase',
    ]);
    await p.settle();
    expect(p.log).toEqual([]);
    expect(p.calls).toEqual([]);
    const det = p.d.querySelector('.cn details');
    expect(det.open).toBe(false);
    expect(det.querySelector('summary').textContent).toBe('Technical details');
    expect(det.textContent).toContain('DELETE /api/v1/shop/merchants/me/grants/');
    expect(det.textContent).toContain('shop.merchant.grant_revoke');
    expect(det.querySelector('a').getAttribute('href')).toBe('/integrator/docs#partner-grants');
  });

  it('a press: eth_requestAccounts, the nonce of purpose grant_revoke, personal_sign over the server text, then the POST', async () => {
    const p = await boot();
    p.rows()[0].querySelector('[data-stop]').click();
    await p.settle();
    expect(p.log.map((l) => l.method)).toEqual(['eth_requestAccounts', 'personal_sign']);
    expect(p.log[1].params).toEqual([hex(SERVER_TEXT), ACCT]);
    expect(p.calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `GET /api/v1/shop/auth/nonce?wallet=${ACCT}&purpose=grant_revoke&partner=soukbase`,
      'POST /api/v1/shop/merchants/me/grants/soukbase/revoke',
    ]);
    expect(JSON.parse(p.calls[1].body as string)).toEqual({
      wallet: ACCT,
      message: SERVER_TEXT,
      signature: '0xsig',
    });
    expect(p.out().hidden).toBe(false);
    expect(p.out().textContent).toBe(
      'Soukbase no longer sells for your store. You can allow it again from Soukbase.',
    );
  });

  it.each([
    [
      { status: 404, body: { error_code: 'not_found', message: 'x' } },
      'This wallet has not allowed Soukbase.',
      false,
    ],
    [
      { status: 404, body: { error_code: 'merchant_not_found', message: 'x' } },
      'This wallet has no store on APIbase.',
      false,
    ],
    [
      { status: 401, body: { error_code: 'unauthorized', message: 'invalid signature' } },
      'Signature rejected. Nothing changed.',
      true,
    ],
    [
      {
        status: 503,
        body: { error_code: 'service_unavailable', message: 'nonce store unavailable' },
      },
      'nonce store unavailable',
      true,
    ],
  ])('outcome %#: one visible line', async (post, line, retry) => {
    const p = await boot({ post });
    p.rows()[0].querySelector('[data-stop]').click();
    await p.settle();
    expect(p.out().hidden).toBe(false);
    expect(p.out().querySelector('span').textContent).toBe(line);
    const again = [...p.out().querySelectorAll('button')].find(
      (b: any) => b.textContent === 'Try again',
    );
    expect(!!again).toBe(retry);
  });

  it('a rejected signature in the wallet: "Signature rejected. Nothing changed." and Try again presses again', async () => {
    const p = await boot({ signErr: 4001 });
    p.rows()[0].querySelector('[data-stop]').click();
    await p.settle();
    expect(p.out().querySelector('span').textContent).toBe('Signature rejected. Nothing changed.');
    expect(p.calls.filter((c) => c.method === 'POST')).toEqual([]);
    ([...p.out().querySelectorAll('button')] as any[])
      .find((b) => b.textContent === 'Try again')
      .click();
    await p.settle();
    expect(p.log.filter((l) => l.method === 'eth_requestAccounts')).toHaveLength(2);
  });

  it('with several wallets the person chooses; nothing is asked before the choice', async () => {
    const p = await boot({ wallets: ['MetaMask', 'Rabby'] });
    p.rows()[0].querySelector('[data-stop]').click();
    await p.settle();
    expect(p.log).toEqual([]);
    const pick = p.rows()[0].querySelector('.pm-pick');
    const btns = [...pick.querySelectorAll('button')] as any[];
    expect(btns.map((b) => b.textContent)).toEqual(['MetaMask', 'Rabby']);
    btns[1].click();
    await p.settle();
    expect(p.log.map((l) => `${l.who} ${l.method}`)).toEqual([
      'Rabby eth_requestAccounts',
      'Rabby personal_sign',
    ]);
  });

  it('no wallet in the browser: one line linking /integrator/wallet', async () => {
    const p = await boot({ wallets: [] });
    expect(p.d.getElementById('nw').hidden).toBe(true);
    p.rows()[0].querySelector('[data-stop]').click();
    await p.settle();
    const nw = p.d.getElementById('nw');
    expect(nw.hidden).toBe(false);
    expect(nw.querySelector('a').getAttribute('href')).toBe('/integrator/wallet');
    expect(p.calls).toEqual([]);
  });

  it('?partner=soukbase shows one row; an unknown ?partner= shows all rows', async () => {
    expect((await boot({ query: '?partner=soukbase' })).rows()).toHaveLength(1);
    const all = await boot({ query: '?partner=nobody' });
    expect(all.rows()).toHaveLength(partners().length);
    const html = await (await fetch(`${base}/integrator/permissions?partner=%3Cscript%3E`)).text();
    expect(html).not.toContain('<script>x');
    expect(html).not.toMatch(/data-partner="<script/);
  });

  it('dynamic text goes through textContent only (no innerHTML in the page script)', async () => {
    const html = await (await fetch(`${base}/integrator/permissions`)).text();
    const js = /<script>([\s\S]*?)<\/script>/.exec(html.slice(html.indexOf('id="pl"')))![1];
    expect(js).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  });
});

describe('T-0942 /integrator/permissions Markdown twin and parity', () => {
  it('Accept text/markdown and /integrator/permissions.md are the same bytes; the .md carries a canonical Link', async () => {
    const a = await fetch(`${base}/integrator/permissions`, {
      headers: { accept: 'text/markdown' },
    });
    const b = await fetch(`${base}/integrator/permissions.md`);
    expect(a.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    expect(b.headers.get('link')).toBe(
      '<https://apibase.pro/integrator/permissions>; rel="canonical"',
    );
    const [ta, tb] = [await a.text(), await b.text()];
    expect(ta).toBe(tb);
    expect(ta.startsWith('# Partners that sell for you\n')).toBe(true);
    expect(ta).toContain('/integrator/docs#partner-grants');
  });

  it('page and twin state the same heading, paragraph and outcomes', async () => {
    const md = await (await fetch(`${base}/integrator/permissions.md`)).text();
    const html = await (await fetch(`${base}/integrator/permissions`)).text();
    const lead = /<p class="lp-sub">([^<]+)<\/p>/.exec(html)![1];
    expect(md).toContain(lead);
    for (const s of [
      'Partners that sell for you',
      'Stop ',
      ' no longer sells for your store. You can allow it again from ',
      'This wallet has not allowed ',
      'This wallet has no store on APIbase.',
      'Signature rejected. Nothing changed.',
      'Try again',
      '/integrator/wallet',
    ]) {
      expect([s, md.includes(s)]).toEqual([s, true]);
      expect([s, html.includes(s)]).toEqual([s, true]);
    }
  });
});
