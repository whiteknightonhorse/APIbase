/**
 * T-0428: settlement_pending (broadcast, receipt not seen) and a facilitator timeout are UNKNOWN
 * outcomes, not failures. settleX402 writes exactly one `x402_settle_pending` outbox event, never
 * `x402_settle_failed`, and leaves the settle state `pending` for the ledger. No second settle.
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

const mockSettlePayment = jest.fn();

function paidCtx() {
  const c = createPipelineContext('req-pend-1', 'POST', '/execute', {}, {});
  c.toolId = 'weather.get_current';
  c.x402Payer = '0xabc123';
  c.toolPrice = 0.002;
  c.executionId = 'exec-1';
  c.x402PaymentHeader = 'header';
  return c;
}

describe('settleX402 unknown outcomes (T-0428)', () => {
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

  it('settlement_pending with a hash -> one x402_settle_pending event, no x402_settle_failed, state pending', async () => {
    mockSettlePayment.mockResolvedValue({
      success: false,
      errorReason: 'settlement_pending',
      transaction: '0xtx',
    });
    const c = paidCtx();
    await settleX402(c);

    expect(mockSettlePayment).toHaveBeenCalledTimes(1);
    expect(mockOutboxCreate).toHaveBeenCalledTimes(1);
    const data = mockOutboxCreate.mock.calls[0][0].data;
    expect(data.event_type).toBe('x402_settle_pending');
    expect(data.payload).toEqual({
      request_id: 'req-pend-1',
      execution_id: 'exec-1',
      tool_id: 'weather.get_current',
      payer: '0xabc123',
      amount_usd: 0.002,
      tx_hash: '0xtx',
      network: 'eip155:8453',
      nonce: '0xnonce',
      valid_before: '1900000000',
    });
    expect(c.x402SettleSucceeded).toBeUndefined();
    expect(c.x402SettleState).toBe('pending');
    expect(c.x402SettleTxHash).toBe('0xtx');
  });

  it('FacilitatorTimeoutError -> the same pending event without tx_hash, still one settle call', async () => {
    const e = new Error('settle timed out');
    e.name = 'FacilitatorTimeoutError';
    mockSettlePayment.mockRejectedValue(e);
    const c = paidCtx();
    await settleX402(c);

    expect(mockSettlePayment).toHaveBeenCalledTimes(1);
    expect(mockOutboxCreate).toHaveBeenCalledTimes(1);
    const data = mockOutboxCreate.mock.calls[0][0].data;
    expect(data.event_type).toBe('x402_settle_pending');
    expect(data.payload.tx_hash).toBeUndefined();
    expect(data.payload.nonce).toBe('0xnonce');
    expect(c.x402SettleSucceeded).toBeUndefined();
    expect(c.x402SettleState).toBe('pending');
  });

  it('settlement_pending WITHOUT a hash and any other throw stay failures', async () => {
    mockSettlePayment.mockResolvedValueOnce({ success: false, errorReason: 'settlement_pending' });
    const a = paidCtx();
    await settleX402(a);
    mockSettlePayment.mockRejectedValueOnce(new Error('RPC unreachable'));
    const b = paidCtx();
    await settleX402(b);

    expect(a.x402SettleSucceeded).toBe(false);
    expect(b.x402SettleSucceeded).toBe(false);
    const types = mockOutboxCreate.mock.calls.map((c) => c[0].data.event_type);
    expect(types).toEqual(['x402_settle_failed', 'x402_settle_failed']);
  });
});
