/**
 * T-0800: the connect page lets the person choose the wallet (EIP-6963). The served page runs in jsdom with fake
 * providers; every provider records the requests it receives.
 */
import express from 'express';
import { webcrypto } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import {
  createIntegratorRouter,
  grantVariant,
  onePageVariant,
} from '../../src/shop/routes/integrator.router';

jest.mock('../../src/config', () => ({ config: {} }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM, VirtualConsole } = require('jsdom');

let server: ReturnType<express.Express['listen']>;
let base: string;
const HID = '11111111-2222-3333-4444-555555555555';
const EXP = '0x' + 'cd'.repeat(20);
const OTHER = '0x' + 'ab'.repeat(20);
beforeAll(() => {
  const app = express();
  app.use(createIntegratorRouter({ limit: 10_000 }));
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

/** T-0870: `accounts` is the array eth_requestAccounts returns (default [account]). */
type Fake = { name: string; rdns: string; account: string; icon?: string; accounts?: string[] };
const ICON = 'data:image/svg+xml;base64,PHN2Zy8+';

async function boot(o: {
  wallets: Fake[];
  legacy?: Fake;
  handoff?: boolean;
  remembered?: string;
  hold?: { rdns: string; method: string };
  perm?: 'ok' | 'unsupported' | 'reject';
  emailNote?: boolean;
  /** T-0869: a one-page handoff (register + grant_requested + one_page); every field is on the one page. */
  onePage?: boolean;
  /** T-0870: every request of this method waits until release() (any provider) */
  hang?: string;
  /** T-0870: the first N eth_requestAccounts answer -32002 (a request already waiting in the wallet) */
  pending?: number;
  /** T-0870: the n-th eth_requestAccounts (1-based) answers -32002 */
  pendingNth?: number;
  /** T-0870: a GET to /api/v1/shop/auth/nonce never answers (only its abort signal ends it) */
  hangGet?: boolean;
}) {
  let html = await (await fetch(`${base}/integrator/connect?from=soukbase`)).text();
  if (o.handoff) {
    const pf = JSON.stringify({
      prefill: {},
      expected_wallet: EXP,
      mode: 'register',
      grant_requested: !!o.onePage,
      ...(o.emailNote ? { email_note: true } : {}),
      ...(o.onePage ? { one_page: true } : {}),
    });
    html = html.replace(
      '<a id="pt"',
      `<input type="hidden" name="handoff" value="${HID}" data-partner="Soukbase" form="f"><script type="application/json" id="pf">${pf}</script><a id="pt"`,
    );
    if (o.onePage)
      html = onePageVariant(
        grantVariant(html, 'Soukbase', { mode: 'register', grant_requested: true }),
        'Soukbase',
        EXP,
      );
  }
  const log: { who: string; method: string; params?: unknown; phase?: string }[] = [];
  const handlers: Record<string, ((a: string[]) => void)[]> = {};
  const held: (() => void)[] = [];
  /** T-0870: the accounts each fake returns now; accountsChanged (emit) updates them */
  const acc: Record<string, string[]> = {};
  let nreq = 0;
  let doc: any = null;
  const mk = (f: Fake) => ({
    chainId: '0x2105',
    request: async (r: { method: string; params?: unknown }) => {
      acc[f.rdns] ||= f.accounts ?? [f.account];
      log.push({
        who: f.rdns,
        method: r.method,
        params: r.params,
        phase: doc?.getElementById('wt')?.dataset.phase,
      });
      if (r.method === 'wallet_requestPermissions') {
        if (o.perm === 'unsupported') throw Object.assign(new Error('unsupported'), { code: 4200 });
        if (o.perm === 'reject') throw Object.assign(new Error('rejected'), { code: 4001 });
        acc[f.rdns] = [EXP];
        return [{ parentCapability: 'eth_accounts' }];
      }
      if (r.method === 'eth_accounts') return acc[f.rdns];
      if (
        r.method === 'eth_requestAccounts' &&
        (++nreq <= (o.pending ?? 0) || nreq === o.pendingNth)
      ) {
        throw Object.assign(new Error('already pending'), { code: -32002 });
      }
      if ((o.hold && o.hold.rdns === f.rdns && o.hold.method === r.method) || o.hang === r.method)
        await new Promise<void>((res) => held.push(res));
      return r.method === 'eth_requestAccounts' ? acc[f.rdns] : '0xsig';
    },
    on: (ev: string, h: (a: string[]) => void) => (
      (handlers[f.rdns + ev] ||= []).push(h),
      undefined
    ),
    removeListener: (ev: string, h: (a: string[]) => void) => {
      handlers[f.rdns + ev] = (handlers[f.rdns + ev] || []).filter((x) => x !== h);
    },
  });
  const timers: { fn: () => void; at: number; id: number }[] = [];
  const calls: { url: string; method: string }[] = [];
  let now = 0,
    seq = 0;
  const advance = (ms: number) => {
    now += ms;
    for (;;) {
      const due = timers.filter((t) => t.at <= now).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      timers.splice(timers.indexOf(due), 1);
      due.fn();
    }
  };
  const providers = Object.fromEntries(
    [...o.wallets, ...(o.legacy ? [o.legacy] : [])].map((f) => [f.rdns, mk(f)]),
  );
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    virtualConsole: new VirtualConsole().sendTo(console),
    pretendToBeVisual: true,
    url: 'https://apibase.pro/integrator/connect?from=soukbase',
    beforeParse(w: any) {
      Object.defineProperty(w, 'crypto', { value: webcrypto, configurable: true });
      w.TextEncoder = TextEncoder;
      if (o.remembered) w.localStorage.setItem('apibase_wallet', o.remembered);
      if (o.legacy) w.ethereum = providers[o.legacy.rdns];
      w.addEventListener('eip6963:requestProvider', () => {
        o.wallets.forEach((f, i) =>
          w.dispatchEvent(
            new w.CustomEvent('eip6963:announceProvider', {
              detail: {
                info: { uuid: 'u' + i, name: f.name, rdns: f.rdns, icon: f.icon || '' },
                provider: providers[f.rdns],
              },
            }),
          ),
        );
      });
      // T-0870: manual timers; only advance() moves them
      w.setTimeout = (fn: () => void, ms = 0) => {
        timers.push({ fn, at: now + ms, id: ++seq });
        return seq;
      };
      w.clearTimeout = (id: number) => {
        const i = timers.findIndex((t) => t.id === id);
        if (i >= 0) timers.splice(i, 1);
      };
      w.fetch = async (url: string, init: any = {}) => {
        calls.push({ url, method: init.method || 'GET' });
        if (o.hangGet && url.startsWith('/api/v1/shop/auth/nonce'))
          return new Promise((_res, rej) =>
            init.signal?.addEventListener('abort', () => rej(new Error('aborted'))),
          );
        return {
          ok: true,
          status: 200,
          json: async () => (url.startsWith('/legal') ? [] : { message: 'm' }),
        };
      };
    },
  });
  const w = dom.window,
    d = w.document,
    $ = (id: string) => d.getElementById(id);
  doc = d;
  const fill = (n: string, v: string) => {
    const e = d.querySelector(`[name=${n}]`);
    e.value = v;
    e.dispatchEvent(new w.Event('input', { bubbles: true }));
  };
  const toStep3 = () => {
    fill('name', 'Shop One');
    fill('site_url', 'https://shop.example');
    fill('contact_email', 'a@b.co');
    if (o.onePage) return; // one page: the next press is the wallet press
    $('nx').click();
    $('nx').click();
  };
  const settle = () => new Promise((r) => setTimeout(r, 60));
  const wc = (): any => $('wn').previousElementSibling;
  const box = (): any =>
    [...d.querySelectorAll('.cn-net')].find(
      (e: any) => /Different wallet/.test(e.textContent) && !e.hidden,
    );
  const choices = () =>
    [...wc().querySelectorAll('button')].map((b: any) => b.textContent as string);
  const emit = (rdns: string, a: string[]) => {
    acc[rdns] = a; // T-0870: a wallet that announces an account returns it afterwards
    (handlers[rdns + 'accountsChanged'] || []).forEach((h) => h(a));
  };
  const release = () => held.splice(0).forEach((x) => x());
  const press = (label: string) =>
    ([...wc().querySelectorAll('button')] as HTMLElement[])
      .find((b) => b.textContent === label)!
      .click();
  const pickBtn = (): any =>
    ([...(box()?.querySelectorAll('button') ?? [])] as any[]).find(
      (b) => b.textContent === 'Choose account in wallet' && !b.hidden,
    );
  return {
    w,
    d,
    $,
    log,
    calls,
    advance,
    pickBtn,
    toStep3,
    settle,
    wc,
    box,
    choices,
    emit,
    release,
    press,
  };
}

const A: Fake = { name: 'Alpha', rdns: 'io.alpha', account: OTHER, icon: ICON };
const B: Fake = { name: 'Beta', rdns: 'io.beta', account: EXP, icon: 'https://evil.example/x.png' };

describe('T-0800 connect page wallet choice', () => {
  it('asks no provider before a press', async () => {
    const p = await boot({ wallets: [A, B], handoff: true });
    p.toStep3();
    await p.settle();
    expect(p.log).toEqual([]);
    expect(p.choices()).toEqual(['Alpha', 'Beta']);
  });

  it('two wallets: pick the one with the expected address; the box never appears; only it is asked', async () => {
    const p = await boot({ wallets: [A, B], handoff: true });
    p.toStep3();
    p.$('nx').click();
    await p.settle();
    expect(p.log).toEqual([]);
    expect(p.choices()).toEqual(['Alpha', 'Beta']);
    const imgs = [...p.wc().querySelectorAll('img')];
    expect(imgs).toHaveLength(1);
    expect(imgs[0].getAttribute('src')).toBe(ICON);
    ([...p.wc().querySelectorAll('button')] as HTMLElement[])[1].click();
    await p.settle();
    expect(p.box()).toBeUndefined();
    expect(p.log.length).toBeGreaterThan(0);
    expect(new Set(p.log.map((l) => l.who))).toEqual(new Set(['io.beta']));
    expect(p.w.localStorage.getItem('apibase_wallet')).toBe('io.beta');
  });

  it.each([false, true])(
    'one wallet with another address: both addresses, sign control disabled; accountsChanged clears it (one page: %s)',
    async (onePage) => {
      const p = await boot({ wallets: [A], handoff: true, onePage });
      p.toStep3();
      p.$('nx').click();
      await p.settle();
      const b = p.box()!;
      expect(b.textContent).toContain(
        'Connected: 0xabab…abab in Alpha. Expected: 0xcdcd…cdcd, the wallet you used on Soukbase. Switch to that account in your wallet, or press Other wallet.',
      );
      expect([...b.querySelectorAll('[title]')].map((e: any) => e.title)).toEqual([OTHER, EXP]);
      expect(b.textContent).not.toContain('payout');
      expect((p.$('nx') as HTMLButtonElement).disabled).toBe(true);
      expect(p.log.map((l) => l.method)).toEqual(['eth_requestAccounts']);
      p.emit('io.alpha', [EXP.toUpperCase().replace('0X', '0x')]);
      await p.settle();
      expect(p.box()).toBeUndefined();
      expect((p.$('nx') as HTMLButtonElement).disabled).toBe(false);
      p.emit('io.alpha', [OTHER]);
      expect(p.box()).toBeDefined();
    },
  );

  it('no announcement: window.ethereum is used', async () => {
    const p = await boot({ wallets: [], legacy: { name: 'Legacy', rdns: 'legacy', account: EXP } });
    p.toStep3();
    expect(p.log).toEqual([]);
    p.$('nx').click();
    await p.settle();
    expect(p.log.map((l) => l.who)).toEqual(p.log.map(() => 'legacy'));
    expect(p.log[0].method).toBe('eth_requestAccounts');
  });

  it('an announced wallet wins over window.ethereum', async () => {
    const p = await boot({
      wallets: [B],
      legacy: { name: 'Legacy', rdns: 'legacy', account: OTHER },
    });
    p.toStep3();
    p.$('nx').click();
    await p.settle();
    expect(new Set(p.log.map((l) => l.who))).toEqual(new Set(['io.beta']));
  });

  it('the remembered choice is offered first', async () => {
    const p = await boot({ wallets: [A, B], handoff: true, remembered: 'io.beta' });
    p.toStep3();
    p.$('nx').click();
    await p.settle();
    expect(p.choices()).toEqual(['Beta', 'Alpha']);
  });

  it('Other wallet reopens the list and later calls go to the new choice', async () => {
    const p = await boot({ wallets: [A], handoff: true });
    p.toStep3();
    p.$('nx').click();
    await p.settle();
    const other = ([...p.wc().querySelectorAll('button')] as HTMLElement[]).find(
      (b) => b.textContent === 'Other wallet',
    )!;
    other.click();
    expect(p.choices()).toEqual(['Alpha']);
  });

  it('the sign button stays disabled while the signatures are in flight (no second run)', async () => {
    const G: Fake = { ...B, account: EXP };
    const p = await boot({
      wallets: [G],
      handoff: true,
      hold: { rdns: G.rdns, method: 'personal_sign' },
    });
    p.toStep3();
    p.$('nx').click();
    await p.settle();
    expect(p.log.map((x) => x.method)).toEqual(['eth_requestAccounts', 'personal_sign']);
    expect(p.$('nx').disabled).toBe(true);
    p.$('nx').click();
    await p.settle();
    expect(p.log.filter((x) => x.method === 'eth_requestAccounts')).toHaveLength(1);
    p.release();
  });

  it('a pending run of a wallet the person moved away from signs nothing', async () => {
    const A2: Fake = { ...A, account: EXP };
    const p = await boot({
      wallets: [A2, B],
      handoff: true,
      hold: { rdns: A2.rdns, method: 'eth_requestAccounts' },
    });
    p.toStep3();
    p.press('Alpha');
    await p.settle();
    p.press('Other wallet');
    p.press('Beta');
    await p.settle();
    p.release();
    await p.settle();
    expect(p.log.filter((x) => x.who === 'io.alpha').map((x) => x.method)).toEqual([
      'eth_requestAccounts',
    ]);
    expect(p.log.some((x) => x.who === 'io.beta' && x.method === 'personal_sign')).toBe(true);
  });

  it('accountsChanged after a late second announcement still updates the box', async () => {
    const p = await boot({ wallets: [A], handoff: true });
    p.toStep3();
    p.$('nx').click();
    await p.settle();
    expect(p.box()).toBeTruthy();
    p.w.dispatchEvent(
      new p.w.CustomEvent('eip6963:announceProvider', {
        detail: {
          info: { uuid: 'late', name: 'Late', rdns: 'io.late', icon: '' },
          provider: { request: async () => [] },
        },
      }),
    );
    expect(() => p.emit(A.rdns, [OTHER])).not.toThrow();
    expect(p.box().textContent).toContain('in Alpha');
    p.emit(A.rdns, [EXP]);
    expect(p.box()).toBeUndefined();
  });
});

describe('T-0832 different wallet: next step and account picker', () => {
  const open = async (perm?: 'ok' | 'unsupported' | 'reject') => {
    const p = await boot({ wallets: [A], handoff: true, perm });
    p.toStep3();
    p.$('nx').click();
    await p.settle();
    return p;
  };
  const perms = (p: any) => p.log.filter((l: any) => l.method === 'wallet_requestPermissions');

  it('shows the next-step line with the short expected address and the main button label, and the button; no request before a press', async () => {
    const p = await open('ok');
    expect(p.box().textContent).toContain(
      'In your wallet open the account menu, choose 0xcdcd…cdcd, then press Connect wallet.',
    );
    expect(p.pickBtn()).toBeDefined();
    expect(perms(p)).toHaveLength(0);
  });

  it('a press calls wallet_requestPermissions once with eth_accounts, then eth_accounts, and clears the warning', async () => {
    const p = await open('ok');
    p.pickBtn().click();
    await p.settle();
    expect(perms(p)).toHaveLength(1);
    expect(p.log.map((l: any) => l.method).slice(-2)).toEqual([
      'wallet_requestPermissions',
      'eth_accounts',
    ]);
    expect(p.box()).toBeUndefined();
    expect((p.$('nx') as HTMLButtonElement).disabled).toBe(false);
  });

  it('unsupported (4200): the button is hidden, the line stays', async () => {
    const p = await open('unsupported');
    p.pickBtn().click();
    await p.settle();
    expect(perms(p)).toHaveLength(1);
    expect(p.pickBtn()).toBeUndefined();
    expect(p.box().textContent).toContain('In your wallet open the account menu');
    p.emit('io.alpha', [OTHER]);
    expect(p.pickBtn()).toBeUndefined();
  });

  it('user rejection (4001): the warning and the button stay', async () => {
    const p = await open('reject');
    p.pickBtn().click();
    await p.settle();
    expect(p.box()).toBeDefined();
    expect(p.pickBtn()).toBeDefined();
    expect((p.$('nx') as HTMLButtonElement).disabled).toBe(true);
  });

  it('accountsChanged to the expected address hides the warning and enables the main button', async () => {
    const p = await open('ok');
    p.emit('io.alpha', [EXP]);
    expect(p.box()).toBeUndefined();
    expect((p.$('nx') as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('T-0832 email note', () => {
  it('email_note puts the partner line under Contact email, before its own hint', async () => {
    const p = await boot({ wallets: [A], handoff: true, emailNote: true });
    const lab = p.d.querySelector('[name=contact_email]').closest('label');
    const hints = [lab.nextElementSibling, lab.nextElementSibling.nextElementSibling];
    expect(hints[0].textContent).toBe(
      'Soukbase does not pass your email. Type the address for messages from APIbase.',
    );
    expect(hints[1].textContent).toBe('Never shown to buyers. We write only about your shop.');
  });
  it('without email_note there is no such line', async () => {
    const p = await boot({ wallets: [A], handoff: true });
    expect(p.d.getElementById('s1').textContent).not.toContain('does not pass your email');
  });
});

describe('T-0870 wallet step: expected account, continue by itself, help line, repeat', () => {
  const C: Fake = { ...B, account: EXP }; // a wallet on the expected account
  const signs = (p: any) => p.log.filter((l: any) => l.method === 'personal_sign');
  const posts = (p: any) => p.calls.filter((c: any) => c.method === 'POST');
  const vis = (e: any) => !!e && !e.hidden;

  it('the expected account is second in eth_requestAccounts: no "Different wallet", the signature carries it', async () => {
    const p = await boot({ wallets: [{ ...A, accounts: [OTHER, EXP] }], handoff: true });
    p.toStep3();
    p.$('nx').click();
    await p.settle();
    expect(p.box()).toBeUndefined();
    expect(signs(p).length).toBeGreaterThan(0);
    expect((signs(p)[0].params as string[])[1]).toBe(EXP);
  });

  it('wrong account, "Choose account in wallet", the wallet returns the expected one: one signature, no second press', async () => {
    const p = await boot({ wallets: [A], handoff: true, perm: 'ok', hang: 'personal_sign' });
    p.toStep3();
    p.$('nx').click();
    await p.settle();
    expect(p.box()).toBeDefined();
    p.pickBtn().click();
    await p.settle();
    p.advance(0);
    await p.settle();
    expect(signs(p)).toHaveLength(1);
    expect((signs(p)[0].params as string[])[1]).toBe(EXP);
    expect(p.box()).toBeUndefined();
  });

  it('wrong account, then accountsChanged to the expected one: one signature, no second press', async () => {
    const p = await boot({ wallets: [A], handoff: true, hang: 'personal_sign' });
    p.toStep3();
    p.$('nx').click();
    await p.settle();
    p.emit('io.alpha', [EXP]);
    p.advance(0);
    await p.settle();
    expect(signs(p)).toHaveLength(1);
    expect((signs(p)[0].params as string[])[1]).toBe(EXP);
    p.advance(0);
    await p.settle();
    expect(signs(p)).toHaveLength(1);
  });

  it('no earlier press: an accountsChanged event sends nothing', async () => {
    const p = await boot({ wallets: [A], handoff: true });
    p.toStep3();
    p.emit('io.alpha', [EXP]);
    p.advance(20_000);
    await p.settle();
    expect(p.log).toEqual([]);
  });

  it('personal_sign hangs: help line at 8 s, the press sends the same request again, the first answer registers once', async () => {
    const p = await boot({ wallets: [C], handoff: true, onePage: true, hang: 'personal_sign' });
    p.toStep3();
    p.$('nx').click();
    await p.settle();
    expect(p.log.map((l) => l.method)).toEqual(['eth_requestAccounts', 'personal_sign']);
    expect(p.$('nx').disabled).toBe(true);
    p.advance(7_999);
    expect(p.$('wl').hidden).toBe(true);
    p.advance(1);
    const wl = p.$('wl');
    expect(vis(wl)).toBe(true);
    expect(wl.dataset.why).toBe('silent');
    expect(wl.getAttribute('role')).toBe('status');
    expect(wl.textContent).toBe(
      'No wallet window? Open Beta from the browser toolbar: the request is waiting there. If nothing is there, press Sign with wallet again.',
    );
    expect(p.$('nx').disabled).toBe(false);
    p.$('nx').click();
    await p.settle();
    expect(signs(p)).toHaveLength(2);
    expect(signs(p)[1].params).toEqual(signs(p)[0].params);
    expect(p.log.filter((l) => l.method === 'eth_requestAccounts')).toHaveLength(1);
    p.release();
    await p.settle();
    expect(posts(p)).toHaveLength(1);
    expect(posts(p)[0].url).toBe('/api/v1/shop/merchants/handoff');
    expect(p.$('out').hidden).toBe(false);
  });

  it('eth_requestAccounts answers -32002: the help line at once, no error box; a later accountsChanged starts the run', async () => {
    const p = await boot({ wallets: [C], handoff: true, onePage: true, pending: 1 });
    p.toStep3();
    p.$('nx').click();
    await p.settle();
    const wl = p.$('wl');
    expect(vis(p.$('wt')) && vis(wl)).toBe(true);
    expect(wl.dataset.why).toBe('pending');
    expect(wl.textContent).toBe(
      'Beta already has a request from this page waiting. Open it from the browser toolbar and answer it.',
    );
    expect(vis(p.$('wtg')) && p.$('wts').hidden).toBe(true); // "Waiting for your wallet", no number
    expect(p.$('er').hidden).toBe(true);
    expect(p.$('er').textContent).not.toContain('Something went wrong');
    expect(p.$('nx').disabled).toBe(false);
    expect(signs(p)).toHaveLength(0);
    p.emit('io.beta', [EXP]);
    p.advance(0);
    await p.settle();
    expect(p.log.filter((l) => l.method === 'eth_requestAccounts')).toHaveLength(2);
    expect(signs(p)).toHaveLength(1);
    expect(posts(p)).toHaveLength(1);
  });

  it('a -32002 on the repeat while the first request waits only shows the help line', async () => {
    const p = await boot({
      wallets: [C],
      handoff: true,
      onePage: true,
      hang: 'eth_requestAccounts',
      pendingNth: 2,
    });
    p.toStep3();
    p.$('nx').click();
    await p.settle();
    p.advance(8_000);
    expect(p.$('wl').dataset.why).toBe('silent');
    expect(p.$('wts').hidden).toBe(true);
    expect(vis(p.$('wtg'))).toBe(true); // "Waiting for your wallet", no number
    p.$('nx').click();
    await p.settle();
    expect(p.log.filter((l) => l.method === 'eth_requestAccounts')).toHaveLength(2);
    expect(p.$('wl').dataset.why).toBe('pending');
    expect(p.$('wl').hidden).toBe(false);
    expect(p.$('er').hidden).toBe(true);
    expect(signs(p)).toHaveLength(0);
    p.release();
    await p.settle();
    expect(signs(p)).toHaveLength(1);
  });

  it('"Other wallet" during a hanging signature, then the old signature answers: nothing is sent to APIbase', async () => {
    const A2: Fake = { ...A, account: EXP };
    const p = await boot({ wallets: [A2, B], handoff: true, hang: 'personal_sign' });
    p.toStep3();
    p.press('Alpha');
    await p.settle();
    expect(signs(p)).toHaveLength(1);
    const before = p.calls.length;
    p.press('Other wallet');
    p.release();
    await p.settle();
    expect(p.calls.slice(before).filter((c: any) => c.url.startsWith('/api/'))).toEqual([]);
    expect(p.$('wl').hidden).toBe(true);
  });

  it('#wta names the short address and the wallet', async () => {
    const p = await boot({ wallets: [C], handoff: true, onePage: true, hang: 'personal_sign' });
    p.toStep3();
    p.$('nx').click();
    await p.settle();
    const a = p.$('wta');
    expect(vis(a)).toBe(true);
    expect(a.textContent).toBe('Signing with 0xcdcd…cdcd in Beta.');
    expect(a.querySelector('[title]').title).toBe(EXP);
    expect(p.$('wt').dataset.phase).toBe('wallet');
  });

  it('the GET for the message hangs: "preparing", the wallet is not asked, no help line; at 15 s "APIbase did not answer"', async () => {
    const p = await boot({ wallets: [C], handoff: true, onePage: true, hangGet: true });
    p.toStep3();
    p.$('nx').click();
    await p.settle();
    const t = p.$('wt');
    expect(t.dataset.phase).toBe('prepare');
    expect(vis(t) && vis(p.$('wp'))).toBe(true);
    expect(p.$('wp').textContent).toBe(
      'Preparing signature 1 of 1. Your wallet has not been asked yet.',
    );
    // both headings: the numbered one a real run shows (#wts) and the plain one (#wtg)
    expect(p.$('wts').hidden).toBe(true);
    expect(p.$('wtg').hidden).toBe(true);
    expect([...t.querySelectorAll('b')].filter((b: any) => !b.hidden)).toEqual([]);
    expect(t.textContent).toContain('Waiting for your wallet'); // present in the DOM, only hidden
    expect(p.$('wta').hidden).toBe(true);
    expect(signs(p)).toHaveLength(0);
    p.advance(8_000);
    expect(p.$('wl').hidden).toBe(true);
    p.advance(7_000);
    await p.settle();
    const er = p.$('er');
    expect(er.hidden).toBe(false);
    expect(er.querySelector('b').textContent).toBe('APIbase did not answer');
    expect(er.querySelector('small').textContent).toBe(
      'Your wallet was not asked. Press Try again.',
    );
    expect([...er.querySelectorAll('button')].map((b: any) => b.textContent)).toEqual([
      'Try again',
    ]);
    expect(signs(p)).toHaveLength(0);
  });

  it('the GET answers: data-phase turns "wallet" in the tick the wallet receives personal_sign', async () => {
    const p = await boot({ wallets: [C], handoff: true, onePage: true, hang: 'personal_sign' });
    p.toStep3();
    p.$('nx').click();
    await p.settle();
    expect(signs(p)).toHaveLength(1);
    expect(signs(p)[0].phase).toBe('wallet');
    expect(p.log[0].phase).not.toBe('wallet');
    expect(p.$('wp').hidden).toBe(true);
    expect(p.$('wtg').hidden).toBe(true);
    expect(vis(p.$('wts'))).toBe(true);
    expect(p.$('wts').textContent).toBe('Waiting for your wallet — signature 1 of 1');
  });

  it('grantVariant still finds the "of 3" anchor in both variants', async () => {
    const html = await (await fetch(`${base}/integrator/connect?from=soukbase`)).text();
    expect(html.split('<span id="wtn">1</span> of 3</b>')).toHaveLength(2); // shop-partner-grant expects 'of 1</b>'
    for (const v of [
      { mode: 'grant' as const, grant_requested: false },
      { mode: 'register' as const, grant_requested: true },
    ])
      expect(grantVariant(html, 'Soukbase', v)).toContain('<span id="wtn">1</span> of 1</b>');
  });
});
