/** T-0380: GET /onboard is HTML unless the client names application/json without text/html. */
import express from 'express';
import type { AddressInfo } from 'node:net';
import { onboardRouter } from '../../src/routes/onboard.router';

jest.mock('../../src/config', () => ({ config: {} }));
jest.mock('../../src/config/index', () => ({ config: {} }));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/services/onboard.service', () => ({
  checkIpRateLimit: jest.fn(),
  createSubmission: jest.fn(),
}));

let server: ReturnType<express.Express['listen']>;
let base: string;
beforeAll(() => {
  const app = express();
  app.use(onboardRouter);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const getOnboard = async (headers: Record<string, string>) => {
  const r = await fetch(`${base}/onboard`, { headers });
  return { status: r.status, type: r.headers.get('content-type') ?? '', body: await r.text() };
};

const expectHtml = (r: { status: number; type: string; body: string }) => {
  expect(r.status).toBe(200);
  expect(r.type).toContain('text/html');
  expect(r.body).toContain('<!--site-nav-->');
  expect(r.body).toContain('<meta property="og:image"');
};

describe('T-0380 GET /onboard content negotiation', () => {
  it('a. Accept: application/json -> JSON schema', async () => {
    const r = await getOnboard({ accept: 'application/json' });
    expect(r.status).toBe(200);
    expect(r.type).toContain('application/json');
    const body = JSON.parse(r.body);
    expect(body.endpoint).toBe('POST /onboard');
    expect(body.fields.company_name.required).toBe(true);
  });
  it('b. Accept: text/html -> HTML', async () => {
    expectHtml(await getOnboard({ accept: 'text/html' }));
  });
  it('c. no Accept (curl / wget) -> HTML', async () => {
    expectHtml(await getOnboard({ accept: '' }));
  });
  it('d. Accept */* + TelegramBot -> HTML', async () => {
    expectHtml(await getOnboard({ accept: '*/*', 'user-agent': 'TelegramBot (like TwitterBot)' }));
  });
  it('e. browser Accept -> HTML', async () => {
    expectHtml(
      await getOnboard({
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      }),
    );
  });
  it('f. application/json, text/html -> HTML wins', async () => {
    expectHtml(await getOnboard({ accept: 'application/json, text/html' }));
  });
});
