/**
 * T-0867: a contact email passed by a partner handoff (email_given) is shown in one line (#ce-line) with a
 * Change button, not asked. The served page runs in jsdom; no wallet is involved.
 */
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createIntegratorRouter } from '../../src/shop/routes/integrator.router';

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

async function boot(pf: Record<string, unknown> | null) {
  let html = await (await fetch(`${base}/integrator/connect?from=soukbase`)).text();
  if (pf) {
    const json = JSON.stringify({
      expected_wallet: null,
      mode: 'register',
      grant_requested: false,
      ...pf,
    });
    html = html.replace(
      '<a id="pt"',
      `<input type="hidden" name="handoff" value="11111111-2222-3333-4444-555555555555" data-partner="Soukbase" form="f"><script type="application/json" id="pf">${json}</script><a id="pt"`,
    );
  }
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    virtualConsole: new VirtualConsole().sendTo(console),
    pretendToBeVisual: true,
    url: 'https://apibase.pro/integrator/connect?from=soukbase',
    beforeParse(w: any) {
      w.fetch = async () => ({ ok: true, status: 200, json: async () => [] });
    },
  });
  const w = dom.window,
    d = w.document;
  const input = d.querySelector('[name=contact_email]') as HTMLInputElement;
  return {
    w,
    d,
    input,
    line: () => d.getElementById('ce-line') as HTMLElement | null,
    label: () => input.closest('label') as HTMLElement,
  };
}

describe('T-0867 contact email line on the connect page', () => {
  it('email_given: the input is hidden, one line shows the address, the value stays in the form', async () => {
    const p = await boot({ prefill: { contact_email: 'owner@shop.example' }, email_given: true });
    const line = p.line()!;
    expect(line).not.toBeNull();
    expect(line.className).toBe('hint');
    expect(line.hidden).toBe(false);
    expect(line.textContent).toBe(
      'Contact email: owner@shop.example (from Soukbase). Never shown to buyers. Change',
    );
    expect(p.label().hidden).toBe(true);
    expect(p.label().style.display).toBe('none');
    expect(p.d.getElementById('s1')!.textContent).not.toContain('does not pass your email');
    expect(new p.w.FormData(p.d.getElementById('f')).get('contact_email')).toBe(
      'owner@shop.example',
    );
  });

  it('Change shows the input again, focuses it and hides the line', async () => {
    const p = await boot({ prefill: { contact_email: 'owner@shop.example' }, email_given: true });
    (p.line()!.querySelector('button') as HTMLButtonElement).click();
    expect(p.line()!.hidden).toBe(true);
    expect(p.label().hidden).toBe(false);
    expect(p.label().style.display).toBe('');
    expect(p.d.activeElement).toBe(p.input);
    expect(p.input.value).toBe('owner@shop.example');
  });

  it('a validation error on contact_email reveals the input', async () => {
    const p = await boot({ prefill: { contact_email: 'owner@shop.example' }, email_given: true });
    p.input.value = 'broken';
    p.input.dispatchEvent(new p.w.FocusEvent('focusout', { bubbles: true }));
    expect(p.label().hidden).toBe(false);
    expect(p.line()!.hidden).toBe(true);
    expect(p.d.querySelector('[data-for=contact_email]')!.textContent).toBe(
      'Enter a valid email address.',
    );
  });

  it('the address is set as text, never as markup', async () => {
    const p = await boot({ prefill: { contact_email: 'a<b>@x.example' }, email_given: true });
    expect(p.line()!.querySelector('b')).toBeNull();
    expect(p.line()!.textContent).toContain('a<b>@x.example');
  });

  it('without email_given the page has the field, the T-0832 hint and no line', async () => {
    const p = await boot({ prefill: { name: 'Shop' }, email_note: true });
    expect(p.line()).toBeNull();
    expect(p.label().hidden).toBe(false);
    expect(p.d.getElementById('s1')!.textContent).toContain(
      'Soukbase does not pass your email. Type the address for messages from APIbase.',
    );
    const plain = await boot(null);
    expect(plain.line()).toBeNull();
    expect(plain.label().hidden).toBe(false);
  });
});
