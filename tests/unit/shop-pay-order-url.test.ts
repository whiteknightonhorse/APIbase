import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { payResponseBody, ORDER_NEXT } from '../../src/shop/order-payment.service';

jest.mock('../../src/config/index', () => ({
  config: { ENCRYPTION_KEY: 'k'.repeat(40), X402_NETWORK: 'base' },
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/pipeline/stages/escrow.stage', () => ({}));

const ID = '11111111-2222-3333-4444-555555555555';
const URL_ = `https://apibase.pro/api/v1/shop/orders/${ID}`;

describe('T-0769 pay reply order_url / next', () => {
  it('paid with fulfillment: order_url, no next', () => {
    const r = payResponseBody({ order_id: ID, state: 'FULFILLED', fulfillment: 'test ok' });
    expect(r.status).toBe(200);
    expect(r.body.order_url).toBe(URL_);
    expect(r.body.next).toBeUndefined();
  });

  it('paid without fulfillment: both, order_url ends with the order id', () => {
    const r = payResponseBody({ order_id: ID, state: 'PAID' });
    expect(r.body.order_url).toMatch(new RegExp(`/api/v1/shop/orders/${ID}$`));
    expect(r.body.next).toBe(ORDER_NEXT);
    expect(String(r.body.next)).toContain('until state is FULFILLED');
  });

  it('202 payment_pending: both', () => {
    const r = payResponseBody({ order_id: ID, state: 'PAYING' });
    expect(r.status).toBe(202);
    expect(r.body.order_url).toBe(URL_);
    expect(r.body.next).toBe(ORDER_NEXT);
  });

  it('replayed payment-identifier answer (no fulfillment): both', () => {
    const r = payResponseBody({ order_id: ID, state: 'PAID', tx_hash: '0xab', replayed: true });
    expect(r.body.replayed).toBe(true);
    expect(r.body.order_url).toBe(URL_);
    expect(r.body.next).toBe(ORDER_NEXT);
  });

  it('already_placed body carries order_url', async () => {
    const pay = await import('../../src/shop/pay.service');
    const op = await import('../../src/shop/order-payment.service');
    jest.spyOn(op, 'findPlacedOrder').mockResolvedValue({ order_id: ID, state: 'PAID' } as never);
    const r = await pay.payQuote(
      { db: {} } as never,
      {
        quote_id: ID,
        buyer: { identity: 'x' },
        requestId: 'r',
        host: 'h',
      } as never,
    );
    expect(r.body.status).toBe('already_placed');
    expect(r.body.order_url).toBe(URL_);
  });
});

describe('T-0769 buyers.md script fence', () => {
  it('equals scripts/shop/examples/buy-rest.ts', () => {
    const root = join(__dirname, '../..');
    const md = readFileSync(join(root, 'static/integrator/buyers.md'), 'utf8');
    const file = readFileSync(join(root, 'scripts/shop/examples/buy-rest.ts'), 'utf8');
    const m = md.match(/```ts\n([\s\S]*?)```/);
    expect(m?.[1]).toBe(file);
  });
});
