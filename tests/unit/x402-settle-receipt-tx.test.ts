/**
 * A-GA-01 ruling-2: a confirmed x402 settle must put the facilitator's tx hash on the context,
 * so the public receipt can be built from a real settleX402 result (never a hand-set field).
 */
const mockOutboxCreate = jest.fn();
jest.mock('../../src/services/prisma.service', () => ({
  getPrisma: () => ({ outbox: { create: mockOutboxCreate } }),
}));
jest.mock('../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('@x402/core/http', () => ({ decodePaymentSignatureHeader: jest.fn() }));
jest.mock('@x402/core/schemas', () => ({
  parsePaymentPayload: jest.fn(),
  isPaymentPayloadV1: jest.fn(),
}));
jest.mock('@x402/extensions/bazaar', () => ({ declareDiscoveryExtension: jest.fn() }), {
  virtual: true,
});
jest.mock('../../src/config/x402.config', () => ({
  getX402Config: jest.fn(),
  buildServerX402Requirements: jest.fn(),
}));
jest.mock('../../src/config/cdp.config', () => ({
  getCdpConfig: jest.fn(() => ({ enabled: false })),
}));
jest.mock('../../src/services/x402-server.service', () => ({ getSharedResourceServer: jest.fn() }));
jest.mock('../../src/mcp/tool-definitions', () => ({ TOOL_DEFINITIONS: [] }));

import { parsePaymentPayload, isPaymentPayloadV1 } from '@x402/core/schemas';
import { getX402Config, buildServerX402Requirements } from '../../src/config/x402.config';
import { getSharedResourceServer } from '../../src/services/x402-server.service';
import { settleX402 } from '../../src/pipeline/stages/x402-settle';
import { createPipelineContext } from '../../src/pipeline/types';
import { buildReceiptBody } from '../../src/services/public-receipt.service';

const mockSettlePayment = jest.fn();
const PAYER = '0x1111111111111111111111111111111111111111';
const PAYEE = '0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480';
const TX_MIXED = '0x' + 'AB12cd34'.repeat(8);

function paidCtx() {
  const c = createPipelineContext('req-rtx-1', 'POST', '/execute', {}, {});
  c.toolId = 'weather.get_current';
  c.x402Paid = true;
  c.x402Payer = PAYER;
  c.toolPrice = 0.002;
  c.billingStatus = 'PAID';
  c.executionId = 'exec-1';
  c.x402PaymentHeader = 'header';
  return c;
}

const inputs = {
  receiptId: 'a'.repeat(32),
  issuedAt: new Date('2026-10-20T12:00:00.000Z'),
  responseText: 'x',
  x402Payee: PAYEE,
  x402ChainId: 8453,
  mppPayee: '',
  mppChainId: 4217,
};

describe('settleX402 tx hash -> public receipt (A-GA-01 ruling-2)', () => {
  beforeEach(() => {
    mockOutboxCreate.mockReset();
    mockSettlePayment.mockReset();
    const { decodePaymentSignatureHeader } = jest.requireMock('@x402/core/http');
    decodePaymentSignatureHeader.mockReturnValue('decoded');
    (parsePaymentPayload as jest.Mock).mockReturnValue({
      success: true,
      data: {
        scheme: 'exact',
        payload: { authorization: { nonce: '0xnonce', validBefore: '1900000000' } },
      },
    });
    (isPaymentPayloadV1 as unknown as jest.Mock).mockReturnValue(false);
    (getX402Config as jest.Mock).mockReturnValue({ network: 'eip155:8453' });
    (buildServerX402Requirements as jest.Mock).mockReturnValue({});
    (getSharedResourceServer as jest.Mock).mockReturnValue({ settlePayment: mockSettlePayment });
  });

  it('confirmed settle stores the hash and yields a receipt (hash not hand-set)', async () => {
    mockSettlePayment.mockResolvedValue({
      success: true,
      transaction: TX_MIXED,
      network: 'eip155:8453',
      payer: PAYER,
    });
    const c = paidCtx();
    expect(c.x402SettleTxHash).toBeUndefined();
    await settleX402(c);
    expect(c.x402SettleTxHash).toBe(TX_MIXED);
    const body = buildReceiptBody(c, inputs);
    expect(body).not.toBeNull();
    expect(body!.payment_tx).toBe(TX_MIXED.toLowerCase());
    expect(body!.rail).toBe('x402-base');
  });

  it('success without a transaction -> no hash, no receipt, no throw', async () => {
    mockSettlePayment.mockResolvedValue({ success: true });
    const c = paidCtx();
    await settleX402(c);
    expect(c.x402SettleTxHash).toBeUndefined();
    expect(buildReceiptBody(c, inputs)).toBeNull();
  });

  it('failed settle never stores a hash', async () => {
    mockSettlePayment.mockResolvedValue({
      success: false,
      errorReason: 'insufficient_funds',
      transaction: TX_MIXED,
    });
    const c = paidCtx();
    await settleX402(c);
    expect(c.x402SettleTxHash).toBeUndefined();
    expect(buildReceiptBody(c, inputs)).toBeNull();
  });
});
