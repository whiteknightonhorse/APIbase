/** T-INT-51 D-1: an anonymous MCP session is its own buyer identity (session:<sid>), never a shared ip:unknown. */
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/config/index', () => ({ config: { ENCRYPTION_KEY: 'k'.repeat(40) } }));
jest.mock('../../src/services/redis.service', () => ({}));
jest.mock('../../src/services/moderation-ban.service', () => ({}));
const mockPay = jest.fn();
jest.mock('../../src/shop/pay.service', () => ({ payQuote: (...a: unknown[]) => mockPay(...a) }));
const mockGetOrder = jest.fn();
jest.mock('../../src/shop/order-payment.service', () => ({
  getOrderView: (...a: unknown[]) => mockGetOrder(...a),
}));

import { resolveBuyer } from '../../src/shop/buyer';
import { registerOrderTools } from '../../src/shop/tools/order.tools';

function tools(sessionId?: string) {
  const m = new Map<string, (a: unknown) => Promise<any>>();
  const server = {
    registerTool: (name: string, _d: unknown, h: (a: unknown) => Promise<unknown>) =>
      m.set(name, h as never),
  };
  registerOrderTools(server as never, '', 'rid', {} as never, undefined, sessionId);
  return m;
}

describe('resolveBuyer session identity', () => {
  it('two anonymous sessions are different buyers', async () => {
    const a = await resolveBuyer({ session: 's1' });
    const b = await resolveBuyer({ session: 's2' });
    expect(a.identity).toBe('session:s1');
    expect(b.identity).toBe('session:s2');
    expect(a.identity).not.toBe(b.identity);
  });

  it('the same session is the same buyer; REST (ip, no session) is unchanged', async () => {
    expect((await resolveBuyer({ session: 's1' })).identity).toBe('session:s1');
    expect((await resolveBuyer({ ip: '1.2.3.4' })).identity).toBe('ip:1.2.3.4');
    expect((await resolveBuyer({})).identity).toBe('ip:unknown');
  });
});

describe('order tools bind the buyer to the MCP session', () => {
  beforeEach(() => {
    mockPay.mockReset().mockResolvedValue({ status: 202, body: { status: 'payment_pending' } });
    mockGetOrder.mockReset().mockResolvedValue({ order_id: 'o' });
  });

  it('pay and get run as session:<sid>, distinct per session', async () => {
    const t1 = tools('s1');
    const t2 = tools('s2');
    await t1.get('shop.order.pay')!({ quote_id: 'q' });
    await t2.get('shop.order.pay')!({ quote_id: 'q' });
    expect(mockPay.mock.calls[0][1].buyer.identity).toBe('session:s1');
    expect(mockPay.mock.calls[1][1].buyer.identity).toBe('session:s2');
    await t1.get('shop.order.get')!({ order_id: 'o' });
    await t2.get('shop.order.get')!({ order_id: 'o' });
    expect(mockGetOrder.mock.calls[0][2]).toBe('session:s1');
    expect(mockGetOrder.mock.calls[1][2]).toBe('session:s2');
  });
});
