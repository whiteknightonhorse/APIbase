/**
 * T-0802: a register handoff that asked for the grant asks the wallet once (purpose handoff nonce,
 * POST /merchants/handoff); every other flow keeps its signatures.
 * T-0801: the keys step has no timer (Continue after the box); a partner with seller_keys hidden and a
 * signed grant gets the keyless page (two lines, docs link, 5 s return) and the keys never reach the DOM.
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
  /** T-0801: the registry seller_keys the server puts in the page JSON (absent = not sent). */
  keys?: 'shown' | 'hidden';
  /** T-0802: the wallet rejects every signature request. */
  reject?: boolean;
};

async function boot(o: Opt) {
  let html = await (
    await fetch(`${base}/integrator/connect${o.from === false ? '' : '?from=soukbase'}`)
  ).text();
  if (o.handoff) {
    const pf = JSON.stringify({
      prefill: {},
      expected_wallet: null,
      ...o.handoff,
      ...(o.keys ? { seller_keys: o.keys } : {}),
    });
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
  const API_KEY = 'mk_live_' + 'a1'.repeat(16);
  /** every pkcs8 (private key) export the page makes, base64; and every DOM state that held a key */
  const xp: string[] = [];
  const leaks: string[] = [];
  /** every personal_sign the page asks the wallet for (the message, decoded) */
  const signs: string[] = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    virtualConsole: new VirtualConsole().sendTo(console),
    pretendToBeVisual: true,
    url: 'https://apibase.pro/integrator/connect?from=soukbase',
    beforeParse(w: any) {
      const sub = webcrypto.subtle;
      const crypto = {
        getRandomValues: (a: any) => webcrypto.getRandomValues(a),
        subtle: {
          generateKey: (...a: any[]) => (sub.generateKey as any)(...a),
          exportKey: async (f: any, k: any) => {
            const r = await sub.exportKey(f, k);
            if (f === 'pkcs8') xp.push(Buffer.from(r as ArrayBuffer).toString('base64'));
            return r;
          },
        },
      };
      Object.defineProperty(w, 'crypto', { value: crypto, configurable: true });
      w.TextEncoder = TextEncoder;
      w.ethereum = {
        chainId: '0x2105',
        request: async (r: any) => {
          if (r.method === 'eth_requestAccounts') return ['0x' + 'ab'.repeat(20)];
          signs.push(Buffer.from(String(r.params[0]).slice(2), 'hex').toString('utf8'));
          if (o.reject) throw Object.assign(new Error('User rejected'), { code: 4001 });
          return '0xsig';
        },
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
        if (url.startsWith('/api/v1/shop/auth/nonce?purpose=handoff'))
          return o.reg409
            ? res(409, { error_code: 'wallet_registered', message: 'taken' })
            : res(200, { message: 'combined message' });
        if (url.startsWith('/api/v1/shop/auth/nonce')) return res(200, { message: 'm' });
        if (url === '/api/v1/shop/merchants/handoff')
          return res(201, {
            slug: 'shop-one',
            status: 'active',
            grant: { partner: 'soukbase' },
            ...(o.keys === 'hidden' ? {} : { api_key: API_KEY }),
          });
        if (url === '/api/v1/shop/merchants')
          return o.reg409
            ? res(409, { error_code: 'wallet_registered', message: 'taken' })
            : res(201, { docs_to_accept: [{ doc_id: 'd', version: '1', sha256: 'x' }] });
        if (url.endsWith('/acceptances')) return res(201, { api_key: API_KEY });
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
  // T-0801: watch the DOM at every moment of the flow, not only at the end
  new w.MutationObserver(() => {
    const h = d.documentElement.outerHTML;
    for (const k of [API_KEY, ...xp]) if (h.includes(k)) leaks.push(k);
  }).observe(d, { subtree: true, childList: true, attributes: true, characterData: true });
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
  return {
    w,
    d,
    calls,
    navs,
    tick,
    run,
    out,
    status,
    box,
    keys,
    tick1,
    untick,
    secrets,
    $,
    timers,
    xp,
    leaks,
    signs,
    API_KEY,
  };
}

const GR = { mode: 'register' as const, grant_requested: true };
const URL1 = `${RET}?apibase_slug=shop-one&handoff=${HID}`;

describe('T-0764 done page return', () => {
  it('T1 keys shown + signed grant: Continue disabled until the box, then enabled, no timer ever', async () => {
    const p = await boot({ handoff: GR });
    await p.run();
    const pt = p.$('pt');
    expect(p.out().textContent).toContain('Your store is connected');
    expect(p.keys()).toHaveLength(2);
    expect(pt.hasAttribute('href')).toBe(false);
    expect(pt.getAttribute('aria-disabled')).toBe('true');
    expect(pt.textContent).toBe('Continue on Soukbase');
    expect(p.status().textContent).toBe('Tick the box above first: the keys are shown only once.');
    expect(p.out().querySelector('.cn-warnbox').textContent).toContain(
      'Never send these keys to anyone',
    );
    expect(p.out().textContent).toContain('I saved both keys. They are shown only once.');
    p.tick1();
    expect(pt.textContent).toBe('Continue on Soukbase');
    expect(pt.hasAttribute('aria-disabled')).toBe(false);
    expect(pt.getAttribute('href')).toBe(URL1);
    expect(p.status().textContent).toBe('');
    expect(p.timers).toHaveLength(0);
    p.tick(60);
    expect(p.navs).toEqual([]);
    expect(
      [...p.out().querySelectorAll('button')]
        .filter((b: any) => !b.hidden)
        .map((b: any) => b.textContent),
    ).not.toContain('Stay on this page');
    p.untick();
    expect(pt.hasAttribute('href')).toBe(false);
    p.tick1();
    pt.click();
    expect(p.navs).toEqual([URL1]);
    expect(p.out().textContent).toContain(
      'Soukbase adds your catalog and sets up delivery for this store. You have nothing else to do here.',
    );
    expect(p.out().textContent).not.toContain('Next steps');
    expect(p.out().querySelector('details')).toBeNull();
    p.secrets(p.keys());
  });

  it.each(['stay', 'escape', 'hidden'])(
    'T2 keyless page: stop action %s stops the 5 s return; the link back stays',
    async (how) => {
      const p = await boot({ handoff: GR, keys: 'hidden' });
      await p.run();
      p.tick(2);
      if (how === 'stay')
        [...p.out().querySelectorAll('button')]
          .find((b: any) => b.textContent === 'Stay on this page')
          .click();
      if (how === 'escape') p.d.dispatchEvent(new p.w.KeyboardEvent('keydown', { key: 'Escape' }));
      if (how === 'hidden') {
        Object.defineProperty(p.d, 'hidden', { configurable: true, value: true });
        p.d.dispatchEvent(new p.w.Event('visibilitychange'));
      }
      p.tick(20);
      expect(p.navs).toEqual([]);
      expect(p.status().textContent).toBe(
        'Automatic return stopped. Go to Soukbase when you are ready.',
      );
      expect(p.$('pt').getAttribute('href')).toBe(URL1);
    },
  );

  it('T10 hidden + granted: no keys step at any moment, two lines, docs link, link back at once, 5 s return', async () => {
    const p = await boot({ handoff: GR, keys: 'hidden' });
    await p.run();
    const o = p.out();
    expect(o.querySelector('.cn-key')).toBeNull();
    expect(o.querySelector('.cn-warnbox')).toBeNull();
    expect(p.box()).toBeNull();
    expect(o.textContent).not.toMatch(/API key\b.*shown|Decryption key|Shown once/);
    const lines = [...o.querySelectorAll('p')].map((e: any) => e.textContent);
    expect(lines).toContain(
      'Your shop is ready. Soukbase adds your products for you; there is nothing to save from this page.',
    );
    expect(lines).toContain(
      'Your orders, and an API key if you ever need one, are reached with this wallet: how',
    );
    const how = [...o.querySelectorAll('a')].find((a: any) => a.textContent === 'how');
    expect(how.getAttribute('href')).toBe('/integrator/docs#shop-without-keys');
    const pt = p.$('pt');
    expect(pt.getAttribute('href')).toBe(URL1);
    expect(pt.hasAttribute('aria-disabled')).toBe(false);
    expect(p.status().textContent).toBe('Returning to Soukbase in 5 s');
    p.tick(4);
    expect(p.navs).toEqual([]);
    p.tick(1);
    expect(p.navs).toEqual([URL1]);
    // T-0802: one signature; the per-purpose routes are not called; the keys never reached the DOM,
    // storage or a request, and the route answer carries no key
    expect(p.signs).toEqual(['combined message']);
    expect(p.calls.filter((c) => c.url === '/api/v1/shop/merchants/handoff')).toHaveLength(1);
    for (const u of ['/acceptances', '/grants'])
      expect(p.calls.filter((c) => c.url.endsWith(u))).toHaveLength(0);
    expect(p.calls.filter((c) => c.url === '/api/v1/shop/merchants')).toHaveLength(0);
    const nq = p.calls.find((c) => c.url.includes('purpose=handoff'))!;
    expect(nq.url).toMatch(/&slug=shop-one&kid=k1&pub=[A-Za-z0-9%]+/);
    expect(p.xp).toEqual([]);
    expect(p.leaks).toEqual([]);
    expect(p.d.documentElement.outerHTML).not.toContain(p.API_KEY);
    p.secrets([p.API_KEY]);
  });

  it('T11 the one signature rejected: nothing registered, "Signature 1 of 1" and Try again', async () => {
    const p = await boot({ handoff: GR, keys: 'hidden', reject: true });
    await p.run();
    const er = p.$('er');
    expect(er.hidden).toBe(false);
    expect(er.textContent).toContain('Signature 1 of 1 was not approved. Nothing was charged.');
    expect(p.out().hidden).toBe(true);
    expect(p.calls.filter((c) => c.url === '/api/v1/shop/merchants/handoff')).toHaveLength(0);
    expect([...p.$('sig').children].map((li: any) => li.className)).toEqual([
      'rej',
      'rej',
      'rej',
      'rej',
    ]);
    expect(p.signs).toHaveLength(1);
    expect(p.xp).toEqual([]);
  });

  it('T14 one signature: the page asks once in a handoff with the grant, as before elsewhere', async () => {
    for (const [o, n] of [
      [{ handoff: GR }, 1],
      [{ handoff: GR, keys: 'hidden' }, 1],
      [{ from: true }, 3],
      [{ from: false }, 3],
      [{ handoff: { mode: 'register', grant_requested: false } }, 3],
      [{ handoff: { mode: 'grant', grant_requested: false } }, 1],
    ] as Array<[Opt, number]>) {
      const p = await boot(o);
      await p.run();
      expect(p.signs).toHaveLength(n);
      const oneMsg = !!(o.handoff && o.handoff.mode === 'register' && o.handoff.grant_requested);
      expect(p.calls.some((c) => c.url === '/api/v1/shop/merchants/handoff')).toBe(oneMsg);
      expect(p.calls.some((c) => c.url === '/api/v1/shop/merchants')).toBe(
        !oneMsg && o.handoff?.mode !== 'grant',
      );
    }
  });

  it('T12 arrival without a handoff: keys step, Continue only after the box, no timer', async () => {
    const p = await boot({ from: true });
    await p.run();
    expect(p.keys()).toHaveLength(2);
    expect(p.$('pt').hasAttribute('href')).toBe(false);
    p.tick1();
    expect(p.$('pt').getAttribute('href')).toBe(`${RET}?apibase_slug=shop-one`);
    expect(p.timers).toHaveLength(0);
    p.tick(30);
    expect(p.navs).toEqual([]);
  });

  it('T3 no grant requested: the four steps sit in a closed details', async () => {
    for (const o of [
      { from: true },
      { handoff: { mode: 'register', grant_requested: false } },
    ] as Opt[]) {
      const p = await boot(o);
      await p.run();
      const dt = p.out().querySelector('details');
      expect(dt.open).toBe(false);
      expect(dt.querySelector('summary').textContent).toBe('Set the store up yourself');
      expect(dt.querySelectorAll('.cn-todo li')).toHaveLength(4);
      expect(p.out().textContent).not.toContain('adds your catalog and sets up delivery');
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
    // T-0802: the 409 comes before any signature, from the handoff nonce
    expect(p.calls.filter((c) => c.url.includes('purpose=handoff'))).toHaveLength(1);
    expect(p.calls.filter((c) => c.url === '/api/v1/shop/merchants/handoff')).toHaveLength(0);
    expect(p.signs).toHaveLength(1); // the grant-only signature
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
    expect(p.timers).toHaveLength(0);
    p.secrets(p.keys());
  });

  it('T13 the server puts the registry seller_keys of the partner into the page JSON', async () => {
    const db = {
      $queryRawUnsafe: async () => [
        {
          handoff_id: HID,
          prefill: null,
          expected_wallet: null,
          mode: 'register',
          grant_requested: true,
        },
      ],
      $executeRawUnsafe: async () => 0,
    };
    const app = express();
    app.use(createIntegratorRouter({ limit: 10_000, db: db as never }));
    const srv = app.listen(0);
    try {
      const u = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/integrator/connect?from=soukbase&handoff=${HID}`;
      const h = await (await fetch(u)).text();
      const pf = JSON.parse(/<script type="application\/json" id="pf">(.*?)<\/script>/.exec(h)![1]);
      expect(pf).toMatchObject({ mode: 'register', grant_requested: true, seller_keys: 'hidden' });
      expect(h).toContain('/integrator/docs#shop-without-keys');
    } finally {
      srv.close();
    }
  });
});
