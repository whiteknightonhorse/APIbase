/** T-0771: POST /shop/quotes without merchant/items is 422 naming the fields; unknown merchant is 404 fix_request. */
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createOrderRouter } from '../../src/shop/routes/order.router';
import { merchantIdBySlug } from '../../src/shop/quote.service';
import { registerOrderTools } from '../../src/shop/tools/order.tools';

jest.mock('../../src/config', () => ({ config: { ENCRYPTION_KEY: 'k'.repeat(40) } }));
jest.mock('../../src/shop/buyer', () => ({
  resolveBuyer: jest.fn(async () => ({ identity: 'ip:test' })),
}));
jest.mock('../../src/pipeline/stages/idempotency.stage', () => ({
  idempotencyStage: { execute: jest.fn(async () => ({ ok: true })) },
}));
jest.mock('../../src/services/idempotency.service', () => ({
  clearIdempotency: jest.fn(),
  finalizeIdempotency: jest.fn(),
}));
jest.mock('../../src/shop/quote.service', () => {
  const actual = jest.requireActual('../../src/shop/quote.service');
  return {
    ...actual,
    createQuote: jest.fn(async () => ({ quote_id: 'q1' })),
  };
});

const ITEMS = [{ sku: 'a', qty: 1 }];

describe('POST /api/v1/shop/quotes missing fields', () => {
  let server: Server;
  let base: string;
  const db = { $queryRawUnsafe: jest.fn(async () => []) };

  beforeEach(async () => {
    const app = express();
    app.use(express.json());
    app.use(createOrderRouter({ db } as never));
    await new Promise<void>((r) => {
      server = app.listen(0, '127.0.0.1', () => r());
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(() => new Promise<void>((r) => server.close(() => r())));

  const post = (body: unknown) =>
    fetch(`${base}/api/v1/shop/quotes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it.each([
    ['{}', {}, ['merchant', 'items']],
    ['merchant only', { merchant: 'x-shop' }, ['items']],
    ['items only', { items: ITEMS }, ['merchant']],
    ['merchant not a string', { merchant: 5, items: ITEMS }, ['merchant']],
    ['empty items', { merchant: 'x-shop', items: [] }, ['items']],
  ])('%s -> 422 with missing', async (_n, body, missing) => {
    const r = await post(body);
    expect(r.status).toBe(422);
    const j = await r.json();
    expect(j.error).toBe('validation_failed');
    expect(j.error_code).toBe('validation_failed');
    expect(j.missing).toEqual(missing);
    expect(j.message).toBe(`missing required fields: ${missing.join(', ')}`);
    expect(j.suggested_action).toBe('fix_request');
    expect(j.documentation_url).toBe('/integrator/docs#quotes');
  });

  it('well-formed unknown slug -> 404 merchant not found, fix_request', async () => {
    const r = await post({ merchant: 'nope-shop', items: ITEMS });
    expect(r.status).toBe(404);
    const j = await r.json();
    expect(j.message).toBe('merchant not found');
    expect(j.suggested_action).toBe('fix_request');
    expect(j.documentation_url).toBeTruthy();
  });

  it('valid quote -> 201 unchanged', async () => {
    db.$queryRawUnsafe.mockResolvedValueOnce([{ merchant_id: 'm1' }] as never);
    const r = await post({ merchant: 'good-shop', items: ITEMS });
    expect(r.status).toBe(201);
    expect((await r.json()).quote_id).toBe('q1');
  });

  it('merchantIdBySlug: malformed and unknown slug both fix_request (MCP path)', async () => {
    const bad = { $queryRawUnsafe: jest.fn(async () => []) } as never;
    for (const slug of ['!', 'nope-shop']) {
      await expect(merchantIdBySlug(bad, slug)).rejects.toMatchObject({
        status: 404,
        suggested_action: 'fix_request',
      });
    }
  });

  it('MCP shop.order.quote with an unknown merchant -> fix_request', async () => {
    const handlers = new Map<
      string,
      (a: unknown) => Promise<{ isError?: boolean; content: { text: string }[] }>
    >();
    const fake = {
      registerTool: (name: string, _cfg: unknown, h: never) => handlers.set(name, h),
    };
    const mcpDb = { $queryRawUnsafe: jest.fn(async () => []) };
    registerOrderTools(fake as never, 'key', 'req-1', { db: mcpDb } as never);
    const res = await handlers.get('shop.order.quote')!({ merchant: 'nope-shop', items: ITEMS });
    expect(res.isError).toBe(true);
    const body = JSON.parse(res.content[0].text);
    expect(body.suggested_action).toBe('fix_request');
    expect(body.message).toBe('merchant not found');
  });
});
