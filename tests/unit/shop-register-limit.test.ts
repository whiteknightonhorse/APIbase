/** T-SHOP-C: registration limit counts created merchants only; Retry-After on shop 429s. */
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { QuoteError } from '../../src/shop/quote.errors';

jest.mock('../../src/config', () => ({ config: { ENCRYPTION_KEY: 'k'.repeat(40) } }));
jest.mock('../../src/shop/buyer', () => ({
  resolveBuyer: jest.fn(async () => ({ identity: 'ip:test' })),
}));

const mockRegister = jest.fn();
jest.mock('../../src/shop/merchant-lifecycle.service', () => ({
  ...jest.requireActual('../../src/shop/merchant-lifecycle.service'),
  registerWithDocs: (...a: unknown[]) => mockRegister(...a),
}));
const mockCreateQuote = jest.fn();
jest.mock('../../src/shop/quote.service', () => ({
  ...jest.requireActual('../../src/shop/quote.service'),
  createQuote: (...a: unknown[]) => mockCreateQuote(...a),
  merchantIdBySlug: jest.fn(async () => 'm1'),
}));

import { createMerchantRouter } from '../../src/shop/routes/merchant.router';
import { createOrderRouter } from '../../src/shop/routes/order.router';
import { registerMerchant } from '../../src/shop/merchant.service';
import { getShopEnv } from '../../src/config/env';

const REG = '/api/v1/shop/merchants';
const valid = { message: 'm', signature: 's', slug: 'shop-one' };

async function serve(router: express.Router) {
  const app = express();
  app.use(express.json());
  app.use(router);
  let server!: Server;
  await new Promise<void>((r) => {
    server = app.listen(0, '127.0.0.1', () => r());
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { server, base };
}
const post = (base: string, path: string, body: unknown) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('registration route limit', () => {
  let server: Server;
  const prev = process.env.INTEGRATOR_REGISTER_PER_HOUR;
  afterEach(async () => {
    if (prev === undefined) delete process.env.INTEGRATOR_REGISTER_PER_HOUR;
    else process.env.INTEGRATOR_REGISTER_PER_HOUR = prev;
    await new Promise<void>((r) => server.close(() => r()));
    mockRegister.mockReset();
  });
  const start = async () => {
    const s = await serve(createMerchantRouter({} as never));
    server = s.server;
    return s.base;
  };

  it('five 401 attempts do not burn slots: the next valid registration is 201', async () => {
    mockRegister.mockResolvedValue({ merchant_id: 'x', status: 'pending' });
    const base = await start();
    for (let i = 0; i < 5; i++) expect((await post(base, REG, {})).status).toBe(401);
    expect((await post(base, REG, valid)).status).toBe(201);
  });

  it('five 201s then a sixth valid one is 429 with Retry-After and body.retry_after', async () => {
    mockRegister.mockResolvedValue({ merchant_id: 'x', status: 'pending' });
    const base = await start();
    for (let i = 0; i < 5; i++) expect((await post(base, REG, valid)).status).toBe(201);
    const r = await post(base, REG, valid);
    expect(r.status).toBe(429);
    const body = await r.json();
    expect(body.error).toBe('rate_limited');
    expect(body.retry_after).toBeGreaterThan(0);
    expect(Number(r.headers.get('retry-after'))).toBe(Math.ceil(body.retry_after));
  });

  it('INTEGRATOR_REGISTER_PER_HOUR=50 raises the limit', async () => {
    process.env.INTEGRATOR_REGISTER_PER_HOUR = '50';
    expect(getShopEnv().INTEGRATOR_REGISTER_PER_HOUR).toBe(50);
    mockRegister.mockResolvedValue({ merchant_id: 'x', status: 'pending' });
    const base = await start();
    for (let i = 0; i < 6; i++) expect((await post(base, REG, valid)).status).toBe(201);
  });

  it('env value is a positive integer, max 1000, else default 5', () => {
    for (const v of ['0', '-3', '1001', 'abc', '2.5', '']) {
      expect(getShopEnv({ INTEGRATOR_REGISTER_PER_HOUR: v }).INTEGRATOR_REGISTER_PER_HOUR).toBe(5);
    }
    expect(getShopEnv({}).INTEGRATOR_REGISTER_PER_HOUR).toBe(5);
  });
});

describe('service IP counter', () => {
  const db = { $executeRawUnsafe: async () => 0, $queryRawUnsafe: async () => [] };
  const fakeRedis = (get: (k: string) => string | null, counters = new Map<string, number>()) => ({
    set: async () => 'OK',
    getdel: async () => null,
    get: async (k: string) => get(k),
    incr: async (k: string) => {
      counters.set(k, (counters.get(k) ?? 0) + 1);
      return counters.get(k)!;
    },
    expire: async () => 1,
  });

  it('a refused attempt does not increment the Redis counter', async () => {
    const counters = new Map<string, number>();
    const redis = fakeRedis(() => null, counters);
    for (let i = 0; i < 7; i++) {
      await expect(
        registerMerchant(
          { wallet: '0x' + 'a'.repeat(40), signed: { message: 'x', signature: '0x00' } } as never,
          { db: db as never, redis: redis as never, ip: '203.0.113.9' },
        ),
      ).rejects.not.toMatchObject({ error_code: 'rate_limited' });
    }
    expect(counters.size).toBe(0);
  });

  it('pre-check refuses once the counter has reached the limit', async () => {
    const redis = fakeRedis(() => '5');
    await expect(
      registerMerchant({ wallet: '0x' + 'a'.repeat(40), signed: {} } as never, {
        db: db as never,
        redis: redis as never,
        ip: '203.0.113.9',
      }),
    ).rejects.toMatchObject({ error_code: 'rate_limited', retry_after: 3600 });
  });
});

describe('Retry-After on service 429s (order router send helper)', () => {
  let server: Server;
  afterEach(() => new Promise<void>((r) => server.close(() => r())));

  it.each(['test_sku_daily_cap', 'rate_limited'])('%s 429 carries Retry-After', async (code) => {
    mockCreateQuote.mockRejectedValue(
      new QuoteError(429, code, 'limit', 'retry_after_delay', { retry_after: 120.2 }),
    );
    const s = await serve(createOrderRouter({} as never));
    server = s.server;
    const r = await post(s.base, '/api/v1/shop/quotes', { merchant: 'm', items: [] });
    expect(r.status).toBe(429);
    expect(r.headers.get('retry-after')).toBe('121');
    expect((await r.json()).retry_after).toBe(120.2);
  });
});
