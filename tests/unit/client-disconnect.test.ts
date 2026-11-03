/**
 * T-0662: no x402 settle and no charge when the client connection closed before the result was
 * written; an MPP charge in that case becomes a refund-owed row.
 */
import { EventEmitter } from 'node:events';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

const mockRecord = jest.fn();
jest.mock('../../src/services/refund-ledger.service', () => ({
  recordRefundOwed: (...a: unknown[]) => mockRecord(...a),
}));
jest.mock('../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../../src/services/escrow.service', () => ({ finalize: jest.fn(), refund: jest.fn() }));
const mockSettle = jest.fn();
jest.mock('../../src/pipeline/stages/x402-settle', () => ({
  settleX402: (...a: unknown[]) => mockSettle(...a),
}));
const mockDel = jest.fn().mockResolvedValue(1);
jest.mock('../../src/services/redis.service', () => ({
  ensureRedisConnected: async () => ({ del: mockDel }),
}));
jest.mock('@x402/core/http', () => ({
  decodePaymentSignatureHeader: () => ({ payload: { authorization: { nonce: '0xabc' } } }),
}));

import { escrowFinalizeStage } from '../../src/pipeline/stages/escrow-finalize.stage';
import { createPipelineContext } from '../../src/pipeline/types';
import { watchClientDisconnect } from '../../src/pipeline/client-disconnect';

function paidCtx(rail: 'x402' | 'mpp') {
  const c = createPipelineContext('req-cd-1', 'POST', '/x', {}, {});
  c.toolId = 'weather.get_current';
  c.toolPrice = 0.002;
  c.providerCalled = true;
  c.providerResponse = { ok: true } as never;
  if (rail === 'x402') {
    c.x402Paid = true;
    c.x402Payer = '0xpayer';
    c.x402PaymentHeader = 'hdr';
  } else {
    c.mppPaid = true;
    c.mppPayer = '0xpayer';
    c.mppTxHash = '0xtx';
  }
  return c;
}

function fake(writableFinished: boolean) {
  const res = Object.assign(new EventEmitter(), { writableFinished });
  return { req: res, res };
}

describe('client disconnect (T-0662)', () => {
  beforeEach(() => {
    mockRecord.mockReset();
    mockSettle.mockReset();
    mockDel.mockClear();
  });

  it('x402: close before the result was written -> no settle, NOT_CHARGED, nonce released', async () => {
    const ctx = paidCtx('x402');
    const { req, res } = fake(false);
    watchClientDisconnect(res as never, ctx);
    req.emit('close');
    const r = await escrowFinalizeStage.execute(ctx);
    expect(r.ok).toBe(true);
    expect(mockSettle).not.toHaveBeenCalled();
    expect(ctx.billingStatus).toBe('NOT_CHARGED');
    expect(ctx.finalCost).toBe(0);
    expect(ctx.notChargedReason).toBe('client_disconnected');
    expect(mockDel).toHaveBeenCalledWith('payment-nonce:x402:0xabc');
  });

  it('x402: close after the response finished -> settle runs as today', async () => {
    const ctx = paidCtx('x402');
    const { req, res } = fake(true);
    watchClientDisconnect(res as never, ctx);
    req.emit('close');
    await escrowFinalizeStage.execute(ctx);
    expect(ctx.clientDisconnected).toBeUndefined();
    expect(mockSettle).toHaveBeenCalledTimes(1);
    expect(ctx.billingStatus).toBe('PAID');
  });

  it('MPP: close before the result was written -> one refund-owed row, client_disconnected', async () => {
    mockRecord.mockResolvedValue({});
    const ctx = paidCtx('mpp');
    const { req, res } = fake(false);
    watchClientDisconnect(res as never, ctx);
    req.emit('close');
    await escrowFinalizeStage.execute(ctx);
    expect(mockRecord).toHaveBeenCalledTimes(1);
    expect(mockRecord.mock.calls[0][0]).toEqual(
      expect.objectContaining({ rail: 'tempo', reason: 'client_disconnected' }),
    );
    expect(ctx.billingStatus).toBe('PAID');
  });

  describe('real socket (Node http server)', () => {
    async function run(abort: boolean): Promise<boolean | undefined> {
      const ctx = createPipelineContext('req-cd-real', 'POST', '/x', {}, {});
      let seen: boolean | undefined;
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const handled = new Promise<void>((resolve) => {
        const srv = http.createServer(async (req, res) => {
          watchClientDisconnect(res, ctx);
          req.resume();
          await new Promise((r) => req.once('end', r)); // body consumed
          await gate; // "provider call"
          seen = ctx.clientDisconnected;
          if (!abort) res.end('ok');
          resolve();
        });
        srv.listen(0, () => {
          const port = (srv.address() as AddressInfo).port;
          const creq = http.request({ port, method: 'POST' }, (r) => r.resume());
          creq.on('error', () => undefined);
          creq.end('{"a":1}');
          setTimeout(() => {
            if (abort) creq.destroy();
            setTimeout(release, 100);
          }, 100);
          void handled.then(() => srv.close());
        });
      });
      await handled;
      return seen;
    }

    it('client never abandoned the call -> flag stays unset after the body is consumed', async () => {
      expect(await run(false)).toBeUndefined();
    });

    it('client aborted before the result -> flag set', async () => {
      expect(await run(true)).toBe(true);
    });
  });
});
