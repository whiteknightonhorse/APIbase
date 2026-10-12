/**
 * T-0318 F1-F2: fee invoices are a Base receivable; they point at and are verified against
 * INTEGRATOR_FEE_WALLET_BASE, never the Tempo fee address. No database, no chain.
 */
import { markFeeInvoicePaid, type FeeInvoiceDeps } from '../../src/shop/fee-invoice.service';

jest.mock('../../src/config/index', () => ({
  config: {
    X402_NETWORK: 'base',
    X402_PAYMENT_ADDRESS: '0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480',
    X402_BASE_RPC_URL: 'https://base.example',
    X402_BASE_SEPOLIA_RPC_URL: 'https://sepolia.example',
  },
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const E = process['env'];
const TEMPO_FEE = '0x00000000000000000000000000000000000fee01';
const BASE_FEE = '0x00000000000000000000000000000000000fee02';
const INVOICE = '44444444-4444-4444-8444-444444444444';
const MERCHANT = '55555555-5555-4555-8555-555555555555';
const TX = `0x${'ab'.repeat(32)}`;

const invoiceRow = {
  invoice_id: INVOICE,
  period: '2026-09',
  amount_usd: '0.05',
  due_at: new Date('2026-10-15T00:00:00Z'),
  status: 'open',
  paid_tx_hash: null,
};

const mkDeps = (to: string): FeeInvoiceDeps => {
  const usdc = jest.requireActual('../../src/config/x402.config').getX402Config().usdcAddress;
  const q = jest.fn(async (sql: string) => {
    if (sql.includes('FROM shop_fee_invoices WHERE invoice_id')) return [invoiceRow];
    if (sql.includes('lower(paid_tx_hash)')) return [];
    return [{ ...invoiceRow, status: 'paid', paid_tx_hash: TX }];
  });
  const tx = { $queryRawUnsafe: q, $executeRawUnsafe: jest.fn(async () => 0) };
  return {
    db: { $queryRawUnsafe: q } as never,
    transaction: async (fn: (t: never) => unknown) => fn(tx as never),
    redis: {} as never,
    chain: {
      receipt: async () => ({
        status: 'success',
        transfers: [{ token: usdc, to, valueMicro: '50000' }],
      }),
    },
  } as unknown as FeeInvoiceDeps;
};

describe('fee invoice wallet (T-0318)', () => {
  const saved = { t: E.INTEGRATOR_FEE_WALLET, b: E.INTEGRATOR_FEE_WALLET_BASE };
  beforeEach(() => {
    E.INTEGRATOR_FEE_WALLET = TEMPO_FEE;
    E.INTEGRATOR_FEE_WALLET_BASE = BASE_FEE;
  });
  afterAll(() => {
    if (saved.t === undefined) delete E.INTEGRATOR_FEE_WALLET;
    else E.INTEGRATOR_FEE_WALLET = saved.t;
    if (saved.b === undefined) delete E.INTEGRATOR_FEE_WALLET_BASE;
    else E.INTEGRATOR_FEE_WALLET_BASE = saved.b;
  });

  it('F2 a Transfer to the Base fee address marks the invoice paid; pay_to is the Base address', async () => {
    const v = await markFeeInvoicePaid(mkDeps(BASE_FEE), MERCHANT, INVOICE, { tx_hash: TX });
    expect(v.status).toBe('paid');
    expect(v.pay_to).toBe(BASE_FEE); // F1
  });

  it('F2 a Transfer to the Tempo fee address is rejected', async () => {
    await expect(
      markFeeInvoicePaid(mkDeps(TEMPO_FEE), MERCHANT, INVOICE, { tx_hash: TX }),
    ).rejects.toMatchObject({
      status: 422,
      message: expect.stringContaining('no_usdc_transfer_to_fee_wallet'),
    });
  });
});
