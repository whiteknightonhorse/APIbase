/** T-0377: 3-step human sign-up on /integrator/connect; the signed messages and API calls are unchanged. */
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createIntegratorRouter } from '../../src/shop/routes/integrator.router';

jest.mock('../../src/config', () => ({ config: {} }));

let server: ReturnType<express.Express['listen']>;
let page: string;
beforeAll(async () => {
  const app = express();
  app.use(createIntegratorRouter({ limit: 10_000 }));
  server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  page = await (await fetch(`${base}/integrator/connect`)).text();
});
afterAll(() => server.close());

const ENC = "'apibase.pro merchant encryption key\\nkid: k1\\nalg: x25519\\npub: '";

describe('connect page steps', () => {
  it('has the three step containers and a progress bar', () => {
    for (const id of ['s1', 's2', 's3']) expect(page).toContain(`id="${id}"`);
    for (const t of ['1 Your store', '2 Agreements', '3 Connect wallet']) expect(page).toContain(t);
    expect(page).toContain('id="out"');
    expect(page).toContain('id="docs"');
  });

  it('keeps every original field name', () => {
    for (const n of [
      'slug',
      'name',
      'category',
      'country',
      'contact_email',
      'site_url',
      'payout_wallet_base',
      'payout_wallet_tempo',
      'accept',
    ])
      expect(page).toContain(`name="${n}"`);
  });

  it('keeps the signed message templates, API calls and signing order frozen', () => {
    const script = page.split('<script>').pop()!;
    expect(script).toContain(ENC);
    for (const l of [
      "'/api/v1/shop/auth/nonce?wallet='",
      "'&purpose='",
      "'/api/v1/shop/merchants'",
      "'/api/v1/shop/merchants/me/acceptances'",
      "'register'",
      "'accept_terms'",
      "'personal_sign'",
      "'checkbox+wallet_signature'",
    ])
      expect(script).toContain(l);
    const at = (s: string): number => script.indexOf(s);
    const order = [
      "await sign(w, 'apibase.pro merchant encryption key",
      'signature: await sign(w, n.message)',
      'signature: await sign(w, a.message)',
    ].map(at);
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
  });

  it('has the no-wallet block with both deep links and the copy link', () => {
    expect(page).toContain('https://metamask.app.link/dapp/apibase.pro/integrator/connect');
    expect(page).toContain(
      'https://go.cb-w.com/dapp?cb_url=https%3A%2F%2Fapibase.pro%2Fintegrator%2Fconnect',
    );
    expect(page).toContain('data-copy="https://apibase.pro/integrator/connect"');
    expect(page).toContain('href="/integrator/wallet"');
    expect(page).toContain('href="/integrator/agent-guide"');
  });

  it('links the four legal documents and fires the funnel events', () => {
    for (const d of ['merchant-agreement', 'aup', 'dpa', 'refund-framework'])
      expect(page).toContain(`href="/legal/${d}"`);
    expect(page).toContain("T('sign_up', { method: 'wallet' })");
    expect(page).toContain("T('connect_step'");
  });
});
