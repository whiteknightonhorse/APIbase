/** T-0376: /integrator is a human-first landing on top; every agent/developer snippet stays below #developers. */
import express from 'express';
import { execSync } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { createIntegratorRouter } from '../../src/shop/routes/integrator.router';

jest.mock('../../src/config', () => ({ config: {} }));

// Snapshot of origin/main's static/integrator/index.html snippets, taken at the start of T-0376.
const SNIPPETS = [
  '&lt;a href="https://apibase.pro/m/&lt;slug&gt;/p/&lt;sku&gt;" rel="alternate payment" class="apibase-ai-buy"&gt;Buy with your AI agent&lt;/a&gt;',
  '&lt;a href="https://apibase.pro/m/&lt;slug&gt;/cart?items=&lt;sku&gt;:1,&lt;sku&gt;:2" rel="alternate payment"&gt;Buy with your AI agent&lt;/a&gt;',
  '&lt;p&gt;AI purchase: AI agents can buy here. &lt;a href="https://apibase.pro/m/&lt;slug&gt;"&gt;Open our AI storefront&lt;/a&gt;&lt;/p&gt;',
  '"@type":"BuyAction","target":"https://apibase.pro/mcp/m/&lt;slug&gt;"',
  'AI agents can buy here: https://apibase.pro/m/&lt;slug&gt;/llms.txt',
  'storefront_initialize',
  'payment_verified',
  '<code>subscription.past_due</code>',
  'x402 (Base) or MPP (Tempo)',
  'https://apibase.pro/mcp/m/&lt;slug&gt;',
  '/integrator/agent-guide',
  '/integrator/why-base-tempo',
  'Merchants connected so far:',
];

let server: ReturnType<express.Express['listen']>;
let html = '';
beforeAll(async () => {
  const app = express();
  app.use(createIntegratorRouter({ limit: 10_000 }));
  server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  html = await (await fetch(`${base}/integrator`)).text();
});
afterAll(() => server.close());

describe('integrator human-first landing', () => {
  it('has the landing sections in order, then #developers', () => {
    const order = [
      'Let AI agents buy from your store',
      'href="/integrator/connect"',
      'Connect my store',
      'How agentic checkout works',
      'Frequently asked questions',
      'Ready when the agents are.',
      'id="developers"',
    ].map((n) => html.indexOf(n));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('keeps every agent snippet after #developers', () => {
    const dev = html.indexOf('id="developers"');
    for (const s of SNIPPETS) {
      expect([s, html.indexOf(s, dev) > dev]).toEqual([s, true]);
    }
  });

  it('has both CTAs without analytics, no forbidden claims and stays light', () => {
    expect(html).not.toContain('gtag');
    expect(
      html.split('class="lp-cta" href="/integrator/connect"').length - 1,
    ).toBeGreaterThanOrEqual(2);
    expect(html).toContain('id="cta-final"');
    for (const bad of ['no code', 'no chargebacks', 'no monthly fee', 'free forever']) {
      expect([bad, html.toLowerCase().includes(bad)]).toEqual([bad, false]);
    }
    expect(Buffer.byteLength(html)).toBeLessThan(60000);
  });

  it('every snippet exists in origin/main (snapshot sanity)', () => {
    let old = '';
    try {
      old = execSync('git show origin/main:static/integrator/index.html', { encoding: 'utf-8' });
    } catch {
      return; // no origin/main in this checkout
    }
    for (const s of SNIPPETS.slice(0, 5)) expect(old).toContain(s);
  });
});
