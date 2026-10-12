/** T-0324 OL1-OL3: per-address probe limiter on every order.router.ts route (CodeQL #59). */
import express from 'express';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ShopAuthError } from '../../src/shop/auth/errors';
import { createOrderRouter } from '../../src/shop/routes/order.router';
import { PROBE_LIMIT_PER_MIN } from '../../src/shop/routes/address-limiter';

jest.mock('../../src/config', () => ({ config: { ENCRYPTION_KEY: 'k'.repeat(40) } }));
jest.mock('../../src/shop/buyer', () => ({
  resolveBuyer: jest.fn(async () => ({ identity: 'ip:test' })),
}));
jest.mock('../../src/shop/subscription-preauth.service', () => ({
  preauthorizeSubscription: jest.fn(async () => {
    throw new ShopAuthError(401, 'invalid credentials');
  }),
}));
jest.mock('../../src/shop/subscription.service', () => ({
  getSubscription: jest.fn(async () => ({ id: 'x', status: 'active' })),
  cancelSubscription: jest.fn(),
}));

describe('shop order router probe limiter', () => {
  let server: Server;
  let base: string;

  beforeEach(async () => {
    const app = express();
    app.use(express.json());
    app.use(createOrderRouter({} as never));
    await new Promise<void>((r) => {
      server = app.listen(0, '127.0.0.1', () => r());
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(() => new Promise<void>((r) => server.close(() => r())));

  const preauth = () =>
    fetch(`${base}/api/v1/shop/subscriptions/x/preauthorize`, {
      method: 'POST',
      headers: { authorization: 'Bearer bad', 'content-type': 'application/json' },
      body: '{}',
    });

  it('OL1: failed probes are capped per address, then 429 rate_limited', async () => {
    for (let i = 0; i < PROBE_LIMIT_PER_MIN; i++) {
      const r = await preauth();
      expect([401, 404]).toContain(r.status);
    }
    const blocked = await preauth();
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error).toBe('rate_limited');
    expect(blocked.headers.get('ratelimit-limit') ?? blocked.headers.get('ratelimit')).toBeTruthy();
  });

  it('OL2: successful responses are not counted', async () => {
    for (let i = 0; i < 150; i++) {
      const r = await fetch(`${base}/api/v1/shop/subscriptions/x`);
      expect(r.status).not.toBe(429);
    }
  });

  it('OL3: every route in order.router.ts carries probeLimiter', () => {
    const src = readFileSync(join(__dirname, '../../src/shop/routes/order.router.ts'), 'utf8');
    const routes = (src.match(/router\.(get|post)\(/g) ?? []).length;
    const limited = (src.match(/probeLimiter,/g) ?? []).length;
    expect(routes).toBeGreaterThan(0);
    expect(limited).toBe(routes);
  });
});
