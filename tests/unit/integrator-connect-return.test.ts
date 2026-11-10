/**
 * T-0764: the done page of a partner arrival (checkbox, 10 s return, stop actions, grant-only step,
 * existing store on a register link, word wrap, secrets). The served page runs in jsdom with a stubbed
 * wallet and fetch; timers are a manual scheduler so the countdown is deterministic.
 */
import express from 'express';
import { webcrypto } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import {
  createIntegratorRouter,
  grantVariant,
  partners,
} from '../../src/shop/routes/integrator.router';

jest.mock('../../src/config', () => ({ config: {} }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM, VirtualConsole } = require('jsdom');

let server: ReturnType<express.Express['listen']>;
let base: string;
const RET = partners().find((p) => p.id === 'soukbase')!.return_url;
const HID = '11111111-2222-3333-4444-555555555555';
beforeAll(() => {
  const app = express();
  app.use(createIntegratorRouter({ limit: 10_000 }));
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

type Opt = {
  from?: boolean;
  handoff?: { mode: 'register' | 'grant'; grant_requested: boolean };
  reg409?: boolean;
  grantFails?: boolean;
};

async function boot(o: Opt) {
  let html = await (
    await fetch(`${base}/integrator/connect${o.from === false ? '' : '?from=soukbase'}`)
  ).text();
  if (o.handoff) {
    const pf = JSON.stringify({ prefill: {}, expected_wallet: null, ...o.handoff });
    html = html.replace(
      '<a id="pt"',
      `<input type="hidden" name="handoff" value="${HID}" data-partner="Soukbase" form="f"><script type="application/json" id="pf">${pf}</script><a id="pt"`,
    );
    html = grantVariant(html, 'Soukbase', o.handoff);
  }
  const calls: { url: string; method: string; body: string }[] = [];
  const timers: { fn: () => void; at: number; id: number }[] = [];
  let now = 0,
    seq = 0;
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    virtualConsole: new VirtualConsole().sendTo(console),
    pretendToBeVisual: true,
    url: 'https://apibase.pro/integrator/connect?from=soukbase',
    beforeParse(w: any) {
      Object.defineProperty(w, 'crypto', { value: webcrypto, configurable: true });
      w.TextEncoder = TextEncoder;
      w.ethereum = {
        chainId: '0x2105',
        request: async (r: any) =>
          r.method === 'eth_requestAccounts' ? ['0x' + 'ab'.repeat(20)] : '0xsig',
      };
      w.setInterval = (fn: () => void, ms: number) => {
        timers.push({ fn, at: now + ms, id: ++seq });
        return seq;
      };
      w.clearInterval = (id: number) => {
        const i = timers.findIndex((t) => t.id === id);
        if (i >= 0) timers.splice(i, 1);
      };
      w.fetch = async (url: string, init: any = {}) => {
        const method = init.method || 'GET',
          body = init.body || '';
        calls.push({ url, method, body });
        const res = (s: number, d: unknown) => ({ ok: s < 400, status: s, json: async () => d });
        if (url.startsWith('/legal/index.json')) return res(200, []);
        if (url.startsWith('/api/v1/shop/auth/nonce')) return res(200, { message: 'm' });
        if (url === '/api/v1/shop/merchants')
          return o.reg409
            ? res(409, { error_code: 'wallet_registered', message: 'taken' })
            : res(201, { docs_to_accept: [{ doc_id: 'd', version: '1', sha256: 'x' }] });
        if (url.endsWith('/acceptances'))
          return res(201, { api_key: 'mk_live_' + 'a1'.repeat(16) });
        if (url.endsWith('/grants'))
          return o.grantFails
            ? res(500, { message: 'boom' })
            : res(201, { slug: 'existing-shop', partner: 'soukbase' });
        return res(404, {});
      };
    },
  });
  const w = dom.window,
    d = w.document;
  const navs: string[] = [];
  d.getElementById('pt')?.addEventListener('click', (e: any) => {
    e.preventDefault();
    navs.push(e.currentTarget.href);
  });
  const tick = (sec: number) => {
    for (let i = 0; i < sec; i++) {
      now += 1000;
      timers
        .filter((t) => t.at <= now)
        .forEach((t) => {
          t.at += 1000;
          t.fn();
        });
    }
  };
  const settle = async () => {
    for (let i = 0; i < 200 && $('out').hidden && $('er').hidden; i++)
      await new Promise((r) => setTimeout(r, 10));
    await new Promise((r) => setTimeout(r, 30));
  };
  const $ = (id: string) => d.getElementById(id);
  const fill = (n: string, v: string) => {
    const e = d.querySelector(`[name=${n}]`);
    e.value = v;
    e.dispatchEvent(new w.Event('input', { bubbles: true }));
  };
  async function run() {
    if (!o.handoff || o.handoff.mode !== 'grant') {
      fill('name', 'Shop One');
      fill('site_url', 'https://shop.example');
      fill('contact_email', 'a@b.co');
      $('nx').click();
      d.querySelector('[name=accept]').checked = true;
      $('nx').click();
    }
    $('nx').click();
    await settle();
  }
  const out = () => $('out');
  const status = () => out().querySelector('[role=status]');
  const box = () => out().querySelector('input[type=checkbox]');
  const keys = () =>
    [...out().querySelectorAll('.cn-key code')].map((c: any) => c.textContent as string);
  const tick1 = () => {
    const c = box();
    c.checked = true;
    c.dispatchEvent(new w.Event('change', { bubbles: true }));
  };
  const untick = () => {
    const c = box();
    c.checked = false;
    c.dispatchEvent(new w.Event('change', { bubbles: true }));
  };
  const secrets = (ks: string[]) => {
    for (const k of ks) {
      expect(k.length).toBeGreaterThan(20);
      for (const s of [w.sessionStorage, w.localStorage])
        for (let i = 0; i < s.length; i++) expect(String(s.getItem(s.key(i)))).not.toContain(k);
      for (const c of calls) {
        expect(c.url).not.toContain(k);
        expect(c.body).not.toContain(k);
      }
      for (const a of d.querySelectorAll('a[href]'))
        expect(a.getAttribute('href')).not.toContain(k);
      expect(w.location.href).not.toContain(k);
    }
  };
  return { w, d, calls, navs, tick, run, out, status, box, keys, tick1, untick, secrets, $ };
}

const GR = { mode: 'register' as const, grant_requested: true };
const URL1 = `${RET}?apibase_slug=shop-one&handoff=${HID}`;

describe('T-0764 done page return', () => {
  it('T1 new store + signed grant: link disabled until the box, 10 s countdown, return URL', async () => {
    const p = await boot({ handoff: GR });
    await p.run();
    const pt = p.$('pt');
    expect(p.out().textContent).toContain('Your store is connected');
    expect(pt.hasAttribute('href')).toBe(false);
    expect(pt.getAttribute('aria-disabled')).toBe('true');
    expect(pt.textContent).toBe('Continue on Soukbase');
    expect(p.status().textContent).toBe('Tick the box above first: the keys are shown only once.');
    p.tick(30);
    expect(p.navs).toEqual([]);
    expect(p.out().querySelector('.cn-warnbox').textContent).toContain(
      'Never send these keys to anyone',
    );
    expect(p.out().textContent).toContain('I saved both keys. They are shown only once.');
    p.tick1();
    expect(pt.textContent).toBe('Go to Soukbase now');
    expect(pt.hasAttribute('aria-disabled')).toBe(false);
    expect(p.status().textContent).toBe('Returning to Soukbase in 10 s');
    expect(p.status().querySelector('[aria-hidden=true]').textContent).toBe('10');
    p.tick(5);
    expect(p.status().querySelector('[aria-hidden=true]').textContent).toBe('5');
    expect(p.navs).toEqual([]);
    p.tick(5);
    expect(p.navs).toEqual([URL1]);
    expect(p.out().textContent).toContain(
      'Soukbase adds your catalog and sets up delivery for this store. You have nothing else to do here.',
    );
    expect(p.out().textContent).not.toContain('Next steps');
    expect(p.out().querySelector('details')).toBeNull();
    p.secrets(p.keys());
  });

  it.each(['stay', 'escape', 'untick', 'copy', 'hidden'])(
    'T2 stop action %s stops the countdown and a re-tick restarts it',
    async (how) => {
      const p = await boot({ handoff: GR });
      await p.run();
      p.tick1();
      p.tick(3);
      if (how === 'stay')
        [...p.out().querySelectorAll('button')]
          .find((b: any) => b.textContent === 'Stay on this page')
          .click();
      if (how === 'escape') p.d.dispatchEvent(new p.w.KeyboardEvent('keydown', { key: 'Escape' }));
      if (how === 'untick') p.untick();
      if (how === 'copy') p.out().querySelector('.cn-key button').click();
      if (how === 'hidden') {
        Object.defineProperty(p.d, 'hidden', { configurable: true, value: true });
        p.d.dispatchEvent(new p.w.Event('visibilitychange'));
      }
      p.tick(20);
      expect(p.navs).toEqual([]);
      if (how === 'untick') {
        expect(p.$('pt').hasAttribute('href')).toBe(false);
        expect(p.status().textContent).toContain('Tick the box above first');
      } else {
        expect(p.status().textContent).toBe(
          'Automatic return stopped. Go to Soukbase when you are ready.',
        );
        expect(p.$('pt').getAttribute('href')).toBe(URL1);
      }
      if (how === 'hidden')
        Object.defineProperty(p.d, 'hidden', { configurable: true, value: false });
      if (how === 'untick') p.tick1();
      else {
        p.untick();
        p.tick1();
      }
      expect(p.status().textContent).toBe('Returning to Soukbase in 10 s');
      p.tick(10);
      expect(p.navs).toEqual([URL1]);
      p.secrets(p.keys());
    },
  );

  it('T3 no grant requested, or grant declined: the four steps sit in a closed details', async () => {
    for (const o of [{ from: true }, { handoff: GR, grantFails: true }] as Opt[]) {
      const p = await boot(o);
      await p.run();
      const dt = p.out().querySelector('details');
      expect(dt.open).toBe(false);
      expect(dt.querySelector('summary').textContent).toBe('Set the store up yourself');
      expect(dt.querySelectorAll('.cn-todo li')).toHaveLength(4);
      expect(p.out().textContent).not.toContain('adds your catalog and sets up delivery');
      if (o.grantFails)
        expect(p.out().textContent).toContain('was not allowed to act for your store');
      expect(p.$('pt').getAttribute('href') ?? null).toBeNull();
      p.secrets(p.keys());
    }
  });

  it('T4 mode grant: Permission saved, no box, no keys, countdown at once', async () => {
    const p = await boot({ handoff: { mode: 'grant', grant_requested: false } });
    await p.run();
    expect(p.out().querySelector('h1').textContent).toBe('Permission saved');
    expect(p.out().textContent).toContain('Soukbase can now sell for apibase.pro/m/existing-shop.');
    expect(p.box()).toBeNull();
    expect(p.out().querySelector('.cn-key')).toBeNull();
    expect(p.status().textContent).toBe('Returning to Soukbase in 10 s');
    expect(p.$('pt').getAttribute('href')).toBe(`${RET}?apibase_slug=existing-shop&handoff=${HID}`);
    p.tick(10);
    expect(p.navs).toEqual([`${RET}?apibase_slug=existing-shop&handoff=${HID}`]);
  });

  it('T5 409 wallet_registered: grant step with grant_requested, plain box without', async () => {
    const p = await boot({ handoff: GR, reg409: true });
    await p.run();
    const er = p.$('er');
    expect(er.hidden).toBe(false);
    expect(er.textContent).toContain('This wallet already has a store on APIbase');
    expect(er.textContent).toContain(
      'Sign once to allow Soukbase to sell for it. No new store and no new keys are created.',
    );
    expect(p.calls.filter((c) => c.url.endsWith('/grants'))).toHaveLength(0);
    [...er.querySelectorAll('button')].find((b: any) => b.textContent === 'Allow Soukbase').click();
    for (let i = 0; i < 200 && p.out().hidden; i++) await new Promise((r) => setTimeout(r, 10));
    const g = p.calls.filter((c) => c.url.endsWith('/grants'));
    expect(g).toHaveLength(1);
    expect(JSON.parse(g[0].body).handoff_id).toBe(HID);
    expect(p.calls.filter((c) => c.url === '/api/v1/shop/merchants')).toHaveLength(1);
    expect(p.out().querySelector('h1').textContent).toBe('Permission saved');
    expect(p.status().textContent).toBe('Returning to Soukbase in 10 s');
    const q = await boot({ handoff: { mode: 'register', grant_requested: false }, reg409: true });
    await q.run();
    expect(q.$('er').textContent).toContain('This wallet already has a store on APIbase.');
    expect(q.$('er').textContent).toContain(
      'Ask Soukbase for a link that connects an existing store.',
    );
    expect(q.$('er').querySelector('button')).toBeNull();
    expect(q.out().hidden).toBe(true);
    expect(q.status()).toBeNull();
  });

  it('T7 the served page wraps words in #out and keeps break-all on the keys', async () => {
    const h = await (await fetch(`${base}/integrator/connect?from=soukbase`)).text();
    expect(h).toMatch(/\.ig #out\{[^}]*word-break:normal/);
    expect(h).toMatch(/\.ig \.cn-key code\{[^}]*word-break:break-all/);
  });

  it('T9 the page without from keeps the old done page', async () => {
    const p = await boot({ from: false });
    await p.run();
    expect(p.out().querySelector('h1').textContent).toBe('Your store is connected');
    expect(p.out().querySelectorAll('.cn-warnbox small')).toHaveLength(1);
    expect(p.keys()).toHaveLength(2);
    expect([...p.out().querySelectorAll('h2')].map((h: any) => h.textContent)).toEqual([
      'Next steps',
    ]);
    expect(p.out().querySelector('details')).toBeNull();
    expect(p.box()).toBeNull();
    expect(p.status()).toBeNull();
    p.secrets(p.keys());
  });
});
