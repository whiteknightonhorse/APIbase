/**
 * ZZ-03-01 (closes GitHub issue #282): GET /api/v1/tools?category=<name> — the value set is
 * auto-derived from TOOL_DEFINITIONS[].category (src/routes/tools.router.ts's VALID_CATEGORIES),
 * never a hardcoded list that can drift from it. This pins two contracts:
 *   1. an unknown value gets 400 with the full, real 25-value list, not a stale hardcoded one.
 *   2. every one of the 25 real values is accepted and forwarded to the service layer.
 */
jest.mock('../../src/services/tool-registry.service', () => ({
  getPublicCatalog: jest.fn(),
  getToolsPaginated: jest.fn(),
  getToolById: jest.fn(),
}));

import { toolsRouter } from '../../src/routes/tools.router';
import { getToolsPaginated } from '../../src/services/tool-registry.service';
import { TOOL_DEFINITIONS } from '../../src/mcp/tool-definitions';
import { AppError } from '../../src/types/errors';
import type { Request, Response, NextFunction } from 'express';

const mockGetToolsPaginated = getToolsPaginated as jest.Mock;

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

beforeEach(() => {
  mockGetToolsPaginated.mockReset();
});

describe('GET /api/v1/tools?category= — validated against TOOL_DEFINITIONS, not a hardcoded list', () => {
  it('rejects an unknown category with 400 listing every real category value', async () => {
    const res = mockRes();
    const next = jest.fn();
    await getHandler('/api/v1/tools')(mockReq({ category: 'not-a-real-category' }), res, next);

    expect(res.status).not.toHaveBeenCalledWith(200);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const err = next.mock.calls[0][0] as AppError;
    expect(err.httpStatus).toBe(400);

    const realCategories = [...new Set(TOOL_DEFINITIONS.map((d) => d.category))]
      .filter((c): c is string => typeof c === 'string')
      .sort();
    expect(realCategories).toHaveLength(25);
    for (const cat of realCategories) {
      expect(err.message).toContain(cat);
    }
  });

  it('accepts all 25 real category values and forwards each one to getToolsPaginated', async () => {
    const realCategories = [...new Set(TOOL_DEFINITIONS.map((d) => d.category))].filter(
      (c): c is string => typeof c === 'string',
    );
    expect(realCategories).toHaveLength(25);

    for (const cat of realCategories) {
      mockGetToolsPaginated.mockResolvedValueOnce({
        data: [{ id: `${cat}.example` }],
        total: 1,
        pagination: { cursor: null, has_more: false, limit: 2000 },
      });

      const res = mockRes();
      const next = jest.fn();
      await getHandler('/api/v1/tools')(mockReq({ category: cat }), res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockGetToolsPaginated).toHaveBeenLastCalledWith(
        null,
        2000,
        expect.objectContaining({ category: cat }),
      );
    }
  });
});
