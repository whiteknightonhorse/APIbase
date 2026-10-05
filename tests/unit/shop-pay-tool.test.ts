/** T-INT-08 PB6 (transport half): shop.order.pay on /mcp reports a refusal as isError; MPP on /mcp is 400. */
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/config/index', () => ({ config: { ENCRYPTION_KEY: 'k'.repeat(40) } }));
jest.mock('../../src/services/redis.service', () => ({}));
jest.mock('../../src/services/moderation-ban.service', () => ({}));
const mockCfg = jest.fn();
jest.mock('../../src/config/mpp.config', () => ({ getMppConfig: () => mockCfg() }));
const mockPay = jest.fn();
jest.mock('../../src/shop/pay.service', () => ({ payQuote: (...a: unknown[]) => mockPay(...a) }));
jest.mock('../../src/shop/buyer', () => ({ resolveBuyer: async () => ({ identity: 'agent:t' }) }));

import type { Request } from 'express';
import { registerOrderTools } from '../../src/shop/tools/order.tools';
import { mppMiddleware } from '../../src/middleware/mpp.middleware';
import { AppError } from '../../src/types/errors';

function handler(paymentHeader: string | null) {
  const tools = new Map<string, (a: unknown) => Promise<any>>();
  const server = {
    registerTool: (name: string, _d: unknown, h: (a: unknown) => Promise<unknown>) =>
      tools.set(name, h as never),
  };
  registerOrderTools(
    server as never,
    'k',
    'rid',
    {} as never,
    {
      x402PaymentHeader: paymentHeader,
    } as never,
  );
  return tools.get('shop.order.pay')!;
}

describe('shop.order.pay tool', () => {
  beforeEach(() => mockPay.mockReset());

  it('a 402 refusal is an isError result carrying the challenge; the header is forwarded', async () => {
    const body = { accepts: [{ payTo: '0xP' }], pay: { mpp: { url: 'u' } } };
    mockPay.mockResolvedValue({ status: 402, body });
    const r = await handler('hdr')({ quote_id: 'q' });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content[0].text)).toEqual(body);
    expect(mockPay.mock.calls[0][1]).toMatchObject({ quote_id: 'q', x402PaymentHeader: 'hdr' });
  });

  it('a 202 is a normal result', async () => {
    mockPay.mockResolvedValue({ status: 202, body: { status: 'payment_pending', order_id: 'o' } });
    const r = await handler(null)({ quote_id: 'q' });
    expect(r.isError).toBeUndefined();
    expect(r.structuredContent).toEqual({ status: 'payment_pending', order_id: 'o' });
    expect(mockPay.mock.calls[0][1].x402PaymentHeader).toBeUndefined();
  });
});

describe('Authorization: Payment on /mcp', () => {
  it('is rejected with 400 (MPP only on the route that issued the challenge)', async () => {
    mockCfg.mockReturnValue({ enabled: true });
    const req = {
      headers: { authorization: 'Payment x' },
      originalUrl: '/mcp',
      method: 'POST',
      body: {},
      get: () => 'h',
      requestId: 'r',
    } as unknown as Request;
    const e = await new Promise<unknown>((res) => mppMiddleware(req, {} as never, res));
    expect(e).toBeInstanceOf(AppError);
    expect((e as AppError).httpStatus).toBe(400);
  });
});
