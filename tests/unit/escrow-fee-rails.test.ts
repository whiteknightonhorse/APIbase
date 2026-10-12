/**
 * T-0318 R1-R4: the fee legs of the shop.order.pay binding follow the rail, not one shared wallet.
 * No database: the quote row comes from a stub transaction.
 */
import { buildPaymentBinding } from '../../src/pipeline/stages/escrow.stage';
import type { PipelineContext } from '../../src/pipeline/types';

jest.mock('../../src/config/index', () => ({
  config: {
    X402_NETWORK: 'base',
    X402_PAYMENT_ADDRESS: '0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480',
    X402_FACILITATOR_URL: 'https://facilitator.example',
    X402_FACILITATOR_MODE: 'local',
    X402_OPERATOR_PRIVATE_KEY: '0x00',
    X402_BASE_RPC_URL: 'https://base.example',
    X402_BASE_SEPOLIA_RPC_URL: 'https://sepolia.example',
    X402_OPERATOR_MIN_ETH_BALANCE: 0.01,
  },
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/services/escrow.service', () => ({
  reserve: jest.fn(),
  InsufficientFundsError: class InsufficientFundsError extends Error {},
}));

jest.mock('../../src/services/x402-server.service', () => ({
  getSharedResourceServer: () => ({}),
}));

const E = process['env'];
const QUOTE_ID = '11111111-1111-4111-8111-111111111111';
const TEMPO_FEE = '0x00000000000000000000000000000000000fee01';
const BASE_FEE = '0x00000000000000000000000000000000000fee02';
const PAYOUT = '0x00000000000000000000000000000000000b0b0b';

const stubTx = (): never =>
  ({
    $queryRawUnsafe: jest.fn(async (sql: string) =>
      sql.includes('shop_quotes')
        ? [
            {
              quote_id: QUOTE_ID,
              merchant_id: '22222222-2222-4222-8222-222222222222',
              buyer_identity: 'agent:x',
              total_usd: 1.0,
              fee_usd: 0.05,
              status: 'quoted',
              expires_at: new Date(Date.now() + 60_000).toISOString(),
              is_test: false,
              rails_offered: ['base', 'tempo'],
              payout_wallet_base: PAYOUT,
              payout_wallet_tempo: PAYOUT,
              payout_pending: null,
            },
          ]
        : [{ order_id: '33333333-3333-4333-8333-333333333333', state: 'QUOTED' }],
    ),
  }) as never;

const ctx = (mppPaid: boolean): PipelineContext =>
  ({
    requestId: 'r',
    toolId: 'shop.order.pay',
    body: { quote_id: QUOTE_ID },
    mppPaid,
  }) as unknown as PipelineContext;

const KEYS = [
  'INTEGRATOR_FEE_ENABLED',
  'INTEGRATOR_FEE_WALLET',
  'INTEGRATOR_FEE_WALLET_BASE',
  'INTEGRATOR_BASE_ORDERS_ENABLED',
  'MPP_ENABLED',
];

describe('shop.order.pay fee legs per rail (T-0318)', () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of KEYS) {
      saved[k] = E[k];
      delete E[k];
    }
    E.INTEGRATOR_FEE_ENABLED = 'true';
    E.INTEGRATOR_BASE_ORDERS_ENABLED = 'true';
    E.MPP_ENABLED = 'true';
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete E[k];
      else E[k] = saved[k];
    }
  });

  it('R1 base rail needs only the Base fee address', async () => {
    E.INTEGRATOR_FEE_WALLET_BASE = BASE_FEE;
    const r = await buildPaymentBinding(ctx(false), stubTx());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.binding.fee_usd).toBe(0.05);
    // The Base receivable is derived from splits at PAID: they carry the Base address, never the Tempo one.
    expect(r.value.binding.splits).toEqual([{ wallet: BASE_FEE, amount_usd: 0.05 }]);
    expect(r.value.binding.fee_split).toEqual({ fee_to: BASE_FEE, fee_usd: 0.05 });
  });

  it('R2 tempo rail splits to the Tempo fee address, no fee_split', async () => {
    E.INTEGRATOR_FEE_WALLET = TEMPO_FEE;
    E.INTEGRATOR_FEE_WALLET_BASE = BASE_FEE;
    const r = await buildPaymentBinding(ctx(true), stubTx());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.binding.splits).toEqual([{ wallet: TEMPO_FEE, amount_usd: 0.05 }]);
    expect(r.value.binding.fee_split).toBeUndefined();
    expect(r.value.binding.fee_usd).toBe(0.05);
  });

  it('R3 tempo rail without the Tempo fee address refuses with fee_wallet_unavailable', async () => {
    E.INTEGRATOR_FEE_WALLET_BASE = BASE_FEE;
    const r = await buildPaymentBinding(ctx(true), stubTx());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe(503);
    expect(r.error.error).toBe('fee_wallet_unavailable');
  });

  it('R4 fee off: no fee, no splits, no fee_split', async () => {
    E.INTEGRATOR_FEE_ENABLED = 'false';
    E.INTEGRATOR_FEE_WALLET = TEMPO_FEE;
    E.INTEGRATOR_FEE_WALLET_BASE = BASE_FEE;
    for (const mpp of [false, true]) {
      const r = await buildPaymentBinding(ctx(mpp), stubTx());
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.binding.fee_usd).toBe(0);
      expect(r.value.binding.splits).toBeUndefined();
      expect(r.value.binding.fee_split).toBeUndefined();
    }
  });
});
