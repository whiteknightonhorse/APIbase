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
import { ENGINE_HEARTBEAT_STALE_S } from '../../src/config/autopilot';
import type { Request, Response, NextFunction } from 'express';

const mockGetPrisma = getPrisma as jest.Mock;
const mockFindMany = jest.fn();
const mockFindUnique = jest.fn();
// T-04: engine heartbeat freshness (autopilot_engine_heartbeat), read
// alongside the incident list on every GET /api/v1/incidents — see
// getEngineHeartbeatStatus in incidents.service.ts.
const mockHeartbeatFindUnique = jest.fn();

function getHandler(path: string): (req: Request, res: Response, next: NextFunction) => unknown {
  const layer = (
    incidentsRouter as unknown as {
      stack: Array<{ route?: { path: string; stack: Array<{ handle: unknown }> } }>;
    }
  ).stack.find((l) => l.route?.path === path);
  if (!layer?.route) throw new Error(`route ${path} not registered`);
  // AP-9 (Fable ruling-3, non-blocking note): the route now has TWO
  // middlewares — the rate limiter, then the real async handler — so the
  // handler under test is the LAST entry in the stack, not stack[0].
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle as (
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

// AP-9 (Fable ruling-3, non-blocking note): the public response must never
// carry the raw absolute path Prisma returns — only its basename. This is
// what the router's response is expected to look like for REAL_ROW.
const EXPECTED_PUBLIC_ROW = { ...REAL_ROW, operator_file: 'INC-a1b2c3.md' };

const FRESH_HEARTBEAT_ROW = { engine: 'incident-engine', last_run_at: new Date() };

beforeEach(() => {
  mockFindMany.mockReset();
  mockFindUnique.mockReset();
  mockHeartbeatFindUnique.mockReset();
  // Default: a fresh heartbeat, so tests that don't care about T-04 keep
  // exercising the pre-existing incidents-list behavior undisturbed.
  mockHeartbeatFindUnique.mockResolvedValue(FRESH_HEARTBEAT_ROW);
  mockGetPrisma.mockReturnValue({
    incident: { findMany: mockFindMany, findUnique: mockFindUnique },
    autopilotEngineHeartbeat: { findUnique: mockHeartbeatFindUnique },
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
    expect(res.json).toHaveBeenCalledWith({
      incidents: [EXPECTED_PUBLIC_ROW],
      count: 1,
      engine_heartbeat_at: FRESH_HEARTBEAT_ROW.last_run_at.toISOString(),
      engine_heartbeat_stale: false,
    });

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

  it('MUTATION CONTROL: operator_file is stripped to its basename, never the raw server path', async () => {
    mockFindMany.mockResolvedValue([REAL_ROW]);
    const res = mockRes();
    const next = jest.fn();
    await getHandler('/api/v1/incidents')(mockReq(), res, next);

    const body = (res.json as jest.Mock).mock.calls[0][0] as {
      incidents: Array<{ operator_file: string }>;
    };
    expect(body.incidents[0].operator_file).toBe('INC-a1b2c3.md');
    expect(body.incidents[0].operator_file).not.toContain('/');
    expect(body.incidents[0].operator_file).not.toContain('/home/apibase');
  });

  it('no filters -> 200 with an empty list when nothing matches (not a 404/500)', async () => {
    mockFindMany.mockResolvedValue([]);
    const res = mockRes();
    const next = jest.fn();
    await getHandler('/api/v1/incidents')(mockReq(), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      incidents: [],
      count: 0,
      engine_heartbeat_at: FRESH_HEARTBEAT_ROW.last_run_at.toISOString(),
      engine_heartbeat_stale: false,
    });
  });

  // T-04 (2026-09-04): the actual incident this closes — zero open incidents
  // read as green "autopilot: OK" whether the engine had been ticking for
  // months or had NEVER RUN (its cron line was never installed). These four
  // cases are the mutational control the task demanded: engine never ran,
  // engine ran but heartbeat is stale, a DB error on the heartbeat read
  // (fails closed, never masquerades as "measured and clean"), and the
  // recovery direction (stale -> fresh flips `stale` back to false) — same
  // "both directions" requirement the brief's "останови/верни" check states.
  describe('T-04: engine_heartbeat_at / engine_heartbeat_stale', () => {
    it('MUTATION: zero open incidents + engine NEVER ran -> stale=true, at=null (must NOT look like OK)', async () => {
      mockFindMany.mockResolvedValue([]);
      mockHeartbeatFindUnique.mockResolvedValue(null);
      const res = mockRes();
      const next = jest.fn();
      await getHandler('/api/v1/incidents')(mockReq(), res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        incidents: [],
        count: 0,
        engine_heartbeat_at: null,
        engine_heartbeat_stale: true,
      });
    });

    it('MUTATION: zero open incidents + heartbeat older than ENGINE_HEARTBEAT_STALE_S -> stale=true', async () => {
      mockFindMany.mockResolvedValue([]);
      const staleAt = new Date(Date.now() - (ENGINE_HEARTBEAT_STALE_S + 60) * 1000);
      mockHeartbeatFindUnique.mockResolvedValue({
        engine: 'incident-engine',
        last_run_at: staleAt,
      });
      const res = mockRes();
      await getHandler('/api/v1/incidents')(mockReq(), res, jest.fn());

      const body = (res.json as jest.Mock).mock.calls[0][0] as {
        engine_heartbeat_stale: boolean;
        engine_heartbeat_at: string;
      };
      expect(body.engine_heartbeat_stale).toBe(true);
      expect(body.engine_heartbeat_at).toBe(staleAt.toISOString());
    });

    it('MUTATION CONTROL: a fresh heartbeat AFTER a stale one flips stale back to false (both directions, not just one)', async () => {
      mockFindMany.mockResolvedValue([]);

      mockHeartbeatFindUnique.mockResolvedValueOnce({
        engine: 'incident-engine',
        last_run_at: new Date(Date.now() - (ENGINE_HEARTBEAT_STALE_S + 60) * 1000),
      });
      const stopped = mockRes();
      await getHandler('/api/v1/incidents')(mockReq(), stopped, jest.fn());
      expect((stopped.json as jest.Mock).mock.calls[0][0].engine_heartbeat_stale).toBe(true);

      mockHeartbeatFindUnique.mockResolvedValueOnce(FRESH_HEARTBEAT_ROW);
      const restarted = mockRes();
      await getHandler('/api/v1/incidents')(mockReq(), restarted, jest.fn());
      expect((restarted.json as jest.Mock).mock.calls[0][0].engine_heartbeat_stale).toBe(false);
    });

    it('a DB error reading the heartbeat table fails CLOSED (stale=true), never crashes the route', async () => {
      mockFindMany.mockResolvedValue([]);
      mockHeartbeatFindUnique.mockRejectedValue(
        new Error('relation "autopilot_engine_heartbeat" does not exist'),
      );
      const res = mockRes();
      const next = jest.fn();
      await getHandler('/api/v1/incidents')(mockReq(), res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      const body = (res.json as jest.Mock).mock.calls[0][0] as { engine_heartbeat_stale: boolean };
      expect(body.engine_heartbeat_stale).toBe(true);
    });
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
    expect(res.json).toHaveBeenCalledWith(EXPECTED_PUBLIC_ROW);

    const call = mockFindUnique.mock.calls[0][0];
    expect(call.where).toEqual({ incident_id: REAL_ID });
    expect(call.select).not.toHaveProperty('evidence');
  });

  it('operator_file is stripped to its basename on the single-incident path too', async () => {
    mockFindUnique.mockResolvedValue(REAL_ROW);
    const res = mockRes();
    const next = jest.fn();
    await getHandler('/api/v1/incidents/:id')(mockReq({}, { id: REAL_ID }), res, next);

    const body = (res.json as jest.Mock).mock.calls[0][0] as { operator_file: string };
    expect(body.operator_file).toBe('INC-a1b2c3.md');
  });

  it('operator_file stays null when the incident has none', async () => {
    mockFindUnique.mockResolvedValue({ ...REAL_ROW, operator_file: null });
    const res = mockRes();
    const next = jest.fn();
    await getHandler('/api/v1/incidents/:id')(mockReq({}, { id: REAL_ID }), res, next);

    const body = (res.json as jest.Mock).mock.calls[0][0] as { operator_file: string | null };
    expect(body.operator_file).toBeNull();
  });
});
