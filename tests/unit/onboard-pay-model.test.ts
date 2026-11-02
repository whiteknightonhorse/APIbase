/** T-0654: POST /onboard requires pay_model in a closed set and stores it. */
import express from 'express';
import type { AddressInfo } from 'node:net';
import { onboardRouter } from '../../src/routes/onboard.router';
import { createSubmission } from '../../src/services/onboard.service';

jest.mock('../../src/config', () => ({ config: {} }));
jest.mock('../../src/config/index', () => ({ config: {} }));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/services/onboard.service', () => ({
  checkIpRateLimit: jest.fn(async () => ({ allowed: true })),
  createSubmission: jest.fn(async () => ({ submission_id: 'sub_test' })),
}));

let server: ReturnType<express.Express['listen']>;
let base: string;
beforeAll(() => {
  const app = express();
  app.use(express.json());
  app.use(onboardRouter);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const valid = {
  company_name: 'Example Co',
  api_url: 'https://api.example.com',
  contact_email: 'a@example.com',
  category: 'other',
  description: 'An API',
};
const post = (body: unknown) =>
  fetch(`${base}/onboard`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('T-0654 pay_model', () => {
  it('missing pay_model is rejected', async () => {
    expect((await post(valid)).status).toBe(422);
  });
  it.each(['bogus', ['api_key'], { a: 1 }, 5])('invalid pay_model %p is rejected', async (v) => {
    const r = await post({ ...valid, pay_model: v });
    expect(r.status).toBe(422);
  });
  it.each(['api_key', 'x402_upstream'])('valid pay_model %s is stored', async (v) => {
    const r = await post({ ...valid, pay_model: v });
    expect(r.status).toBe(200);
    expect(createSubmission).toHaveBeenLastCalledWith(
      expect.objectContaining({ pay_model: v }),
      expect.any(String),
    );
  });
  it('the form carries both radio values', async () => {
    const html = await (
      await fetch(`${base}/onboard`, { headers: { accept: 'text/html' } })
    ).text();
    expect(html).toContain('name="pay_model" value="api_key"');
    expect(html).toContain('name="pay_model" value="x402_upstream"');
  });
});
