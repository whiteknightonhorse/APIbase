/**
 * T-0426: mppx 0.13.5 handler results. Only status 200 is a paid request; 403 (replayed credential)
 * is a final 403 credential_replayed, 402 stays a 400 with the upgrade hint, any other status is a
 * 400 and never the paid path, and an unknown settlement outcome is a 503 + ONE mpp_settle_unknown
 * outbox event. mppx is fully mocked.
 */
const mockCfg = jest.fn();
jest.mock('../../src/config/mpp.config', () => ({ getMppConfig: () => mockCfg() }));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/pipeline/stages/tool-status.stage', () => ({ getToolPriceUsd: () => 0.25 }));
const mockOutboxCreate = jest.fn().mockResolvedValue({});
jest.mock('../../src/services/prisma.service', () => ({
  getPrisma: () => ({ outbox: { create: mockOutboxCreate } }),
}));
const mockCharge = jest.fn();
jest.mock('../../src/services/redis.service', () => ({ getSharedRedis: () => ({}) }));
jest.mock('mppx/server', () => ({
  Store: {
    redis: () => ({ get: jest.fn(), put: jest.fn(), delete: jest.fn(), update: jest.fn() }),
  },
  Mppx: { create: jest.fn(() => ({ charge: (opts: unknown) => mockCharge(opts) })) },
  tempo: { charge: jest.fn(() => ({})) },
}));
jest.mock('viem/accounts', () => ({ privateKeyToAccount: jest.fn(() => ({})) }));
jest.mock('mppx', () => ({ Receipt: { fromResponse: () => ({ reference: 'not-a-hash' }) } }));

import type { Request } from 'express';
import { mppMiddleware } from '../../src/middleware/mpp.middleware';
import { AppError } from '../../src/types/errors';

const USDC = '0x20C000000000000000000000b9537d11c60E8b50';

function makeReq(): Request {
  return {
    headers: { authorization: 'Payment x' },
    originalUrl: '/api/v1/tools/known.tool/call',
    method: 'POST',
    body: {},
    get: () => 'test.local',
    requestId: 'r1',
  } as unknown as Request;
}

function makeRes() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = {
    statusCode: 0,
    body: undefined as unknown,
    status: jest.fn((c: number) => {
      res.statusCode = c;
      return res;
    }),
    json: jest.fn((b: unknown) => {
      res.body = b;
      return res;
    }),
    setHeader: jest.fn(),
  };
  return res;
}

async function run(req: Request) {
  const res = makeRes();
  const next = jest.fn();
  mppMiddleware(req, res as never, next);
  await new Promise((r) => setTimeout(r, 20));
  return { res, next };
}

function handlerReturns(status: number) {
  mockCharge.mockImplementation(() => async () => ({
    status,
    withReceipt: (r: Response) => r,
    challenge: new Response(null, { status: 402 }),
  }));
}

beforeEach(() => {
  mockOutboxCreate.mockClear();
  mockCfg.mockReset().mockReturnValue({
    enabled: true,
    privateKey: '0x00',
    usdcAddress: USDC,
    walletAddress: '0x2',
    secretKey: 's',
    realm: 'r',
    rpcUrl: 'http://rpc.invalid',
  });
});

describe('mppx handler status mapping (T-0426)', () => {
  it('403 -> 403 credential_replayed, charged:false, no req.mppPayment, pipeline not entered', async () => {
    handlerReturns(403);
    const req = makeReq();
    const { res, next } = await run(req);
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({
      error: 'forbidden',
      error_code: 'credential_replayed',
      charged: false,
      message:
        'This MPP credential was already settled. Request a new challenge (GET the same URL) and pay again.',
    });
    expect(req.mppPayment).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
  });

  it('402 -> 400 with the mppx 0.6.16 upgrade hint', async () => {
    handlerReturns(402);
    const req = makeReq();
    const { next } = await run(req);
    const err = next.mock.calls[0][0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.httpStatus).toBe(400);
    expect(err.message).toContain('MPP payment verification failed');
    expect(err.message).toContain('older than mppx 0.6.16');
    expect(req.mppPayment).toBeUndefined();
  });

  it('any other non-200 status -> 400, never the paid path', async () => {
    handlerReturns(500);
    const req = makeReq();
    const { next } = await run(req);
    const err = next.mock.calls[0][0] as AppError;
    expect(err.httpStatus).toBe(400);
    expect(req.mppPayment).toBeUndefined();
  });

  it('200 -> paid, asset falls back to the configured USDC.e', async () => {
    handlerReturns(200);
    const req = makeReq();
    const { next } = await run(req);
    expect(next).toHaveBeenCalledWith();
    expect(req.mppPayment).toMatchObject({ verified: true, asset: USDC });
  });

  it('PaymentOutcomeUnknownError -> 503 mpp_settlement_unknown and exactly one mpp_settle_unknown event', async () => {
    const err = Object.assign(new Error('Payment outcome unknown'), {
      name: 'PaymentOutcomeUnknownError',
      transactionHash: '0xabc',
    });
    mockCharge.mockImplementation(() => async () => {
      throw err;
    });
    const req = makeReq();
    const { res, next } = await run(req);
    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({
      error: 'service_unavailable',
      error_code: 'mpp_settlement_unknown',
      retry_after: 30,
      tx_hash: '0xabc',
    });
    expect(mockOutboxCreate).toHaveBeenCalledTimes(1);
    expect(mockOutboxCreate.mock.calls[0][0].data).toMatchObject({
      event_type: 'mpp_settle_unknown',
      payload: {
        request_id: 'r1',
        url: '/api/v1/tools/known.tool/call',
        amount: '0.25',
        tx_hash: '0xabc',
      },
    });
    expect(next).not.toHaveBeenCalled();
    expect(req.mppPayment).toBeUndefined();
  });
});
