/** T-0428: a pending shop payment carrying tx_hash is finalized by its receipt first. */
const mockFinalize = jest.fn(async () => ({}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/config/x402.config', () => ({
  getX402Config: () => ({}),
  toMicroUsdc: (n: number) => String(Math.round(n * 1_000_000)),
}));
jest.mock('../../src/pipeline/stages/shop-settle', () => ({
  finalizeConfirmed: (...a: unknown[]) => (mockFinalize as (...x: unknown[]) => unknown)(...a),
}));
jest.mock('../../src/shop/merchant-lifecycle.service', () => ({ defaultShopDeps: jest.fn() }));
jest.mock('../../src/shop/repository', () => ({ releaseReservation: jest.fn() }));
jest.mock('../../src/shop/order-state', () => ({ transition: jest.fn() }));

import { run, type ChainReader } from '../../src/jobs/shop-payment-reconcile.job';

const pending = (tx_hash: string | null) => ({
  payment_id: 'p1',
  order_id: 'o1',
  quote_id: 'q1',
  merchant_id: 'm1',
  payer: '0xpayer',
  eip3009_nonce: '0xn',
  pay_to: '0xseller',
  amount_usd: '1',
  splits: null,
  tx_hash,
  created_at: new Date(),
  expired: false,
});
const deps = (row: unknown) => ({ db: { $queryRawUnsafe: jest.fn(async () => [row]) } }) as never;

describe('shop-payment-reconcile tx_hash path (T-0428)', () => {
  beforeEach(() => mockFinalize.mockClear());

  it('receipt ok on the stored hash -> finalized without the authorization lookup', async () => {
    const chain: ChainReader = {
      receiptOk: jest.fn(async () => true),
      authorizationUsed: jest.fn(async () => false),
      findTransfer: jest.fn(),
    };
    await run({ deps: deps(pending('0xtx')), chain });
    expect(mockFinalize).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tx_hash: '0xtx', order_id: 'o1' }),
    );
    expect(chain.authorizationUsed).not.toHaveBeenCalled();
  });

  it('receipt missing -> falls through to authorizationState/transfer', async () => {
    const chain: ChainReader = {
      receiptOk: jest.fn(async () => false),
      authorizationUsed: jest.fn(async () => true),
      findTransfer: jest.fn(async () => '0xfound'),
    };
    await run({ deps: deps(pending('0xtx')), chain });
    expect(mockFinalize).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tx_hash: '0xfound' }),
    );
  });

  it('no stored hash -> receiptOk is not called', async () => {
    const chain: ChainReader = {
      receiptOk: jest.fn(),
      authorizationUsed: jest.fn(async () => false),
      findTransfer: jest.fn(),
    };
    await run({ deps: deps(pending(null)), chain });
    expect(chain.receiptOk).not.toHaveBeenCalled();
  });
});
