/**
 * ZZ-03-05: GET /api/v1/discover — thin REST wrapper over discovery.service.ts's discover(),
 * same "one implementation, three surfaces" contract as the apibase.discover MCP tool. This
 * pins query-string parsing/validation only; discover()'s own ranking/shape is covered by
 * tests/unit/discovery-service.test.ts.
 */
jest.mock('../../src/services/tool-registry.service', () => ({
  getPublicCatalog: jest.fn(),
  getToolsPaginated: jest.fn(),
  getToolById: jest.fn(),
}));

const discoverMock = jest.fn();
jest.mock('../../src/services/discovery.service', () => ({
  discover: discoverMock,
}));

import { toolsRouter } from '../../src/routes/tools.router';
import { AppError } from '../../src/types/errors';
import type { Request, Response, NextFunction } from 'express';

function getHandler(path: string): (req: Request, res: Response, next: NextFunction) => unknown {
  const layer = (
    toolsRouter as unknown as {
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

function mockReq(query: Record<string, string> = {}): Request {
  return { query } as unknown as Request;
}

function mockRes(): Response {
  const res: Partial<Response> = {};
  res.setHeader = jest.fn().mockReturnValue(res);
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

const FAKE_RESPONSE = {
  query: { intent: null, category: null, max_price_usd: null, limit: 10 },
  taxonomy_version: '2026-09-15',
  capability: null,
  results: [],
  total_matches: 0,
  truncated: false,
  generated_at: '2026-09-15T00:00:00.000Z',
};

beforeEach(() => {
  discoverMock.mockReset().mockResolvedValue(FAKE_RESPONSE);
});

describe('GET /api/v1/discover', () => {
  it('forwards intent/category/max_price_usd/limit/include_unavailable to discover()', async () => {
    const res = mockRes();
    const next = jest.fn();
    await getHandler('/api/v1/discover')(
      mockReq({
        intent: 'find flights',
        category: 'travel',
        max_price_usd: '0.05',
        limit: '5',
        include_unavailable: 'true',
      }),
      res,
      next,
    );

    expect(next).not.toHaveBeenCalled();
    expect(discoverMock).toHaveBeenCalledWith({
      intent: 'find flights',
      category: 'travel',
      max_price_usd: 0.05,
      limit: 5,
      include_unavailable: true,
    });
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=60');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(FAKE_RESPONSE);
  });

  it('defaults include_unavailable to false and omits unset optional params', async () => {
    const res = mockRes();
    const next = jest.fn();
    await getHandler('/api/v1/discover')(mockReq({}), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(discoverMock).toHaveBeenCalledWith({
      intent: undefined,
      category: undefined,
      max_price_usd: undefined,
      limit: undefined,
      include_unavailable: false,
    });
  });

  it('rejects a negative max_price_usd with 400 without calling discover()', async () => {
    const res = mockRes();
    const next = jest.fn();
    await getHandler('/api/v1/discover')(mockReq({ max_price_usd: '-1' }), res, next);

    expect(discoverMock).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((next.mock.calls[0][0] as AppError).httpStatus).toBe(400);
  });

  it('rejects an out-of-range limit with 400 without calling discover()', async () => {
    const res = mockRes();
    const next = jest.fn();
    await getHandler('/api/v1/discover')(mockReq({ limit: '51' }), res, next);

    expect(discoverMock).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((next.mock.calls[0][0] as AppError).httpStatus).toBe(400);
  });
});
