/** T-0428: shop settle — settlement_pending / facilitator timeout are `pending`, other throws fail. */
const mockSettle = jest.fn();
const mockFail = jest.fn(async () => undefined);
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/config/x402.config', () => ({
  buildServerX402Requirements: () => ({}),
}));
jest.mock('@x402/core/http', () => ({ decodePaymentSignatureHeader: () => ({}) }));
jest.mock('@x402/core/schemas', () => ({
  parsePaymentPayload: (d: unknown) => ({ success: true, data: d }),
}));
jest.mock('../../src/services/x402-server.service', () => ({
  getSharedResourceServer: () => ({ settlePayment: mockSettle }),
}));
jest.mock('../../src/shop/adapters/shop-order.adapter', () => ({ fulfillPaidOrder: jest.fn() }));
jest.mock('../../src/shop/order-payment.service', () => ({
  confirmPayment: jest.fn(async () => true),
  failPayment: (...a: unknown[]) => (mockFail as (...x: unknown[]) => unknown)(...a),
}));

import { settleAndFinalize } from '../../src/pipeline/stages/shop-settle';

const exec = jest.fn(async () => 1);
const deps = { db: { $executeRawUnsafe: exec } } as never;
const order = {
  order_id: 'o1',
  payment_id: 'p1',
  payer: '0xpayer',
  amount_usd: 1,
  pay_to: '0xseller',
  header: '{}',
};

describe('shop settleAndFinalize unknown outcomes (T-0428)', () => {
  beforeEach(() => {
    mockSettle.mockReset();
    mockFail.mockClear();
    exec.mockClear();
  });

  it('settlement_pending with a hash -> pending, tx_hash stored on the payment row, not failed', async () => {
    mockSettle.mockResolvedValue({
      success: false,
      errorReason: 'settlement_pending',
      transaction: '0xtx',
    });
    const out = await settleAndFinalize(deps, order);
    expect(out).toEqual({ kind: 'pending', order_id: 'o1' });
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('SET tx_hash'), 'p1', '0xtx');
    expect(mockFail).not.toHaveBeenCalled();
    expect(mockSettle).toHaveBeenCalledTimes(1);
  });

  it('FacilitatorTimeoutError -> pending, not PAYMENT_FAILED', async () => {
    const e = new Error('timeout');
    e.name = 'FacilitatorTimeoutError';
    mockSettle.mockRejectedValue(e);
    const out = await settleAndFinalize(deps, order);
    expect(out).toEqual({ kind: 'pending', order_id: 'o1' });
    expect(mockFail).not.toHaveBeenCalled();
  });

  it('any other throw -> failed settle_threw', async () => {
    mockSettle.mockRejectedValue(new Error('boom'));
    const out = await settleAndFinalize(deps, order);
    expect(out).toEqual({ kind: 'failed', order_id: 'o1', reason: 'settle_threw' });
    expect(mockFail).toHaveBeenCalledTimes(1);
  });

  it('other success:false reasons stay failed', async () => {
    mockSettle.mockResolvedValue({ success: false, errorReason: 'insufficient_funds' });
    const out = await settleAndFinalize(deps, order);
    expect(out.kind).toBe('failed');
  });
});
