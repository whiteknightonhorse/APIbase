import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..', 'static', '.well-known');
const x402 = JSON.parse(readFileSync(join(root, 'x402-payment.json'), 'utf8'));
const openapi = JSON.parse(readFileSync(join(root, 'openapi.json'), 'utf8'));

describe('x402-payment.json probe endpoint (T-0668)', () => {
  it('probe.url is a concrete tool call URL without template braces', () => {
    expect(x402.probe.url).toMatch(/^https:\/\/apibase\.pro\/api\/v1\/tools\/[^/{}]+\/call$/);
  });

  it('probe tool exists in the generated openapi catalog', () => {
    const path = new URL(x402.probe.url).pathname;
    expect(openapi.paths[path]).toBeDefined();
    expect(openapi.paths[path].post.operationId).toBeTruthy();
  });

  it('probe expects an unpaid 402 on Base', () => {
    expect(x402.probe.method).toBe('POST');
    expect(x402.probe.expect.status).toBe(402);
    expect(x402.probe.expect.x402Version).toBe(2);
    expect(x402.probe.expect.network).toBe('eip155:8453');
  });

  it('payTo and network are unchanged', () => {
    expect(x402.payTo).toBe('0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480');
    expect(x402.network).toBe('eip155:8453');
    expect(x402.payment_endpoint).toBe('https://apibase.pro/api/v1/tools/{toolId}/call');
  });
});
