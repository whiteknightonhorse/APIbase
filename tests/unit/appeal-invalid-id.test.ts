/**
 * LIVE BUG on apibase.pro: `GET /api/v1/appeals/x` (and `/appeals/x`) 502'd.
 * Root cause: `getAppeal()` passed the raw path param straight into
 * Prisma's UUID-typed WHERE clause. Prisma's UUID cast THROWS (uncaught) on
 * a malformed string instead of returning null like a normal missed
 * lookup ("Inconsistent column data: Error creating UUID, invalid
 * character... found 'x' at 1") -- an unhandled rejection in an async
 * Express handler with no try/catch, surfacing as a 502 at the edge for
 * ANY malformed appeal_id, on both declared paths.
 *
 * Two-sided control (per the dispatch brief): this file must go RED on the
 * malformed-id cases before the fix (getAppeal/router let the Prisma
 * throw propagate) and GREEN after (guarded, clean 400/404) -- and a
 * genuinely existing appeal must keep returning its data, so the fix
 * cannot "succeed" by breaking the working path instead.
 */

const mockFindUnique = jest.fn();
jest.mock('../../src/services/prisma.service', () => ({
  getPrisma: () => ({ moderationAppeal: { findUnique: mockFindUnique } }),
}));
jest.mock('../../src/services/redis.service', () => ({
  ensureRedisConnected: jest.fn(),
}));
jest.mock('../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

import { getAppeal, isValidAppealId } from '../../src/services/appeal.service';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { appealsRouter } from '../../src/routes/appeals.router';

const REAL_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const REAL_ROW = {
  appeal_id: REAL_ID,
  tool_id: 'twilio.send_sms',
  rule_id: 'terrorism-1',
  category: 'action',
  status: 'OPEN',
  created_at: new Date('2026-08-30T00:00:00Z'),
  response_due_at: new Date('2026-09-02T00:00:00Z'),
  resolved_at: null,
  resolution_note: null,
  contact_email: null,
  message: null,
};

beforeEach(() => {
  mockFindUnique.mockReset();
});

describe('appeal.service.getAppeal — malformed id never reaches Prisma', () => {
  it('isValidAppealId rejects non-UUID strings, accepts UUIDs', () => {
    expect(isValidAppealId('x')).toBe(false);
    expect(isValidAppealId('')).toBe(false);
    expect(isValidAppealId('not-a-uuid-at-all')).toBe(false);
    expect(isValidAppealId(REAL_ID)).toBe(true);
  });

  it('RED/GREEN: does not crash on a malformed id (was: uncaught Prisma UUID cast error -> 502)', async () => {
    // Simulates Prisma's real behavior for a bad UUID cast -- if the fix's
    // guard is ever removed, this rejection propagates and the test fails.
    mockFindUnique.mockRejectedValue(
      new Error(
        "Inconsistent column data: Error creating UUID, invalid character... found 'x' at 1",
      ),
    );
    await expect(getAppeal('x')).resolves.toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it('CONTROL: a well-formed id that IS in the DB still returns the row', async () => {
    mockFindUnique.mockResolvedValue(REAL_ROW);
    const result = await getAppeal(REAL_ID);
    expect(result).toEqual(REAL_ROW);
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { appeal_id: REAL_ID } });
  });

  it('a well-formed id NOT in the DB returns null (the real 404 case, not a crash)', async () => {
    mockFindUnique.mockResolvedValue(null);
    await expect(getAppeal(REAL_ID)).resolves.toBeNull();
  });
});

// --- Router-level: exercises the REAL appealsRouter handlers (both
// declared GET paths), not a reimplementation of them.
function fakeRes() {
  const res: {
    statusCode: number;
    _body: unknown;
    status: (c: number) => typeof res;
    json: (b: unknown) => typeof res;
    type: (t: string) => typeof res;
    send: (b: unknown) => typeof res;
  } = {
    statusCode: 200,
    _body: undefined,
    status(c) {
      res.statusCode = c;
      return res;
    },
    json(b) {
      res._body = b;
      return res;
    },
    type() {
      return res;
    },
    send(b) {
      res._body = b;
      return res;
    },
  };
  return res;
}

function getHandler(path: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layer = (appealsRouter as any).stack.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (l: any) => l.route && l.route.path === path && l.route.methods.get,
  );
  return layer.route.stack[0].handle;
}

describe.each([
  ['/appeals/:appealId', '/appeals/'],
  ['/api/v1/appeals/:appealId', '/api/v1/appeals/'],
])('GET %s — real router handler', (routePath, urlPrefix) => {
  it('malformed id -> 400, never 502/500', async () => {
    mockFindUnique.mockRejectedValue(new Error('would have been an uncaught Prisma throw'));
    const handler = getHandler(routePath);
    const req = { params: { appealId: 'x' }, headers: { accept: 'application/json' } };
    const res = fakeRes();
    await handler(req as never, res as never, (() => {}) as never);
    expect(res.statusCode).toBe(400);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it('well-formed but unknown id -> 404', async () => {
    mockFindUnique.mockResolvedValue(null);
    const handler = getHandler(routePath);
    const req = { params: { appealId: REAL_ID }, headers: { accept: 'application/json' } };
    const res = fakeRes();
    await handler(req as never, res as never, (() => {}) as never);
    expect(res.statusCode).toBe(404);
  });

  it('CONTROL: existing appeal -> 200 with data', async () => {
    mockFindUnique.mockResolvedValue(REAL_ROW);
    const handler = getHandler(routePath);
    const req = { params: { appealId: REAL_ID }, headers: { accept: 'application/json' } };
    const res = fakeRes();
    await handler(req as never, res as never, (() => {}) as never);
    expect(res.statusCode).toBe(200);
    expect(res._body).toMatchObject({ appeal_id: REAL_ID, tool_id: 'twilio.send_sms' });
  });
  void urlPrefix; // documents which live path this maps to
});
