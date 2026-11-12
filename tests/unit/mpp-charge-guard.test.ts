/**
 * T-0790: no charge for a request the app refuses outside the pipeline. mppx, the ledger and the
 * pre-check are mocked; the real mppMiddleware and acceptsJson run.
 */
import { EventEmitter } from 'node:events';

const mockCfg = jest.fn();
jest.mock('../../src/config/mpp.config', () => ({ getMppConfig: () => mockCfg() }));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/pipeline/stages/tool-status.stage', () => ({
  getToolPriceUsd: (id: string) => (id === 'known.tool' ? 0.25 : undefined),
  checkToolAvailability: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../src/pipeline/precheck', () => ({
  precheckToolCall: jest.fn().mockResolvedValue(null),
}));
const mockCharge = jest.fn();
jest.mock('mppx/server', () => ({
  Store: { redis: () => ({ update: jest.fn() }) },
  Mppx: { create: jest.fn(() => ({ charge: (o: unknown) => mockCharge(o) })) },
  tempo: { charge: jest.fn(() => ({})) },
}));
jest.mock('viem/accounts', () => ({ privateKeyToAccount: jest.fn(() => ({})) }));
jest.mock('../../src/services/redis.service', () => ({ getSharedRedis: () => ({}) }));
const HASH = '0x' + 'AB'.repeat(32);
jest.mock('mppx', () => ({ Receipt: { fromResponse: () => ({ reference: HASH }) } }));
jest.mock('viem', () => ({
  createPublicClient: () => ({ getTransaction: async () => ({ from: '0xPayer', to: null }) }),
  http: () => ({}),
}));
const mockRecord = jest.fn();
jest.mock('../../src/services/refund-ledger.service', () => ({
  recordRefundOwed: (...a: unknown[]) => mockRecord(...a),
}));

import type { Request, Response } from 'express';
import { mppMiddleware } from '../../src/middleware/mpp.middleware';
import { acceptsJson } from '../../src/middleware/content-type.middleware';

function makeReq(method: string, accept: string | undefined): Request {
  return {
    headers: { authorization: 'Payment x', ...(accept ? { accept } : {}) },
    originalUrl: '/api/v1/tools/known.tool/call',
    method,
    body: {},
    get: () => 'test.local',
    requestId: 'req-1',
  } as unknown as Request;
}

function makeRes() {
  const res = new EventEmitter() as EventEmitter & Record<string, unknown>;
  res.statusCode = 200;
  res.setHeader = jest.fn();
  res.status = (s: number) => {
    res.statusCode = s;
    return res;
  };
  res.json = jest.fn((b: unknown) => {
    res.body = b;
    return res;
  });
  return res;
}

function run(req: Request, res: ReturnType<typeof makeRes>): Promise<unknown> {
  return new Promise((resolve) => {
    const json = res.json as jest.Mock;
    const orig = json.getMockImplementation() as (b: unknown) => unknown;
    json.mockImplementation((b: unknown) => {
      const out = orig(b);
      resolve('sent');
      return out;
    });
    mppMiddleware(req, res as unknown as Response, (e?: unknown) => resolve(e ?? 'next'));
  });
}

beforeEach(() => {
  mockCfg.mockReset().mockReturnValue({
    enabled: true,
    privateKey: '0x00',
    usdcAddress: '0x1',
    walletAddress: '0x2',
    secretKey: 's',
    realm: 'r',
    rpcUrl: 'http://rpc',
  });
  mockCharge.mockReset().mockImplementation(() => async () => ({
    status: 200,
    withReceipt: (r: globalThis.Response) => r,
  }));
  mockRecord.mockReset().mockResolvedValue(null);
});

describe('T-0790 charge guard', () => {
  it('paid POST with Accept: text/html -> 406 charged:false, charge not called', async () => {
    const res = makeRes();
    await run(makeReq('POST', 'text/html'), res);
    expect(res.statusCode).toBe(406);
    expect((res.body as { charged: boolean }).charged).toBe(false);
    expect(mockCharge).not.toHaveBeenCalled();
  });

  it('paid GET on a tool-call URL -> 405 charged:false, charge not called', async () => {
    const res = makeRes();
    await run(makeReq('GET', 'application/json'), res);
    expect(res.statusCode).toBe(405);
    expect((res.body as { charged: boolean }).charged).toBe(false);
    expect(mockCharge).not.toHaveBeenCalled();
  });

  it('charged, then a pre-pipeline 500 -> exactly one refund row with the original tx', async () => {
    const req = makeReq('POST', 'application/json');
    const res = makeRes();
    expect(await run(req, res)).toBe('next');
    expect(mockCharge).toHaveBeenCalledTimes(1);
    res.statusCode = 500;
    res.emit('finish');
    await new Promise((r) => setImmediate(r));
    expect(mockRecord).toHaveBeenCalledTimes(1);
    expect(mockRecord.mock.calls[0][0]).toMatchObject({
      rail: 'tempo',
      reason: 'stopped_before_pipeline:500',
      source_kind: 'request',
      source_id: 'req-1',
      original_tx: HASH.toLowerCase(),
    });
  });

  it('no refund row when the pipeline started or the response is < 400', async () => {
    const a = makeReq('POST', 'application/json');
    const resA = makeRes();
    await run(a, resA);
    a.pipelineStarted = true;
    resA.statusCode = 500;
    resA.emit('finish');
    const resB = makeRes();
    await run(makeReq('POST', 'application/json'), resB);
    resB.emit('finish');
    await new Promise((r) => setImmediate(r));
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('acceptsJson: typeof check first, absent accepted', () => {
    expect(acceptsJson(undefined)).toBe(true);
    expect(acceptsJson('*/*')).toBe(true);
    expect(acceptsJson('text/html')).toBe(false);
    expect(acceptsJson(['application/json'])).toBe(false);
  });
});
