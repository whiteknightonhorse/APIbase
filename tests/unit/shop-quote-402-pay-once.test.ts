/**
 * T-0945: the 402 of a quote states the x402 terms once (accepts[]); `pay` keeps only the other
 * rails; PAYMENT-REQUIRED carries the x402 object only. No DB, no network: ESCROW and the quote
 * read are stubbed, the x402 SDK is real.
 */
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { decodePaymentRequiredHeader } from '@x402/core/http';
import { createOrderRouter } from '../../src/shop/routes/order.router';

jest.mock('../../src/config', () => ({ config: { ENCRYPTION_KEY: 'k'.repeat(40) } }));
jest.mock('../../src/shop/buyer', () => ({
  resolveBuyer: jest.fn(async () => ({ identity: 'ip:test' })),
}));
jest.mock('../../src/shop/quote-outcomes.service', () => ({
  recordPayOutcome: jest.fn(async () => undefined),
  clientFromUserAgent: jest.fn(),
  createQuoteRecorded: jest.fn(),
}));
jest.mock('../../src/shop/subscription.service', () => ({
  periodRefusal: jest.fn(async () => null),
  getSubscription: jest.fn(),
  cancelSubscription: jest.fn(),
}));
jest.mock('../../src/shop/pii/pii.service', () => ({
  checkPiiForPay: jest.fn(async () => null),
  storeEnvelopes: jest.fn(),
}));
jest.mock('../../src/shop/order-payment.service', () => ({
  findPlacedOrder: jest.fn(async () => null),
  orderUrl: jest.fn(),
  payResponseBody: jest.fn(),
  getOrderView: jest.fn(),
}));

const QID = '11111111-1111-4111-8111-111111111111';
const ACCEPT = {
  scheme: 'exact',
  network: 'eip155:8453',
  amount: '250000',
  asset: '0x833589fCd6eDb6E08f4c7C32D4f71b54bdA02913',
  payTo: '0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480',
  maxTimeoutSeconds: 120,
  extra: { name: 'USD Coin', version: '2', quote_id: QID },
};
const X402 = { payTo: ACCEPT.payTo, amount: ACCEPT.amount, network: 'base', asset: ACCEPT.asset };
const mockState = { pay: {} as Record<string, unknown> };

jest.mock('../../src/pipeline/stages/escrow.stage', () => ({
  escrowQuotePayment: jest.fn(async () => ({
    ok: false,
    error: {
      code: 402,
      error: 'payment_required',
      message: 'Payment required',
      extra: { binding: { kind: 'quote' } },
    },
  })),
  buildPaymentRequiredResponse: jest.fn(() => ({
    x402Version: 2,
    error: 'payment_required',
    resource: { url: 'https://apibase.pro/api/v1/shop/quotes/x/pay', description: 'quote' },
    accepts: [ACCEPT],
    extensions: { 'payment-identifier': { info: { required: false } } },
    price_usd: 0.25,
    min_balance_usd: 0.25,
    payment_address: ACCEPT.payTo,
    price_version: 1,
    resource_id: `quote:${QID}`,
    documentation_url: '/integrator/docs#orders',
  })),
}));
jest.mock('../../src/shop/quote.service', () => ({
  getQuote: jest.fn(async () => ({
    order_id: 'o1',
    pay_before: '2026-11-23T13:00:00.000Z',
    cancel_url: 'https://apibase.pro/api/v1/shop/orders/o1/cancel',
    pay: mockState.pay,
  })),
  cancelOrder: jest.fn(),
  merchantIdBySlug: jest.fn(),
}));

// The type resolver does not map the /client subpath (scripts/shop/examples uses it under tsx).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { x402Client } = require('@x402/core/client');

describe('T-0945 quote 402 states the x402 terms once', () => {
  let server: Server;
  let base: string;
  beforeEach(async () => {
    const deps = { db: { $queryRawUnsafe: jest.fn(async () => [{ state: 'QUOTED' }]) } };
    const app = express();
    app.use(express.json());
    app.use(createOrderRouter(deps as never));
    await new Promise<void>((r) => {
      server = app.listen(0, '127.0.0.1', () => r());
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(() => new Promise<void>((r) => server.close(() => r())));
  const probe = () =>
    fetch(`${base}/api/v1/shop/quotes/${QID}/pay`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
      body: '{}',
    });

  it('Base+Tempo quote: accepts[0] and pay.mpp.url, no pay.x402; flat fields stay', async () => {
    mockState.pay = {
      x402: X402,
      mpp: { url: `https://apibase.pro/api/v1/shop/quotes/${QID}/pay` },
    };
    const r = await probe();
    const body = await r.json();
    expect(r.status).toBe(402);
    expect(body.accepts[0].payTo).toBe(ACCEPT.payTo);
    expect(body.pay.mpp.url).toMatch(/\/pay$/);
    expect('x402' in body.pay).toBe(false);
    expect(body.pay_before).toBe('2026-11-23T13:00:00.000Z');
    expect(body.cancel_url).toContain('/cancel');
    expect(body.price_usd).toBe(0.25);
    expect(body.resource_id).toBe(`quote:${QID}`);
  });

  it('Base-only quote: no pay key at all', async () => {
    mockState.pay = { x402: X402 };
    const body = await (await probe()).json();
    expect('pay' in body).toBe(false);
    expect(body.accepts).toHaveLength(1);
  });

  it('PAYMENT-REQUIRED has exactly the five x402 keys and the same accepts; an x402 v2 client builds a payload from it', async () => {
    mockState.pay = { x402: X402, mpp: { url: 'https://apibase.pro/x/pay' } };
    const r = await probe();
    const body = await r.json();
    const header = r.headers.get('payment-required') as string;
    const decoded = decodePaymentRequiredHeader(header) as unknown as Record<string, unknown>;
    expect(Object.keys(decoded).sort()).toEqual(
      ['accepts', 'error', 'extensions', 'resource', 'x402Version'].sort(),
    );
    expect(decoded.accepts).toEqual(body.accepts);
    const client = x402Client.fromConfig({
      schemes: [
        {
          network: 'eip155:8453',
          client: {
            scheme: 'exact',
            createPaymentPayload: async (v: number) => ({ x402Version: v, payload: { sig: '0x' } }),
          },
        },
      ],
      spendControls: false,
    });
    const payload = await client.createPaymentPayload(decoded as never);
    expect(payload.accepted.payTo).toBe(ACCEPT.payTo);
  });
});
