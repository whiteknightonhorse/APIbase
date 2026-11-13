/**
 * T-0800: the connect page lets the person choose the wallet (EIP-6963). The served page runs in jsdom with fake
 * providers; every provider records the requests it receives.
 */
import express from 'express';
import { webcrypto } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createIntegratorRouter } from '../../src/shop/routes/integrator.router';

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

type Fake = { name: string; rdns: string; account: string; icon?: string };
const ICON = 'data:image/svg+xml;base64,PHN2Zy8+';

async function boot(o: {
  wallets: Fake[];
  legacy?: Fake;
  handoff?: boolean;
  remembered?: string;
  hold?: { rdns: string; method: string };
  perm?: 'ok' | 'unsupported' | 'reject';
  emailNote?: boolean;
}) {
  let html = await (await fetch(`${base}/integrator/connect?from=soukbase`)).text();
  if (o.handoff) {
    const pf = JSON.stringify({
      prefill: {},
      expected_wallet: EXP,
      mode: 'register',
      grant_requested: false,
      ...(o.emailNote ? { email_note: true } : {}),
    });
    html = html.replace(
      '<a id="pt"',
      `<input type="hidden" name="handoff" value="${HID}" data-partner="Soukbase" form="f"><script type="application/json" id="pf">${pf}</script><a id="pt"`,
    );
  }
  const log: { who: string; method: string }[] = [];
  const handlers: Record<string, ((a: string[]) => void)[]> = {};
  const held: (() => void)[] = [];
  const mk = (f: Fake) => ({
    chainId: '0x2105',
    request: async (r: { method: string }) => {
      log.push({ who: f.rdns, method: r.method });
      if (r.method === 'wallet_requestPermissions') {
        if (o.perm === 'unsupported') throw Object.assign(new Error('unsupported'), { code: 4200 });
        if (o.perm === 'reject') throw Object.assign(new Error('rejected'), { code: 4001 });
        f = { ...f, account: EXP };
        return [{ parentCapability: 'eth_accounts' }];
      }
      if (r.method === 'eth_accounts') return [f.account];
      if (o.hold && o.hold.rdns === f.rdns && o.hold.method === r.method)
        await new Promise<void>((res) => held.push(res));
      return r.method === 'eth_requestAccounts' ? [f.account] : '0xsig';
    },
    on: (ev: string, h: (a: string[]) => void) => (
      (handlers[f.rdns + ev] ||= []).push(h),
      undefined
    ),
    removeListener: (ev: string, h: (a: string[]) => void) => {
      handlers[f.rdns + ev] = (handlers[f.rdns + ev] || []).filter((x) => x !== h);
    },
  });
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
      w.fetch = async (url: string) => ({
        ok: true,
        status: 200,
        json: async () => (url.startsWith('/legal') ? [] : { message: 'm' }),
      });
    },
  });
  const w = dom.window,
    d = w.document,
    $ = (id: string) => d.getElementById(id);
  const fill = (n: string, v: string) => {
    const e = d.querySelector(`[name=${n}]`);
    e.value = v;
    e.dispatchEvent(new w.Event('input', { bubbles: true }));
  };
  const toStep3 = () => {
    fill('name', 'Shop One');
    fill('site_url', 'https://shop.example');
    fill('contact_email', 'a@b.co');
    $('nx').click();
    d.querySelector('[name=accept]').checked = true;
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
  const emit = (rdns: string, a: string[]) =>
    (handlers[rdns + 'accountsChanged'] || []).forEach((h) => h(a));
  const release = () => held.splice(0).forEach((x) => x());
  const press = (label: string) =>
    ([...wc().querySelectorAll('button')] as HTMLElement[])
      .find((b) => b.textContent === label)!
      .click();
  const pickBtn = (): any =>
    ([...(box()?.querySelectorAll('button') ?? [])] as any[]).find(
      (b) => b.textContent === 'Choose account in wallet' && !b.hidden,
    );
  return { w, d, $, log, pickBtn, toStep3, settle, wc, box, choices, emit, release, press };
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

  it('one wallet with another address: both addresses, sign control disabled; accountsChanged clears it', async () => {
    const p = await boot({ wallets: [A], handoff: true });
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
  });

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
