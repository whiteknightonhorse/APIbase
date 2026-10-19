/**
 * T-0429: the MPP credential may travel in `Payment-Authorization: Payment <cred>` (mppx >= 0.9
 * `requiresAuth`) next to `Authorization: Bearer <api key>`; `Authorization: Payment <cred>` still
 * works (mppx < 0.9); a credential in both headers is a 400. Only the /mcp challenge instance is
 * created with requiresAuth. mppx is fully mocked.
 */
const mockCfg = jest.fn();
jest.mock('../../src/config/mpp.config', () => ({ getMppConfig: () => mockCfg() }));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/pipeline/stages/tool-status.stage', () => ({
  getToolPriceUsd: (id: string) => (id === 'known.tool' ? 0.25 : undefined),
}));

const createCalls: Array<{ requiresAuth?: boolean }> = [];
const verifyCharge = jest.fn();
const challengeCharge = jest.fn();
jest.mock('../../src/services/redis.service', () => ({ getSharedRedis: () => ({}) }));
jest.mock('mppx/server', () => ({
  Store: {
    redis: () => ({ get: jest.fn(), put: jest.fn(), delete: jest.fn(), update: jest.fn() }),
  },
  Mppx: {
    create: jest.fn((opts: { requiresAuth?: boolean }) => {
      createCalls.push(opts);
      return { charge: (p: unknown) => (opts.requiresAuth ? challengeCharge(p) : verifyCharge(p)) };
    }),
  },
  tempo: { charge: jest.fn(() => ({})) },
}));
jest.mock('viem/accounts', () => ({ privateKeyToAccount: jest.fn(() => ({})) }));
jest.mock('mppx', () => ({ Receipt: { fromResponse: () => ({ reference: 'not-a-hash' }) } }));

import type { Request } from 'express';
import {
  buildMppChallengeHeader,
  mppMiddleware,
  resolveMppCredentialHeader,
} from '../../src/middleware/mpp.middleware';
import { AppError } from '../../src/types/errors';

function makeReq(headers: Record<string, string>): Request {
  return {
    headers,
    originalUrl: '/api/v1/tools/known.tool/call',
    method: 'POST',
    body: {},
    get: () => 'test.local',
    requestId: 'r1',
  } as unknown as Request;
}

function run(req: Request): Promise<unknown> {
  return new Promise((resolve) => mppMiddleware(req, {} as never, (e?: unknown) => resolve(e)));
}

let handler: jest.Mock;

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
  handler = jest.fn().mockResolvedValue({ status: 200, headers: new Headers() });
  verifyCharge.mockReset().mockImplementation(() => handler);
  challengeCharge.mockReset();
});

describe('MPP Payment-Authorization header (T-0429)', () => {
  it('verifies a credential sent in Payment-Authorization next to a Bearer key', async () => {
    const req = makeReq({
      authorization: 'Bearer apb_key',
      'payment-authorization': 'Payment cred-1',
    });
    expect(await run(req)).toBeUndefined();
    const sent = handler.mock.calls[0][0] as globalThis.Request;
    expect(sent.headers.get('authorization')).toBe('Payment cred-1');
    expect(sent.headers.get('payment-authorization')).toBeNull();
    expect((req as unknown as { mppPayment: { verified: boolean } }).mppPayment.verified).toBe(
      true,
    );
  });

  it('still verifies Authorization: Payment (mppx < 0.9 clients)', async () => {
    const req = makeReq({ authorization: 'Payment cred-2' });
    expect(await run(req)).toBeUndefined();
    expect((handler.mock.calls[0][0] as globalThis.Request).headers.get('authorization')).toBe(
      'Payment cred-2',
    );
  });

  it('a Bearer key alone is not an MPP payment', async () => {
    expect(await run(makeReq({ authorization: 'Bearer apb_key' }))).toBeUndefined();
    expect(handler).not.toHaveBeenCalled();
  });

  it('a credential in both headers -> 400, nothing charged', async () => {
    const err = await run(
      makeReq({ authorization: 'Payment a', 'payment-authorization': 'Payment b' }),
    );
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).httpStatus).toBe(400);
    expect(handler).not.toHaveBeenCalled();
    expect(() =>
      resolveMppCredentialHeader({
        authorization: 'Payment a',
        'payment-authorization': 'Payment a',
      }),
    ).toThrow(AppError);
  });

  it('only the /mcp challenge instance is created with requiresAuth', async () => {
    challengeCharge.mockReturnValue(async () => ({
      status: 402,
      challenge: {
        headers: new Headers({ 'WWW-Authenticate': 'Payment header="Payment-Authorization"' }),
      },
    }));
    verifyCharge.mockReturnValue(async () => ({
      status: 402,
      challenge: { headers: new Headers({ 'WWW-Authenticate': 'Payment id="x"' }) },
    }));
    const mcp = await buildMppChallengeHeader('known.tool', 0.25, 'https://h/mcp', undefined, {
      mcp: true,
    });
    const tool = await buildMppChallengeHeader(
      'known.tool',
      0.25,
      'https://h/api/v1/tools/known.tool/call',
    );
    expect(mcp).toContain('header="Payment-Authorization"');
    expect(tool).not.toContain('Payment-Authorization');
    expect(createCalls.filter((c) => c.requiresAuth === true)).toHaveLength(1);
    expect(createCalls.filter((c) => !c.requiresAuth)).toHaveLength(1);
  });
});
