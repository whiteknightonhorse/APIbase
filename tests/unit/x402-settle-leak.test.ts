/**
 * F1/C-7 — x402 settle-failure revenue-leak alert.
 *
 * settleX402() itself is best-effort by design (§8.9: the client already has
 * the data by the time this runs, aborting the pipeline here would be worse
 * than a logged failure). Before this change, a failed settle was ONLY a
 * logger.warn — invisible outside log aggregation. recordSettleFailure()
 * is what turns "we logged it" into "a durable record exists that
 * scripts/x402-settle-leak-alerts.py can page on" — this test pins that the
 * write actually happens, with the right shape, and never throws even if
 * the DB write itself fails (a broken alert must not become a second
 * failure on top of an already-successful response).
 */

const mockOutboxCreate = jest.fn();
jest.mock('../../src/services/prisma.service', () => ({
  getPrisma: () => ({ outbox: { create: mockOutboxCreate } }),
}));
jest.mock('../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
// x402-settle.ts pulls in the whole payment-config surface at module load
// (env-var validation that process.exit(1)s outside a real deployment) even
// though recordSettleFailure() itself touches none of it — mock every other
// import so loading the module for this one function is inert.
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

import { decodePaymentSignatureHeader } from '@x402/core/http';
import { parsePaymentPayload, isPaymentPayloadV1 } from '@x402/core/schemas';
import { getX402Config, buildServerX402Requirements } from '../../src/config/x402.config';
import { getSharedResourceServer } from '../../src/services/x402-server.service';
import { recordSettleFailure, settleX402 } from '../../src/pipeline/stages/x402-settle';
import { createPipelineContext } from '../../src/pipeline/types';

function ctx() {
  const c = createPipelineContext('req-leak-1', 'POST', '/execute', {}, {});
  c.toolId = 'weather.get_current';
  c.x402Payer = '0xabc123';
  c.toolPrice = 0.002;
  return c;
}

describe('recordSettleFailure (F1/C-7)', () => {
  beforeEach(() => {
    mockOutboxCreate.mockReset();
  });

  it('writes an x402_settle_failed outbox event with the request/tool/payer/amount/reason', async () => {
    mockOutboxCreate.mockResolvedValue({ id: 1n });

    await recordSettleFailure(ctx(), 'settle_returned_failure: insufficient funds');

    expect(mockOutboxCreate).toHaveBeenCalledTimes(1);
    const call = mockOutboxCreate.mock.calls[0][0];
    expect(call.data.event_type).toBe('x402_settle_failed');
    expect(call.data.payload).toEqual(
      expect.objectContaining({
        request_id: 'req-leak-1',
        tool_id: 'weather.get_current',
        payer: '0xabc123',
        amount_usd: 0.002,
        reason: 'settle_returned_failure: insufficient funds',
      }),
    );
  });

  it('never throws even when the outbox write itself fails', async () => {
    mockOutboxCreate.mockRejectedValue(new Error('db unreachable'));

    await expect(recordSettleFailure(ctx(), 'settle_threw: timeout')).resolves.toBeUndefined();
  });
});

/**
 * T-0177 (2026-09-23) — settleX402() must record the facilitator's real
 * on-chain outcome on ctx.x402SettleSucceeded so LEDGER_WRITE can persist
 * it (execution_ledger.x402_onchain_settled), distinct from billingStatus
 * which stays 'PAID' either way (§8.9). Discovered via a production incident
 * where the local facilitator had returned success:false on 100% of settles
 * since 2026-06-16 (empty operator gas wallet) while every ledger row still
 * read PAID with no way to tell the two apart.
 */
describe('settleX402 records the real settle outcome (T-0177)', () => {
  const mockSettlePayment = jest.fn();

  function paidCtx() {
    const c = ctx();
    c.x402PaymentHeader = 'header';
    return c;
  }

  beforeEach(() => {
    mockOutboxCreate.mockReset();
    mockSettlePayment.mockReset();
    (decodePaymentSignatureHeader as jest.Mock).mockReturnValue('decoded');
    (parsePaymentPayload as jest.Mock).mockReturnValue({
      success: true,
      data: { scheme: 'exact' },
    });
    (isPaymentPayloadV1 as unknown as jest.Mock).mockReturnValue(false);
    (getX402Config as jest.Mock).mockReturnValue({});
    (buildServerX402Requirements as jest.Mock).mockReturnValue({});
    (getSharedResourceServer as jest.Mock).mockReturnValue({ settlePayment: mockSettlePayment });
  });

  it('sets x402SettleSucceeded=true on a real on-chain success', async () => {
    mockSettlePayment.mockResolvedValue({ success: true });

    const c = paidCtx();
    await settleX402(c);

    expect(c.x402SettleSucceeded).toBe(true);
    expect(mockOutboxCreate).not.toHaveBeenCalled();
  });

  it('sets x402SettleSucceeded=false when the facilitator returns success:false (the T-0177 empty-gas-wallet case)', async () => {
    mockSettlePayment.mockResolvedValue({ success: false, errorReason: 'transaction_failed' });

    const c = paidCtx();
    await settleX402(c);

    expect(c.x402SettleSucceeded).toBe(false);
    expect(mockOutboxCreate).toHaveBeenCalledTimes(1);
  });

  it('sets x402SettleSucceeded=false when settlePayment throws', async () => {
    mockSettlePayment.mockRejectedValue(new Error('RPC unreachable'));

    const c = paidCtx();
    await settleX402(c);

    expect(c.x402SettleSucceeded).toBe(false);
  });

  it('leaves x402SettleSucceeded unset when no settle attempt is made (free tool)', async () => {
    const c = paidCtx();
    c.toolPrice = 0;

    await settleX402(c);

    expect(c.x402SettleSucceeded).toBeUndefined();
    expect(mockSettlePayment).not.toHaveBeenCalled();
  });
});
