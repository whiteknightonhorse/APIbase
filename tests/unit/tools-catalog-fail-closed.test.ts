/**
 * Regression test for G-01 (CLAUDE.md §7 — "never return empty tool list
 * silently, 503 instead"). Live reproduction on 2026-08-24 (two controlled
 * `docker compose up -d --force-recreate --no-deps api` runs, 0.2s and 1s
 * polling of GET /api/v1/tools during the restart window) found zero 200
 * responses with an empty catalog — only 502 (connection refused while the
 * container is down) or 200 with the full total. This test pins the
 * application-level guard that makes that the only possible outcome: an
 * empty, unfiltered result set from the tool-registry service must surface
 * as 503, never as 200 with `total: 0`.
 */

jest.mock('../../src/services/tool-registry.service', () => ({
  getPublicCatalog: jest.fn(),
  getToolsPaginated: jest.fn(),
  getToolById: jest.fn(),
}));

import { toolsRouter } from '../../src/routes/tools.router';
import { getPublicCatalog, getToolsPaginated } from '../../src/services/tool-registry.service';
import { AppError, ErrorCode } from '../../src/types/errors';
import type { Request, Response, NextFunction } from 'express';

const mockGetPublicCatalog = getPublicCatalog as jest.Mock;
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
  mockGetPublicCatalog.mockReset();
  mockGetToolsPaginated.mockReset();
});

describe('GET /api/tools — fail-closed on empty catalog', () => {
  it('returns 503, not 200, when the public catalog is empty', async () => {
    mockGetPublicCatalog.mockResolvedValue({
      platform: 'APIbase',
      version: '1.0',
      updated_at: new Date().toISOString(),
      total: 0,
      tools: [],
    });

    const res = mockRes();
    const next = jest.fn();
    await getHandler('/api/tools')(mockReq(), res, next);

    expect(res.status).not.toHaveBeenCalledWith(200);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const err = next.mock.calls[0][0] as AppError;
    expect(err.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
    expect(err.httpStatus).toBe(503);
  });

  it('returns 200 with the full catalog when populated', async () => {
    mockGetPublicCatalog.mockResolvedValue({
      platform: 'APIbase',
      version: '1.0',
      updated_at: new Date().toISOString(),
      total: 1112,
      tools: [{ id: 'abr.abn_lookup' }],
    });

    const res = mockRes();
    const next = jest.fn();
    await getHandler('/api/tools')(mockReq(), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('GET /api/v1/tools — fail-closed on empty catalog', () => {
  it('returns 503, not 200 total:0, on an unfiltered empty result', async () => {
    mockGetToolsPaginated.mockResolvedValue({
      data: [],
      total: 0,
      pagination: { cursor: null, has_more: false, limit: 2000 },
    });

    const res = mockRes();
    const next = jest.fn();
    await getHandler('/api/v1/tools')(mockReq(), res, next);

    expect(res.status).not.toHaveBeenCalledWith(200);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const err = next.mock.calls[0][0] as AppError;
    expect(err.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
    expect(err.httpStatus).toBe(503);
  });

  it('returns 200 with the full total when the catalog is populated', async () => {
    mockGetToolsPaginated.mockResolvedValue({
      data: [{ id: 'abr.abn_lookup' }],
      total: 1112,
      pagination: { cursor: 'YWJyLmFibl9sb29rdXA=', has_more: true, limit: 1 },
    });

    const res = mockRes();
    const next = jest.fn();
    await getHandler('/api/v1/tools')(mockReq({ limit: '1' }), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ total: 1112 }));
  });

  it('does NOT 503 an empty result for a legitimately-filtered query (e.g. no premium-tier tools)', async () => {
    mockGetToolsPaginated.mockResolvedValue({
      data: [],
      total: 0,
      pagination: { cursor: null, has_more: false, limit: 2000 },
    });

    const res = mockRes();
    const next = jest.fn();
    await getHandler('/api/v1/tools')(mockReq({ tier: 'premium' }), res, next);

    // A filtered subset being empty is not "catalog is down" — this is
    // intentionally distinct from the unfiltered case above.
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
