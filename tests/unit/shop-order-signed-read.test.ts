/** T-0770: the paying wallet reads its order with a signed GET (read-only, no token). */
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

jest.mock('../../src/config', () => ({ config: { ENCRYPTION_KEY: 'k'.repeat(40) } }));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../src/shop/buyer', () => ({
  resolveBuyer: jest.fn(async (p: { apiKey?: string }) => ({
    identity: p.apiKey === 'bt_good' ? 'token:good' : 'ip:test',
  })),
}));

import { encryptSecret } from '../../src/services/secret-crypto.service';
import { createOrderRouter, orderMessage } from '../../src/shop/routes/order.router';
import { retrieveMessage } from '../../src/routes/x402.router';

const NOW = new Date('2026-11-11T12:00:30.000Z').getTime();
const MIN = Math.floor(NOW / 60_000);
const A = '11111111-2222-3333-4444-555555555555';
const B = '66666666-7777-8888-9999-000000000000';
const C = '99999999-8888-7777-6666-555555555555'; // payer_wallet NULL
const payer = privateKeyToAccount(generatePrivateKey());
const stranger = privateKeyToAccount(generatePrivateKey());

function row(order_id: string, wallet: string | null) {
  return {
    order_id,
    state: 'FULFILLED',
    tx_hash: '0xab',
    fulfillment_payload_enc: encryptSecret('the-delivery', 'k'.repeat(40)),
    buyer_identity: 'token:good',
    payer_wallet: wallet,
    merchant_id: 'm',
    delivery_eta: null,
  };
}

const db = {
  $queryRawUnsafe: jest.fn(async (sql: string, id: string) => {
    if (sql.includes('q.buyer_identity')) {
      if (id === A) return [row(A, payer.address)];
      if (id === B) return [row(B, payer.address)];
      if (id === C) return [row(C, null)];
      return [];
    }
    return [];
  }),
};

describe('T-0770 GET /api/v1/shop/orders/:id signed by the paying wallet', () => {
  let server: Server;
  let base: string;
  beforeAll(async () => {
    const app = express();
    app.use(createOrderRouter({ db } as never, { now: () => NOW }));
    await new Promise<void>((r) => {
      server = app.listen(0, '127.0.0.1', () => r());
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const get = (id: string, headers: Record<string, string> = {}) =>
    fetch(`${base}/api/v1/shop/orders/${id}`, { headers });
  const signed = async (
    id: string,
    who = payer,
    message = orderMessage(id, MIN),
    extra: Record<string, string> = {},
  ) =>
    get(id, {
      'X-Payer-Address': who.address,
      'X-Payer-Signature': await who.signMessage({ message }),
      ...extra,
    });

  it('payer wallet signature -> viewer payer with fulfillment, no-store', async () => {
    const r = await signed(A);
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    const b = await r.json();
    expect(b.viewer).toBe('payer');
    expect(b.fulfillment).toBe('the-delivery');
    expect(b.buyer_token).toBeUndefined();
  });

  it('previous minute is accepted; lowercase address is accepted', async () => {
    const r = await get(A, {
      'X-Payer-Address': payer.address.toLowerCase(),
      'X-Payer-Signature': await payer.signMessage({ message: orderMessage(A, MIN - 1) }),
    });
    expect((await r.json()).viewer).toBe('payer');
  });

  it("another wallet's valid signature -> viewer public, no fulfillment", async () => {
    const r = await signed(A, stranger);
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.viewer).toBe('public');
    expect(b.fulfillment).toBeUndefined();
    expect(b.hint).toContain('apibase-order:<order_id>:<unix minute>');
  });

  it('a signature for order B on order A -> 401', async () => {
    const r = await signed(A, payer, orderMessage(B, MIN));
    expect(r.status).toBe(401);
    expect((await r.json()).error).toBe('order_signature_invalid');
  });

  it('a retrieve-format message -> 401', async () => {
    const r = await signed(A, payer, retrieveMessage(A, MIN));
    expect(r.status).toBe(401);
    expect((await r.json()).error).toBe('order_signature_invalid');
  });

  it('minute outside the window -> 401 (both stale and future)', async () => {
    expect((await signed(A, payer, orderMessage(A, MIN - 2))).status).toBe(401);
    expect((await signed(A, payer, orderMessage(A, MIN + 1))).status).toBe(401);
  });

  it('one header only -> 401', async () => {
    expect((await get(A, { 'X-Payer-Address': payer.address })).status).toBe(401);
    const sig = await payer.signMessage({ message: orderMessage(A, MIN) });
    expect((await get(A, { 'X-Payer-Signature': sig })).status).toBe(401);
  });

  it('malformed signature -> 401, not the public view', async () => {
    const r = await get(A, { 'X-Payer-Address': payer.address, 'X-Payer-Signature': '0xdead' });
    expect(r.status).toBe(401);
    expect((await r.json()).viewer).toBeUndefined();
  });

  it('array-valued header -> 401', async () => {
    const sig = await payer.signMessage({ message: orderMessage(A, MIN) });
    const h = new Headers();
    h.append('X-Payer-Address', payer.address);
    h.append('X-Payer-Signature', sig);
    h.append('X-Payer-Signature', sig);
    // Node joins a repeated custom header with ', ' -> not a valid signature string.
    expect((await fetch(`${base}/api/v1/shop/orders/${A}`, { headers: h })).status).toBe(401);
    const { signedOrderIdentity } = await import('../../src/shop/routes/order.router');
    const verify = jest.fn(async () => true);
    expect(await signedOrderIdentity([payer.address], sig, A, verify, NOW)).toBe('invalid');
    expect(await signedOrderIdentity(payer.address, [sig], A, verify, NOW)).toBe('invalid');
    expect(verify).not.toHaveBeenCalled();
  });

  it('a valid signature ignores the Bearer (no escalation, no mixing)', async () => {
    const r = await signed(A, stranger, orderMessage(A, MIN), { authorization: 'Bearer bt_good' });
    expect((await r.json()).viewer).toBe('public');
  });

  it('no signature headers + Bearer -> unchanged behaviour', async () => {
    const r = await get(A, { authorization: 'Bearer bt_good' });
    const b = await r.json();
    expect(b.viewer).toBe('payer');
    expect(b.fulfillment).toBe('the-delivery');
    expect((await (await get(A)).json()).viewer).toBe('public');
  });

  it('an order with payer_wallet NULL -> public even for a valid signature', async () => {
    const r = await signed(C);
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.viewer).toBe('public');
    expect(b.fulfillment).toBeUndefined();
  });
});
