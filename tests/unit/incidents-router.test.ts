/**
 * AP-9 (818-autopilot-score-dashboard-api.md, L1): GET /api/v1/incidents and
 * GET /api/v1/incidents/:id — read-only, public, no auth. Same pattern as
 * tools-catalog-fail-closed.test.ts (real router handlers off `.stack`,
 * service layer mocked).
 *
 * Covers: filter validation (invalid state/severity -> 400, never a crash),
 * the 404 paths (missing id, malformed/non-UUID id), the 200 paths, and —
 * the L1 boundary this whole task exists to enforce — that the public
 * projection (incidents.service.ts's PUBLIC_SELECT) never asks Prisma to
 * select `evidence`.
 */

jest.mock('../../src/services/prisma.service', () => ({
  getPrisma: jest.fn(),
}));

import { incidentsRouter } from '../../src/routes/incidents.router';
import { getPrisma } from '../../src/services/prisma.service';
import { AppError, ErrorCode } from '../../src/types/errors';
import type { Request, Response, NextFunction } from 'express';

const mockGetPrisma = getPrisma as jest.Mock;
const mockFindMany = jest.fn();
const mockFindUnique = jest.fn();

function getHandler(path: string): (req: Request, res: Response, next: NextFunction) => unknown {
  const layer = (
    incidentsRouter as unknown as {
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

function mockReq(query: Record<string, string> = {}, params: Record<string, string> = {}): Request {
  return { query, params } as unknown as Request;
}

function mockRes(): Response {
  const res: Partial<Response> = {};
  res.setHeader = jest.fn().mockReturnValue(res);
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

const REAL_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const REAL_ROW = {
  incident_id: REAL_ID,
  dedup_key: 'AUTH_FAILED:openweathermap',
  provider: 'openweathermap',
  tool_id: null,
  kind: 'AUTH_FAILED',
  severity: 'SEV1',
  state: 'WAITING_HUMAN',
  detected_by: 'probe',
  attempts: [],
  fleet_task_id: null,
  operator_file: '/home/apibase/autopilot/operator/INC-a1b2c3.md',
  next_recheck_at: null,
  created_at: new Date('2026-09-03T06:40:00Z'),
  updated_at: new Date('2026-09-03T06:40:00Z'),
  resolved_at: null,
};

beforeEach(() => {
  mockFindMany.mockReset();
  mockFindUnique.mockReset();
  mockGetPrisma.mockReturnValue({
    incident: { findMany: mockFindMany, findUnique: mockFindUnique },
  });
});

describe('GET /api/v1/incidents', () => {
  it('invalid state -> 400, never a crash, never reaches Prisma', async () => {
    const res = mockRes();
    const next = jest.fn();
    await getHandler('/api/v1/incidents')(mockReq({ state: 'NOT_A_STATE' }), res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const err = next.mock.calls[0][0] as AppError;
    expect(err.code).toBe(ErrorCode.BAD_REQUEST);
    expect(err.httpStatus).toBe(400);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('invalid severity -> 400, never a crash, never reaches Prisma', async () => {
    const res = mockRes();
    const next = jest.fn();
    await getHandler('/api/v1/incidents')(mockReq({ severity: 'SEV9' }), res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const err = next.mock.calls[0][0] as AppError;
    expect(err.code).toBe(ErrorCode.BAD_REQUEST);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('valid filters -> 200 with the filtered list, evidence NEVER selected (L1)', async () => {
    mockFindMany.mockResolvedValue([REAL_ROW]);
    const res = mockRes();
    const next = jest.fn();
    await getHandler('/api/v1/incidents')(
      mockReq({ state: 'WAITING_HUMAN', severity: 'SEV1', provider: 'openweathermap' }),
      res,
      next,
    );

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ incidents: [REAL_ROW], count: 1 });

    expect(mockFindMany).toHaveBeenCalledTimes(1);
    const call = mockFindMany.mock.calls[0][0];
    expect(call.where).toEqual({
      state: 'WAITING_HUMAN',
      severity: 'SEV1',
      provider: 'openweathermap',
    });
    // L1: "без evidence-цитат писем" — the select clause itself must never
    // ask for `evidence`, not just "the response happens not to show it".
    expect(call.select).not.toHaveProperty('evidence');
    expect(call.select.incident_id).toBe(true);
  });

  it('no filters -> 200 with an empty list when nothing matches (not a 404/500)', async () => {
    mockFindMany.mockResolvedValue([]);
    const res = mockRes();
    const next = jest.fn();
    await getHandler('/api/v1/incidents')(mockReq(), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ incidents: [], count: 0 });
  });
});

describe('GET /api/v1/incidents/:id', () => {
  it('malformed (non-UUID) id -> 404, never crashes, never reaches Prisma', async () => {
    const res = mockRes();
    const next = jest.fn();
    await getHandler('/api/v1/incidents/:id')(mockReq({}, { id: 'x' }), res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const err = next.mock.calls[0][0] as AppError;
    expect(err.code).toBe(ErrorCode.NOT_FOUND);
    expect(err.httpStatus).toBe(404);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it('well-formed id NOT in the DB -> 404', async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = mockRes();
    const next = jest.fn();
    await getHandler('/api/v1/incidents/:id')(mockReq({}, { id: REAL_ID }), res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const err = next.mock.calls[0][0] as AppError;
    expect(err.code).toBe(ErrorCode.NOT_FOUND);
  });

  it('CONTROL: existing incident -> 200 with data, evidence never selected', async () => {
    mockFindUnique.mockResolvedValue(REAL_ROW);
    const res = mockRes();
    const next = jest.fn();
    await getHandler('/api/v1/incidents/:id')(mockReq({}, { id: REAL_ID }), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(REAL_ROW);

    const call = mockFindUnique.mock.calls[0][0];
    expect(call.where).toEqual({ incident_id: REAL_ID });
    expect(call.select).not.toHaveProperty('evidence');
  });
});
