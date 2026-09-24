/**
 * T-0187A (taskloop 0187 ruling-1, §1): GET /api and GET /api/v1 moved from two hand-typed
 * nginx `return 402` literals (broken base64, x402Version 1, a nonexistent tool id) into
 * this router, built with the same `buildPaymentRequiredResponse` real 402s use, against a
 * live-priced real tool. Pins the three contracts the scanner's neutral verdict hinged on:
 * valid base64 PAYMENT-REQUIRED header, x402Version 2, non-empty accepts[] — plus the
 * "don't dead-end a paying client" rule (payment header here -> 400, not silently swallowed).
 */
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
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../src/pipeline/stages/tool-status.stage', () => ({
  getToolPriceUsd: jest.fn(),
}));

jest.mock('../../src/middleware/mpp.middleware', () => ({
  buildMppChallengeHeader: jest.fn(),
}));

import { encodePaymentRequiredHeader } from '@x402/core/http';
import { apiEntryRouter } from '../../src/routes/api-entry.router';
import { getToolPriceUsd } from '../../src/pipeline/stages/tool-status.stage';
import { buildMppChallengeHeader } from '../../src/middleware/mpp.middleware';
import { AppError } from '../../src/types/errors';
import type { Request, Response, NextFunction } from 'express';

const mockGetToolPriceUsd = getToolPriceUsd as jest.Mock;
const mockBuildMppChallengeHeader = buildMppChallengeHeader as jest.Mock;

function getHandler(path: string): (req: Request, res: Response, next: NextFunction) => unknown {
  const layer = (
    apiEntryRouter as unknown as {
      stack: Array<{ route?: { path: string; stack: Array<{ handle: unknown }> } }>;
    }
  ).stack.find((l) => l.route?.path === path);
  if (!layer?.route) throw new Error(`route ${path} not registered`);
  return layer.route.stack[0].handle as (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => unknown;
}

function mockReq(headers: Record<string, string> = {}): Request {
  return {
    headers,
    requestId: 'req-test-1',
    originalUrl: '/api',
    get: (name: string) => (name.toLowerCase() === 'host' ? 'apibase.pro' : undefined),
  } as unknown as Request;
}

function mockRes(): Response {
  const res: Partial<Response> = { headers: {} } as Partial<Response> & {
    headers: Record<string, string>;
  };
  (res as unknown as { headers: Record<string, string> }).headers = {};
  res.setHeader = jest.fn((name: string, value: string) => {
    (res as unknown as { headers: Record<string, string> }).headers[name] = value;
    return res as Response;
  }) as unknown as Response['setHeader'];
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

beforeEach(() => {
  mockGetToolPriceUsd.mockReset();
  mockBuildMppChallengeHeader.mockReset();
});

describe('GET /api, GET /api/v1 — x402/MPP entry-point marker', () => {
  for (const path of ['/api', '/api/v1']) {
    it(`${path}: no payment header -> 402 with a real x402 v2 challenge + PAYMENT-REQUIRED header`, async () => {
      mockGetToolPriceUsd.mockReturnValue(0.001);
      mockBuildMppChallengeHeader.mockResolvedValue('Payment realm="tempo"');

      const res = mockRes();
      const next = jest.fn();
      await getHandler(path)(mockReq(), res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(402);

      const body = (res.json as jest.Mock).mock.calls[0][0];
      expect(body.x402Version).toBe(2);
      expect(Array.isArray(body.accepts)).toBe(true);
      expect(body.accepts.length).toBeGreaterThan(0);
      expect(body.resource.url).toBe('https://apibase.pro/api/v1/tools/coingecko.get_market/call');

      const headers = (res as unknown as { headers: Record<string, string> }).headers;
      expect(headers['Cache-Control']).toBe('public, max-age=300');
      expect(headers['WWW-Authenticate']).toBe('Payment realm="tempo"');

      const decoded = JSON.parse(Buffer.from(headers['PAYMENT-REQUIRED'], 'base64').toString());
      expect(decoded.x402Version).toBe(2);
      expect(decoded.accepts.length).toBeGreaterThan(0);
      // Round-trips through the SDK's own encoder, not a hand-rolled base64 literal.
      expect(headers['PAYMENT-REQUIRED']).toBe(encodePaymentRequiredHeader(body));
    });

    it(`${path}: X-Payment header present -> 400, never treated as a real payment`, async () => {
      mockGetToolPriceUsd.mockReturnValue(0.001);

      const res = mockRes();
      const next = jest.fn();
      await getHandler(path)(mockReq({ 'x-payment': 'deadbeef' }), res, next);

      expect(res.status).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect((next.mock.calls[0][0] as AppError).httpStatus).toBe(400);
    });

    it(`${path}: Payment-Signature header present -> 400`, async () => {
      mockGetToolPriceUsd.mockReturnValue(0.001);

      const res = mockRes();
      const next = jest.fn();
      await getHandler(path)(mockReq({ 'payment-signature': 'deadbeef' }), res, next);

      expect(res.status).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect((next.mock.calls[0][0] as AppError).httpStatus).toBe(400);
    });

    it(`${path}: marker tool missing from live cache -> 503, not a fabricated price`, async () => {
      mockGetToolPriceUsd.mockReturnValue(undefined);

      const res = mockRes();
      const next = jest.fn();
      await getHandler(path)(mockReq(), res, next);

      expect(res.status).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect((next.mock.calls[0][0] as AppError).httpStatus).toBe(503);
    });
  }
});
