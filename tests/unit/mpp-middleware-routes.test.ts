/**
 * T-0256: mppMiddleware only calls mppx.charge() on a tool-call URL with a
 * known price; never on /mcp or unknown tools. mppx is fully mocked.
 */
const mockCfg = jest.fn();
jest.mock('../../src/config/mpp.config', () => ({ getMppConfig: () => mockCfg() }));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
const mockPrice = jest.fn();
jest.mock('../../src/pipeline/stages/tool-status.stage', () => ({
  getToolPriceUsd: (id: string) => mockPrice(id),
}));

const mockCharge = jest.fn();
jest.mock('mppx/server', () => ({
  Mppx: { create: jest.fn(() => ({ charge: (opts: unknown) => mockCharge(opts) })) },
  tempo: { charge: jest.fn(() => ({})), session: jest.fn(() => ({})) },
}));
jest.mock('viem/accounts', () => ({ privateKeyToAccount: jest.fn(() => ({})) }));
jest.mock('mppx', () => ({
  Receipt: { fromResponse: () => ({ reference: 'not-a-hash' }) },
}));

import type { Request } from 'express';
import { mppMiddleware } from '../../src/middleware/mpp.middleware';
import { AppError } from '../../src/types/errors';

function makeReq(url: string, auth?: string): Request {
  return {
    headers: auth ? { authorization: auth } : {},
    originalUrl: url,
    method: 'POST',
    body: {},
    get: () => 'test.local',
    requestId: 'r1',
  } as unknown as Request;
}

function run(req: Request): Promise<unknown> {
  return new Promise((resolve) => mppMiddleware(req, {} as never, (e?: unknown) => resolve(e)));
}

let chargeInner: jest.Mock;

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
  mockPrice
    .mockReset()
    .mockImplementation((id: string) => (id === 'known.tool' ? 0.25 : undefined));
  chargeInner = jest.fn().mockResolvedValue({ status: 200, headers: new Headers() });
  mockCharge.mockReset().mockImplementation(() => chargeInner);
});

describe('mppMiddleware route/price gating (T-0256)', () => {
  it('M1: POST /mcp + Payment → 400, charge never built', async () => {
    const e = await run(makeReq('/mcp', 'Payment x'));
    expect(e).toBeInstanceOf(AppError);
    expect(mockCharge).not.toHaveBeenCalled();
    expect(chargeInner).not.toHaveBeenCalled();
  });

  it('M2: unknown tool URL + Payment → 400, charge never built', async () => {
    const e = await run(makeReq('/api/v1/tools/unknown.tool/call', 'Payment x'));
    expect(e).toBeInstanceOf(AppError);
    expect(mockCharge).not.toHaveBeenCalled();
    expect(chargeInner).not.toHaveBeenCalled();
  });

  it('M3: known tool → charge called with { amount: "0.25" }; req.mppPayment.amount set', async () => {
    const req = makeReq('/api/v1/tools/known.tool/call', 'Payment x');
    const e = await run(req);
    expect(e).toBeUndefined();
    expect(mockCharge).toHaveBeenCalledTimes(1);
    expect(mockCharge).toHaveBeenCalledWith({ amount: '0.25' });
    expect(req.mppPayment?.amount).toBe('0.25');
  });

  it('M4: /mcp without Payment header → next() untouched', async () => {
    expect(await run(makeReq('/mcp'))).toBeUndefined();
    expect(await run(makeReq('/mcp', 'Bearer ak_x'))).toBeUndefined();
    expect(mockCharge).not.toHaveBeenCalled();
  });

  it('M5: MPP disabled → next() without touching mppx', async () => {
    mockCfg.mockReturnValue({ enabled: false });
    expect(await run(makeReq('/mcp', 'Payment x'))).toBeUndefined();
    expect(mockCharge).not.toHaveBeenCalled();
  });
});
