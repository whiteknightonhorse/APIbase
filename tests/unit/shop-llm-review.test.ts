/**
 * T-INT-33 LR1-LR3 + LR6: layer-3 (LLM) catalog review routes. Real Postgres (TEST_DATABASE_URL,
 * disposable). No model is called anywhere: the verdict arrives as a POST body.
 */
import { execFileSync } from 'node:child_process';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { parseVerdict } from '../../src/shop/moderation/llm-review.service';
import { createModerationInternalRouter } from '../../src/shop/routes/moderation-internal.router';
import type { ShopDeps } from '../../src/shop/merchant-lifecycle.service';
import { client, dbDescribe, migrate, mkMerchant, mkProduct } from './helpers/shop-db';

jest.mock('../../src/config', () => ({ config: { ENCRYPTION_KEY: 'k'.repeat(40) } }));

const KEY = 'orchestra-test-service-key';
const HASH = 'a'.repeat(64);

describe('verdict grammar (no DB)', () => {
  it('accepts ok / flag:<slug> / reject:<slug> only', () => {
    expect(parseVerdict('ok')).toEqual({ verdict: 'ok', category: null });
    expect(parseVerdict('flag:gambling')).toEqual({ verdict: 'flag', category: 'gambling' });
    expect(parseVerdict('reject:weapons')).toEqual({ verdict: 'reject', category: 'weapons' });
    for (const bad of [
      'maybe',
      'flag',
      'flag:',
      'flag:books',
      'reject:nonsense',
      'OK',
      'ok\n',
      7,
      null,
    ]) {
      expect(parseVerdict(bad)).toBeNull();
    }
  });
});

describe('LR6 the review prompt stays out of the public repository', () => {
  it('git ls-files has no merchant-review path', () => {
    const files = execFileSync('git', ['ls-files'], { cwd: __dirname }).toString();
    expect(files.split('\n').filter((f) => /merchant-review/.test(f))).toEqual([]);
  });
});

dbDescribe('shop llm review routes', () => {
  const prisma = client();
  const deps: ShopDeps = {
    db: prisma as never,
    transaction: (fn) => prisma.$transaction((tx) => fn(tx as never)),
  };
  let server: Server;
  let base: string;

  beforeAll(async () => {
    migrate();
    const app = express();
    app.use(express.json());
    app.use(createModerationInternalRouter({ deps, key: () => KEY }));
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/shop/internal/moderation`;
  });
  afterAll(async () => {
    server.close();
    await prisma.$disconnect();
  });

  const call = (path: string, body?: unknown, key: string | null = KEY) =>
    fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', ...(key ? { 'x-orchestra-key': key } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const reviews = (m: string) =>
    prisma.$queryRawUnsafe<Array<Record<string, any>>>(
      `SELECT scope, layer, verdict, category, evidence_hash FROM shop_moderation_reviews WHERE merchant_id = $1::uuid`,
      m,
    );
  const status = async (m: string) =>
    (
      await prisma.$queryRawUnsafe<Array<{ status: string }>>(
        `SELECT status FROM shop_merchants WHERE merchant_id = $1::uuid`,
        m,
      )
    )[0].status;
  const pendingIds = async () =>
    (
      (await (await call('/pending')).json()) as { merchants: Array<{ merchant_id: string }> }
    ).merchants.map((x) => x.merchant_id);

  it('requires the service key', async () => {
    expect((await call('/pending', undefined, null)).status).toBe(401);
    expect((await call('/pending', undefined, 'wrong-key-wrong-key')).status).toBe(401);
    expect((await call('/result', { verdict: 'ok' }, null)).status).toBe(401);
  });

  it('LR1 verdict "maybe" -> 400 and nothing written', async () => {
    const m = await mkMerchant(prisma);
    for (const verdict of ['maybe', 'reject:nonsense', 'flag:books', '']) {
      expect((await call('/result', { merchant_id: m, verdict })).status).toBe(400);
    }
    expect(await reviews(m)).toEqual([]);
  });

  it('LR1 flag:gambling -> one llm row; the merchant is untouched', async () => {
    const m = await mkMerchant(prisma);
    const r = await call('/result', {
      merchant_id: m,
      verdict: 'flag:gambling',
      evidence_hash: HASH,
    });
    expect(r.status).toBe(200);
    expect(await reviews(m)).toEqual([
      {
        scope: 'merchant',
        layer: 'llm',
        verdict: 'flag',
        category: 'gambling',
        evidence_hash: HASH,
      },
    ]);
    expect(await status(m)).toBe('pending');
  });

  it('LR1 reject:weapons (merchant) -> suspended; (product) -> product rejected only', async () => {
    const m = await mkMerchant(prisma);
    await prisma.$executeRawUnsafe(
      `UPDATE shop_merchants SET status = 'active' WHERE merchant_id = $1::uuid`,
      m,
    );
    const p = await mkProduct(prisma, m);
    expect(
      (await call('/result', { merchant_id: m, product_id: p, verdict: 'reject:weapons' })).status,
    ).toBe(200);
    expect(await status(m)).toBe('active');
    const [{ moderation_status }] = await prisma.$queryRawUnsafe<
      Array<{ moderation_status: string }>
    >(`SELECT moderation_status FROM shop_products WHERE product_id = $1::uuid`, p);
    expect(moderation_status).toBe('rejected');
    expect((await call('/result', { merchant_id: m, verdict: 'reject:weapons' })).status).toBe(200);
    expect(await status(m)).toBe('suspended');
    const rows = await reviews(m);
    expect(rows.map((x) => [x.scope, x.layer, x.verdict, x.category])).toEqual([
      ['product', 'llm', 'reject', 'weapons'],
      ['merchant', 'llm', 'reject', 'weapons'],
    ]);
  });

  it('LR1 unknown merchant -> 404', async () => {
    const r = await call('/result', {
      merchant_id: '00000000-0000-4000-8000-000000000000',
      verdict: 'ok',
    });
    expect(r.status).toBe(404);
  });

  it('LR2 pending omits merchants with an llm review under 24 h old', async () => {
    const fresh = await mkMerchant(prisma);
    const stale = await mkMerchant(prisma);
    const unreviewed = await mkMerchant(prisma);
    await call('/result', { merchant_id: fresh, verdict: 'ok' });
    await prisma.$executeRawUnsafe(
      `UPDATE shop_merchants SET created_at = now() - interval '3 days' WHERE merchant_id = $1::uuid`,
      stale,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO shop_moderation_reviews (merchant_id, scope, layer, verdict, at)
       VALUES ($1::uuid, 'merchant', 'llm', 'ok', now() - interval '30 hours')`,
      stale,
    );
    const ids = await pendingIds();
    expect(ids).toContain(unreviewed);
    expect(ids).not.toContain(fresh);
    expect(ids).not.toContain(stale); // reviewed after its last change: nothing new to look at
    await mkProduct(prisma, stale); // catalog changed after the 30 h old review
    expect(await pendingIds()).toContain(stale);
  });

  it('LR3 no llm review: register-state stays; the merchant row does not depend on layer 3', async () => {
    const m = await mkMerchant(prisma);
    await prisma.$executeRawUnsafe(
      `UPDATE shop_merchants SET status = 'active' WHERE merchant_id = $1::uuid`,
      m,
    );
    expect(await reviews(m)).toEqual([]);
    expect(await status(m)).toBe('active');
    // and with the routes closed (no key configured) nothing about the merchant changes
    const closed = express();
    closed.use(createModerationInternalRouter({ deps, key: () => undefined }));
    const s = closed.listen(0);
    const res = await fetch(
      `http://127.0.0.1:${(s.address() as AddressInfo).port}/api/v1/shop/internal/moderation/pending`,
      { headers: { 'x-orchestra-key': KEY } },
    );
    s.close();
    expect(res.status).toBe(503);
    expect(await status(m)).toBe('active');
  });
});
