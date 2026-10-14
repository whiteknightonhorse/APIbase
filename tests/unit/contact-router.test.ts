/** T-SITE-C: POST /api/v1/contact — validation, honeypot, row + outbox event, limiter in the stack. */
import express from 'express';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const contactCreate = jest.fn((args: unknown) => ({ kind: 'contact', args }));
const outboxCreate = jest.fn((args: unknown) => ({ kind: 'outbox', args }));
const transaction = jest.fn(async (ops: unknown[]) => ops);

jest.mock('../../src/services/prisma.service', () => ({
  getPrisma: () => ({
    contactMessage: { create: contactCreate },
    outbox: { create: outboxCreate },
    $transaction: transaction,
  }),
}));

const valid = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  message: 'Hello, this is a test message.',
};

describe('contact router', () => {
  let server: Server;
  let base: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.resetModules(); // fresh in-memory limiter store per test
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { contactRouter } = require('../../src/routes/contact.router');
    const app = express();
    app.use(express.json());
    app.use(contactRouter);
    await new Promise<void>((r) => {
      server = app.listen(0, '127.0.0.1', () => r());
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(() => new Promise<void>((r) => server.close(() => r())));

  const post = (body: unknown) =>
    fetch(`${base}/api/v1/contact`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it.each([
    ['short name', { ...valid, name: 'A' }],
    ['bad email', { ...valid, email: 'nope' }],
    ['short message', { ...valid, message: 'short' }],
    ['long message', { ...valid, message: 'x'.repeat(1501) }],
    ['non-string name', { ...valid, name: ['Ada', 'Bob'] }],
    ['object message', { ...valid, message: { a: 1 } }],
    ['missing fields', {}],
  ])('422 on %s, nothing stored', async (_n, body) => {
    const r = await post(body);
    expect(r.status).toBe(422);
    expect((await r.json()).status).toBe('validation_error');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('honeypot filled: 200 accepted, nothing stored', async () => {
    const r = await post({ ...valid, website: 'http://spam.example' });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.status).toBe('accepted');
    expect(j.message_id).toMatch(/^cm_[0-9a-f]{12}$/);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('happy path: one transaction with row + contact_message outbox event, no PII in payload', async () => {
    const r = await post(valid);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.message_id).toMatch(/^cm_[0-9a-f]{12}$/);
    expect(transaction).toHaveBeenCalledTimes(1);
    const row = contactCreate.mock.calls[0][0] as { data: Record<string, string> };
    expect(row.data).toMatchObject({ message_id: j.message_id, ...valid });
    const ev = outboxCreate.mock.calls[0][0] as { data: { event_type: string; payload: unknown } };
    expect(ev.data.event_type).toBe('contact_message');
    expect(ev.data.payload).toEqual({ message_id: j.message_id, name: valid.name });
  });

  it('500 when the transaction fails', async () => {
    transaction.mockRejectedValueOnce(new Error('db down'));
    const r = await post(valid);
    expect(r.status).toBe(500);
  });

  it('sixth submission from one address is 429', async () => {
    for (let i = 0; i < 5; i++) expect((await post(valid)).status).toBe(200);
    expect((await post(valid)).status).toBe(429);
  });

  it('contactLimiter is literally in the route handler array before the handler', () => {
    const src = readFileSync(join(__dirname, '../../src/routes/contact.router.ts'), 'utf8');
    expect(src).toMatch(/contactRouter\.post\('\/api\/v1\/contact', contactLimiter, async/);
    expect(src).toMatch(/limit: 5,/);
    expect(src).toMatch(/windowMs: 3_600_000/);
  });
});
