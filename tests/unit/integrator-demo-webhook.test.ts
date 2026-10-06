/** T-INT-52 WS1-WS3: the demo webhook sink logs one line per event and keeps no state. */
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createIntegratorRouter } from '../../src/shop/routes/integrator.router';

jest.mock('../../src/config', () => ({ config: {} }));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
import { logger } from '../../src/config/logger';

let server: ReturnType<express.Express['listen']>;
let url: string;
beforeAll(() => {
  const app = express();
  app.use(createIntegratorRouter());
  server = app.listen(0);
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/integrator/demo-webhook`;
});
afterAll(() => server.close());
beforeEach(() => jest.clearAllMocks());

describe('demo webhook sink', () => {
  it('WS1: event header -> 200 {"ok":true} and one info log line', async () => {
    const body = '{"order_id":"o1"}';
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-APIbase-Event': 'order.paid',
        'X-APIbase-Delivery-Id': 'd-1',
        'X-APIbase-Signature': 't=1,v1=abc',
      },
      body,
    });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect((logger.info as jest.Mock).mock.calls[0][0]).toEqual({
      delivery_id: 'd-1',
      event: 'order.paid',
      signature: 't=1,v1=abc',
      body,
    });
  });

  it('WS2: 16 KB + 1 -> 413', async () => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'X-APIbase-Event': 'order.paid' },
      body: 'x'.repeat(16 * 1024 + 1),
    });
    expect(r.status).toBe(413);
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('WS3: no event header -> 204 and no log line', async () => {
    const r = await fetch(url, { method: 'POST', body: '{}' });
    expect(r.status).toBe(204);
    expect(logger.info).not.toHaveBeenCalled();
  });
});
