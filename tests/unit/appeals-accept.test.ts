/** T-0380: GET /appeals/:appealId is HTML unless the client names application/json without text/html. */
import express from 'express';
import type { AddressInfo } from 'node:net';
import { appealsRouter } from '../../src/routes/appeals.router';
import { getAppeal } from '../../src/services/appeal.service';

jest.mock('../../src/config', () => ({ config: {} }));
jest.mock('../../src/config/index', () => ({ config: {} }));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/services/appeal.service', () => ({
  getAppeal: jest.fn(),
  submitAppeal: jest.fn(),
  checkAppealSubmitRateLimit: jest.fn(),
  isValidAppealId: (id: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
}));

const OK_ID = '11111111-1111-4111-8111-111111111111';
const MISSING_ID = '00000000-0000-4000-8000-000000000000';
const appeal = {
  appeal_id: OK_ID,
  tool_id: 'demo.tool',
  rule_id: 'rule-1',
  category: 'hate',
  status: 'OPEN',
  created_at: new Date('2026-10-01T00:00:00Z'),
  response_due_at: new Date('2026-10-04T00:00:00Z'),
  resolved_at: null,
  resolution_note: null,
  contact_email: null,
  message: null,
  matched_field: null,
  matched_content: null,
  content_truncated: false,
  match_start: null,
  match_end: null,
  content_expires_at: new Date('2026-11-01T00:00:00Z'),
};

let server: ReturnType<express.Express['listen']>;
let base: string;
beforeAll(() => {
  (getAppeal as jest.Mock).mockImplementation(async (id: string) => (id === OK_ID ? appeal : null));
  const app = express();
  app.use(appealsRouter);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const get = async (path: string, accept: string) => {
  const r = await fetch(`${base}${path}`, { headers: { accept } });
  return { status: r.status, type: r.headers.get('content-type') ?? '', body: await r.text() };
};

describe('T-0380 GET /appeals/:appealId content negotiation', () => {
  it('existing id, Accept json -> JSON appeal', async () => {
    const r = await get(`/appeals/${OK_ID}`, 'application/json');
    expect(r.status).toBe(200);
    expect(r.type).toContain('application/json');
    expect(JSON.parse(r.body)).toMatchObject({ appeal_id: OK_ID, tool_id: 'demo.tool' });
  });
  it('existing id, no Accept -> HTML', async () => {
    const r = await get(`/appeals/${OK_ID}`, '');
    expect(r.status).toBe(200);
    expect(r.type).toContain('text/html');
  });
  it('malformed id, no Accept -> 400 HTML', async () => {
    const r = await get('/appeals/not-a-uuid', '');
    expect(r.status).toBe(400);
    expect(r.type).toContain('text/html');
  });
  it('malformed id, Accept json -> 400 invalid_id JSON', async () => {
    const r = await get('/appeals/not-a-uuid', 'application/json');
    expect(r.status).toBe(400);
    expect(r.type).toContain('application/json');
    expect(JSON.parse(r.body).error).toBe('invalid_id');
  });
  it('unknown id, no Accept -> 404 HTML', async () => {
    const r = await get(`/appeals/${MISSING_ID}`, '');
    expect(r.status).toBe(404);
    expect(r.type).toContain('text/html');
  });
  it('unknown id, Accept json -> 404 not_found JSON', async () => {
    const r = await get(`/appeals/${MISSING_ID}`, 'application/json');
    expect(r.status).toBe(404);
    expect(JSON.parse(r.body).error).toBe('not_found');
  });
  it('/api/v1 path stays JSON without Accept', async () => {
    const r = await get(`/api/v1/appeals/${MISSING_ID}`, '');
    expect(r.status).toBe(404);
    expect(r.type).toContain('application/json');
  });
});
