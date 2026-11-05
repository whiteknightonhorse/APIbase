/** T-0713: shop.order.paid carries payer_address, network and livemode (x402 on Base, MPP on Tempo). */
jest.mock('../../src/config', () => ({
  config: { X402_NETWORK: 'base', MPP_TESTNET: 'false', ENCRYPTION_KEY: 'k' },
}));
jest.mock('../../src/shop/order-state', () => ({ transition: async () => undefined }));
jest.mock('../../src/shop/subscription-core', () => ({
  applySubscriptionPayment: async () => null,
}));
jest.mock('../../src/shop/repository', () => ({ convertReservation: async () => undefined }));
import { confirmPayment, paidNetwork } from '../../src/shop/order-payment.service';
import type { ShopDeps } from '../../src/shop/merchant-lifecycle.service';

const PAYER = '0x1111111111111111111111111111111111111111';

function fakeDeps(outbox: unknown[]): ShopDeps {
  const tx = {
    $queryRawUnsafe: async (sql: string) => {
      if (sql.includes('FROM shop_orders WHERE order_id')) {
        return [{ state: 'PAYING', quote_id: 'q1', merchant_id: 'm1', total_usd: '1.00' }];
      }
      if (sql.includes('SELECT items FROM shop_quotes')) return [{ items: [{ sku: 'a', qty: 2 }] }];
      return [];
    },
    $executeRawUnsafe: async (sql: string, ...v: unknown[]) => {
      if (sql.includes('INSERT INTO outbox')) outbox.push(JSON.parse(String(v[0])));
      return 1;
    },
  };
  return { transaction: async (fn: (t: unknown) => unknown) => fn(tx) } as unknown as ShopDeps;
}

describe('T-0713 order.paid payer_address / network / livemode', () => {
  it('x402 on Base: payer_address, network base, livemode true', async () => {
    const out: Array<Record<string, unknown>> = [];
    await confirmPayment(fakeDeps(out), {
      order_id: 'o1',
      payment_id: 'p1',
      tx_hash: '0xt',
      payer: PAYER,
      rail: 'base',
    });
    const ev = out.find((e) => e.order_id === 'o1');
    expect(ev).toMatchObject({
      tx_hash: '0xt',
      payer_address: PAYER,
      network: 'base',
      livemode: true,
    });
  });

  it('MPP on Tempo: payer_address, network tempo', async () => {
    const out: Array<Record<string, unknown>> = [];
    await confirmPayment(fakeDeps(out), {
      order_id: 'o2',
      payment_id: 'p2',
      tx_hash: '0xu',
      payer: PAYER,
      rail: 'tempo',
    });
    const ev = out.find((e) => e.order_id === 'o2');
    expect(ev).toMatchObject({ payer_address: PAYER, network: expect.stringMatching(/^tempo/) });
    expect(typeof ev?.livemode).toBe('boolean');
  });

  it('paidNetwork maps rails', () => {
    expect(paidNetwork('base').network).toBeTruthy();
    expect(paidNetwork('tempo').network).toMatch(/^tempo/);
  });
});

describe('T-0713 agent guide documents order.paid once', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const guide: string = require('node:fs').readFileSync('static/integrator/agent-guide.md', 'utf8');
  it('lists the new fields and shows the url reply body exactly once', () => {
    for (const f of ['payer_address', 'network', 'livemode'])
      expect(guide).toContain('`' + f + '`');
    expect(guide.split('{"fulfillment": {"type": "url"').length - 1).toBe(1);
    expect(guide.split('### The `order.paid` delivery').length - 1).toBe(1);
  });
});
