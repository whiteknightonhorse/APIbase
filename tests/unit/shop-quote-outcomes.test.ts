/**
 * T-0826 (SOUKBASE-QUOTES-1113 ruling-1): what happened to a quote, read by a partner whose grant has
 * quotes:read. Real Postgres (TEST_DATABASE_URL, disposable).
 */
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { hashApiKey } from '../../src/services/api-key.service';
import { getOrderView } from '../../src/shop/order-payment.service';
import {
  clientFromUserAgent,
  clientToken,
  createQuoteRecorded,
  recordPayOutcome,
} from '../../src/shop/quote-outcomes.service';
import { createPartnerRouter } from '../../src/shop/routes/partner.router';
import type { Partner } from '../../src/shop/routes/integrator.router';
import type { ShopDeps } from '../../src/shop/merchant-lifecycle.service';
import { client, dbDescribe, migrate, mkMerchant } from './helpers/shop-db';

jest.mock('../../src/config', () => ({ config: { ENCRYPTION_KEY: 'k'.repeat(40) } }));
jest.mock('../../src/config/index', () => ({ config: { ENCRYPTION_KEY: 'k'.repeat(40) } }));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../src/services/moderation-ban.service', () => ({
  checkBan: jest.fn(async () => ({ banned: false, retryAfterSecs: 0 })),
}));

type Row = Record<string, any>;
const PKEY = 'pk_live_' + 'e5'.repeat(16);
const PARTNERS: Partner[] = [
  {
    id: 'soukbase',
    name: 'Soukbase',
    site: 'https://s.example',
    return_url: 'https://s.example/r',
    key_sha256: hashApiKey(PKEY),
    grant_mode: 'partner',
    delivery_webhook_url: 'https://s.example/h',
    delivery_events: ['order.paid'],
  } as Partner,
];

describe('client token (no DB)', () => {
  it('REST user-agent family, browser for Mozilla, at most 40 of [A-Za-z0-9._-], null when absent', () => {
    expect(clientFromUserAgent('python-httpx/0.27')).toBe('python-httpx');
    expect(clientFromUserAgent('Mozilla/5.0 (X11) Chrome/1')).toBe('browser');
    expect(clientFromUserAgent(undefined)).toBeNull();
    expect(clientFromUserAgent(['a'])).toBeNull();
    expect(clientToken('claude ai/1 <x>')).toBe('claudeai1x');
    expect(clientToken('a'.repeat(80))).toHaveLength(40);
    expect(clientToken('   ')).toBeNull();
    expect(clientToken(undefined)).toBeNull();
  });
});

dbDescribe('T-0826 partner read of quote outcomes (DB)', () => {
  const prisma = client();
  const deps: ShopDeps = {
    db: prisma as never,
    transaction: (fn) => prisma.$transaction((tx) => fn(tx as never)),
    redis: { incr: async () => 1, expire: async () => 1 } as never,
  };
  const q = (sql: string, ...v: unknown[]) => prisma.$queryRawUnsafe<Row[]>(sql, ...v);
  const x = (sql: string, ...v: unknown[]) => prisma.$executeRawUnsafe(sql, ...v);
  let server: Server;
  let base = '';
  let n = 0;
  const tag = () => `${Date.now().toString(36)}o${n++}`;
  const PAYOUT = '0x00000000000000000000000000000000000b0b0b';

  beforeAll(async () => {
    migrate();
    const app = express();
    app.use(createPartnerRouter({ partners: () => PARTNERS, deps: deps as never }));
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server.close();
    await prisma.$disconnect();
  });

  async function shop(
    scopes: string[] | 'none' | 'revoked' = ['catalog:write', 'webhooks:write', 'quotes:read'],
  ) {
    const id = await mkMerchant(prisma, tag());
    await x(
      `UPDATE shop_merchants SET status = 'active', payout_wallet_base = $2 WHERE merchant_id = $1::uuid`,
      id,
      PAYOUT,
    );
    if (scopes !== 'none') {
      await x(
        `INSERT INTO shop_partner_grants (merchant_id, partner_id, key_hash, scopes, mode, revoked_at)
         VALUES ($1::uuid, 'soukbase', NULL, $2::text[], 'partner', ${scopes === 'revoked' ? 'now()' : 'NULL'})`,
        id,
        scopes === 'revoked' ? ['catalog:write', 'webhooks:write', 'quotes:read'] : scopes,
      );
    }
    const slug = (await q(`SELECT slug FROM shop_merchants WHERE merchant_id = $1::uuid`, id))[0]
      .slug as string;
    return { id, slug };
  }
  async function quote(
    merchant_id: string,
    o: { status?: string; createdAt?: string; expiresInS?: number; sku?: string; id?: string } = {},
  ) {
    const id = o.id ?? randomUUID();
    await x(
      `INSERT INTO shop_quotes (quote_id, merchant_id, buyer_identity, items, subtotal, total_usd, expires_at, status, created_at)
       VALUES ($1::uuid, $2::uuid, 'agent:secret-buyer', $3::jsonb, 5, 5, now() + ($4::int * interval '1 second'), $5,
               coalesce($6::timestamptz, now()))`,
      id,
      merchant_id,
      JSON.stringify([
        {
          sku: o.sku ?? 'sku-a',
          title: 'SECRET TITLE',
          qty: 2,
          unit_price_usd: 2.5,
          line_total_usd: 5,
        },
      ]),
      o.expiresInS ?? 600,
      o.status ?? 'open',
      o.createdAt ?? null,
    );
    return id;
  }
  const get = (slug: string, path: string, key = PKEY) =>
    fetch(`${base}/api/v1/shop/partners/merchants/${slug}/${path}`, {
      headers: { authorization: `Bearer ${key}` },
    });
  const keysAndValues = (v: unknown, out: string[] = []): string[] => {
    if (Array.isArray(v)) v.forEach((e) => keysAndValues(e, out));
    else if (v && typeof v === 'object')
      for (const [k, e] of Object.entries(v)) {
        out.push(k);
        keysAndValues(e, out);
      }
    else out.push(String(v));
    return out;
  };

  it('authorisation: scope missing 403 grant_scope_missing; no grant 403; revoked 403; unknown key 401; no cross-shop read', async () => {
    const old = await shop(['catalog:write', 'webhooks:write']);
    const r = await get(old.slug, 'quotes');
    expect(r.status).toBe(403);
    const b = (await r.json()) as Row;
    expect(b).toMatchObject({
      error_code: 'grant_scope_missing',
      scope: 'quotes:read',
      documentation_url: '/integrator/docs#partner-mode',
    });
    expect(b.message).toBe(
      `${old.slug} allowed Soukbase before quote outcomes were part of the permission; send the seller a grant link`,
    );
    expect((await get(old.slug, 'quote-refusals')).status).toBe(403);
    const none = await shop('none');
    expect(((await (await get(none.slug, 'quotes')).json()) as Row).error_code).toBe(
      'grant_missing',
    );
    const rev = await shop('revoked');
    expect(((await (await get(rev.slug, 'quotes')).json()) as Row).error_code).toBe(
      'grant_revoked',
    );
    expect((await get(old.slug, 'quotes', 'pk_live_' + '00'.repeat(16))).status).toBe(401);
    expect((await get('no-such-shop', 'quotes')).status).toBe(404);
  });

  it('reads in order, pages with next_updated_after and never ends a page inside a tie', async () => {
    const s = await shop();
    const T = '2026-11-01T10:00:00.000000Z';
    const ids = [
      await quote(s.id, { createdAt: T }),
      await quote(s.id, { createdAt: T }),
      await quote(s.id, { createdAt: T }),
    ];
    const later = await quote(s.id, { createdAt: '2026-11-01T10:00:05.123456Z' });
    const early = await quote(s.id, { createdAt: '2026-11-01T09:00:00.000000Z' });
    const tied = [...ids].sort();
    const p1 = (await (await get(s.slug, 'quotes?limit=2')).json()) as Row;
    // early, then the tie group runs past limit 2? limit 2 = early + first of the tie, so the whole tie is included
    expect(p1.quotes.map((r: Row) => r.quote_id)).toEqual([early, ...tied]);
    expect(p1.next_updated_after).toBe('2026-11-01T10:00:00.000000Z');
    const p2 = (await (
      await get(s.slug, `quotes?limit=2&updated_after=${encodeURIComponent(p1.next_updated_after)}`)
    ).json()) as Row;
    expect(p2.quotes.map((r: Row) => r.quote_id)).toEqual([later]);
    expect(p2.next_updated_after).toBeNull();
    const all = (await (await get(s.slug, 'quotes')).json()) as Row;
    expect(all.quotes).toHaveLength(5);
    expect(all.next_updated_after).toBeNull();
    expect(all.quotes[4].updated_at).toBe('2026-11-01T10:00:05.123456Z');
    // exclusive: the cursor of the last row returns nothing
    const none = (await (
      await get(s.slug, `quotes?updated_after=${encodeURIComponent('2026-11-01T10:00:05.123456Z')}`)
    ).json()) as Row;
    expect(none.quotes).toEqual([]);
  });

  it('validation: updated_after / limit invalid is 422 validation_failed (arrays included)', async () => {
    const s = await shop();
    for (const qs of [
      'updated_after=yesterday',
      'updated_after=a&updated_after=b',
      'limit=0',
      'limit=201',
      'limit=x',
      'limit=1&limit=2',
      'limit[a]=1',
    ]) {
      const r = await get(s.slug, `quotes?${qs}`);
      expect(r.status).toBe(422);
      expect(((await r.json()) as Row).error_code).toBe('validation_failed');
    }
    expect((await get(s.slug, 'quote-refusals?after=nope')).status).toBe(422);
    expect((await get(s.slug, 'quote-refusals?limit=500')).status).toBe(422);
  });

  it('a calendar-invalid cursor (2026-02-31) is 422, not 500, on both routes', async () => {
    const s = await shop();
    for (const bad of ['2026-02-31T00:00:00Z', '2026-04-31T00:00:00Z', '2026-13-01T00:00:00Z']) {
      expect((await get(s.slug, `quotes?updated_after=${bad}`)).status).toBe(422);
      expect((await get(s.slug, `quote-refusals?after=${bad}`)).status).toBe(422);
    }
    expect((await get(s.slug, 'quotes?updated_after=2028-02-29T00:00:00Z')).status).toBe(200);
  });

  it('two 402 answers and no payment: challenges 2, pay_attempts 0, state expired once expires_at passed while status is open', async () => {
    const s = await shop();
    const id = await quote(s.id, { expiresInS: -60 });
    await recordPayOutcome(prisma as never, id, {
      presented: false,
      status: 402,
      error_code: 'payment_required',
    });
    await recordPayOutcome(prisma as never, id, {
      presented: false,
      status: 402,
      error_code: 'payment_required',
    });
    const row = (((await (await get(s.slug, 'quotes')).json()) as Row).quotes as Row[]).find(
      (r) => r.quote_id === id,
    )!;
    expect(row).toMatchObject({
      challenges: 2,
      pay_attempts: 0,
      last_error_code: null,
      state: 'expired',
      paid_at: null,
      rail: null,
      order_state: null,
      order_id: null,
      is_test: false,
    });
    expect(row.updated_at >= row.expires_at).toBe(true); // the outcome write is later than expiry
    expect(row.items).toEqual([{ sku: 'sku-a', qty: 2 }]);
    expect(row.total_usd).toMatch(/^5(\.0+)?$/);
  });

  it('an open quote past expires_at with no outcome row: updated_at is expires_at, state expired, counters null', async () => {
    const s = await shop();
    const id = await quote(s.id, { expiresInS: -120, createdAt: '2026-01-01T00:00:00Z' });
    const row = (((await (await get(s.slug, 'quotes')).json()) as Row).quotes as Row[]).find(
      (r) => r.quote_id === id,
    )!;
    expect(row).toMatchObject({ state: 'expired', challenges: null, pay_attempts: null });
    expect(row.updated_at).toBe(row.expires_at);
  });

  it('a refused payment: pay_attempts 1 and last_error_code; already_placed (200, nothing presented) records nothing', async () => {
    const s = await shop();
    const id = await quote(s.id);
    await recordPayOutcome(prisma as never, id, {
      presented: true,
      status: 402,
      error_code: 'payment_amount_mismatch',
    });
    await recordPayOutcome(prisma as never, id, { presented: false, status: 200 });
    await recordPayOutcome(prisma as never, id, { presented: true, status: 200 });
    const row = (((await (await get(s.slug, 'quotes')).json()) as Row).quotes as Row[])[0];
    expect(row).toMatchObject({
      pay_attempts: 2,
      challenges: 0,
      last_error_code: 'payment_amount_mismatch',
      state: 'open',
    });
    expect(typeof row.last_error_at).toBe('string');
  });

  it('a paid quote shows paid_at, rail, order_state; read_at is set by the buyer GET only, never by a merchant or partner read', async () => {
    const s = await shop();
    const id = await quote(s.id, { status: 'paid' });
    const order = (
      await q(
        `INSERT INTO shop_orders (quote_id, merchant_id, state, total_usd, rail, settled_at, payer_wallet, tx_hash)
         VALUES ($1::uuid, $2::uuid, 'PAID', 5, 'tempo', now(), '0xpayer', '0xtx') RETURNING order_id`,
        id,
        s.id,
      )
    )[0].order_id as string;
    const read = async () =>
      (((await (await get(s.slug, 'quotes')).json()) as Row).quotes as Row[])[0];
    let row = await read();
    expect(row).toMatchObject({
      state: 'paid',
      rail: 'tempo',
      order_state: 'PAID',
      order_id: order,
      read_at: null,
      challenges: null,
      pay_attempts: null,
      last_error_code: null,
      last_error_at: null,
      client: null,
    });
    expect(typeof row.paid_at).toBe('string');
    await getOrderView(prisma as never, order, 'agent:somebody-else'); // public view
    await getOrderView(prisma as never, order, 'ip:1.2.3.4');
    expect((await read()).read_at).toBeNull();
    await getOrderView(prisma as never, order, 'agent:secret-buyer'); // the buyer
    row = await read();
    expect(typeof row.read_at).toBe('string');
    const first = row.read_at;
    await getOrderView(prisma as never, order, 'agent:secret-buyer');
    expect((await read()).read_at).toBe(first); // set once
  });

  it('a buyer reading an order that is still QUOTED/PAYING does not set read_at', async () => {
    const s = await shop();
    const id = await quote(s.id);
    const order = (
      await q(
        `INSERT INTO shop_orders (quote_id, merchant_id, state, total_usd) VALUES ($1::uuid, $2::uuid, 'PAYING', 5) RETURNING order_id`,
        id,
        s.id,
      )
    )[0].order_id as string;
    await getOrderView(prisma as never, order, 'agent:secret-buyer');
    expect(await q(`SELECT 1 FROM shop_quote_outcomes WHERE quote_id = $1::uuid`, id)).toHaveLength(
      0,
    );
  });

  it('createQuoteRecorded stores the outcome row with client; a refused quote lands in quote-refusals; unknown shop stores nothing', async () => {
    const s = await shop();
    await x(
      `INSERT INTO shop_products (moderation_status, merchant_id, sku, title, price_usd, available, category, fulfillment_mode)
       VALUES ('ok', $1::uuid, 'sku-live', 'T', 5, 10, 'books', 'instant')`,
      s.id,
    );
    const ok = await createQuoteRecorded(
      deps,
      s.id,
      { identity: `agent:${tag()}` },
      { items: [{ sku: 'sku-live', qty: 1 }] },
      'python-httpx',
    );
    await expect(
      createQuoteRecorded(
        deps,
        s.id,
        { identity: `agent:${tag()}` },
        {
          items: [
            { sku: 'nope-1', qty: 1 },
            { sku: 'x'.repeat(100), qty: 1 },
          ],
        },
        null,
      ),
    ).rejects.toMatchObject({ status: 404 });
    const rows = (
      await q(`SELECT * FROM shop_quote_outcomes WHERE quote_id = $1::uuid`, ok.quote_id)
    )[0];
    expect(rows).toMatchObject({
      client: 'python-httpx',
      challenges: 0,
      pay_attempts: 0,
      read_at: null,
    });
    const ref = (await (await get(s.slug, 'quote-refusals')).json()) as Row;
    expect(ref.refusals).toHaveLength(1);
    expect(ref.refusals[0]).toMatchObject({
      error_code: 'not_found',
      skus: ['nope-1', 'x'.repeat(64)],
    });
    expect(ref.next_after).toBeNull();
    const listed = (((await (await get(s.slug, 'quotes')).json()) as Row).quotes as Row[]).find(
      (r) => r.quote_id === ok.quote_id,
    )!;
    expect(listed).toMatchObject({ client: 'python-httpx', challenges: 0, pay_attempts: 0 });
  });

  it('refusals: ordered by at then id, 90-day window, a page never ends inside a tie', async () => {
    const s = await shop();
    const at = (iso: string, code: string) =>
      x(
        `INSERT INTO shop_quote_refusals (at, merchant_id, error_code, skus) VALUES ($1::timestamptz, $2::uuid, $3, ARRAY['a'])`,
        iso,
        s.id,
        code,
      );
    await at('2026-11-01T10:00:00.000000Z', 'c1');
    await at('2026-11-01T10:00:00.000000Z', 'c2');
    await at('2026-11-01T10:00:00.000000Z', 'c3');
    await at('2026-11-01T10:00:09.000001Z', 'c4');
    await at(new Date(Date.now() - 100 * 86400_000).toISOString(), 'too-old');
    await x(
      `INSERT INTO shop_quote_refusals (merchant_id, error_code, skus) VALUES ($1::uuid, 'elsewhere', '{}')`,
      (await shop()).id,
    );
    const p1 = (await (await get(s.slug, 'quote-refusals?limit=2')).json()) as Row;
    expect(p1.refusals.map((r: Row) => r.error_code)).toEqual(['c1', 'c2', 'c3']);
    expect(p1.next_after).toBe('2026-11-01T10:00:00.000000Z');
    const p2 = (await (
      await get(s.slug, `quote-refusals?limit=2&after=${encodeURIComponent(p1.next_after)}`)
    ).json()) as Row;
    expect(p2.refusals.map((r: Row) => r.error_code)).toEqual(['c4']);
    expect(p2.next_after).toBeNull();
  });

  it('a recorder that fails leaves the buyer answer unchanged', async () => {
    const s = await shop();
    await x(
      `INSERT INTO shop_products (moderation_status, merchant_id, sku, title, price_usd, available, category, fulfillment_mode)
       VALUES ('ok', $1::uuid, 'sku-live', 'T', 5, 10, 'books', 'instant')`,
      s.id,
    );
    const broken: ShopDeps = {
      ...deps,
      db: {
        $queryRawUnsafe: (sql: string, ...v: unknown[]) => prisma.$queryRawUnsafe(sql, ...v),
        $executeRawUnsafe: (sql: string, ...v: unknown[]) =>
          /shop_quote_(outcomes|refusals)/.test(sql)
            ? Promise.reject(new Error('recorder down'))
            : prisma.$executeRawUnsafe(sql, ...v),
      } as never,
    };
    const ok = await createQuoteRecorded(
      broken,
      s.id,
      { identity: `agent:${tag()}` },
      { items: [{ sku: 'sku-live', qty: 1 }] },
      'c',
    );
    expect(ok.quote_id).toMatch(/^[0-9a-f-]{36}$/);
    await expect(
      createQuoteRecorded(
        broken,
        s.id,
        { identity: `agent:${tag()}` },
        { items: [{ sku: 'missing', qty: 1 }] },
        'c',
      ),
    ).rejects.toMatchObject({ status: 404, error_code: 'not_found' });
    await expect(
      recordPayOutcome(broken.db, ok.quote_id, { presented: true, status: 402, error_code: 'x' }),
    ).resolves.toBeUndefined();
  });

  it('a deep scan of both answers finds none of the private fields', async () => {
    const s = await shop();
    const id = await quote(s.id, { status: 'paid' });
    await x(
      `INSERT INTO shop_orders (quote_id, merchant_id, state, total_usd, rail, settled_at, payer_wallet, tx_hash, fee_usd) VALUES ($1::uuid, $2::uuid, 'PAID', 5, 'base', now(), '0xPAYERWALLET', '0xTXHASH', 0.5)`,
      id,
      s.id,
    );
    await recordPayOutcome(prisma as never, id, {
      presented: true,
      status: 402,
      error_code: 'payment_required',
    });
    await x(
      `INSERT INTO shop_quote_refusals (merchant_id, error_code, skus) VALUES ($1::uuid, 'out_of_stock', ARRAY['sku-a'])`,
      s.id,
    );
    const a = keysAndValues(await (await get(s.slug, 'quotes')).json());
    const b = keysAndValues(await (await get(s.slug, 'quote-refusals')).json());
    const text = [...a, ...b].join('|');
    for (const forbidden of [
      'buyer_token',
      'buyer_identity',
      'payer',
      'tx_hash',
      'title',
      'fee',
      'ip',
      'user_agent',
      'email',
      'signature',
      'secret-buyer',
      'SECRET TITLE',
      '0xPAYERWALLET',
      '0xTXHASH',
    ])
      expect(text).not.toContain(forbidden);
    // the columns of the two new tables hold nothing else
    const cols = (
      await q(
        `SELECT table_name, column_name FROM information_schema.columns WHERE table_name IN ('shop_quote_outcomes','shop_quote_refusals')`,
      )
    )
      .map((r) => `${r.table_name}.${r.column_name}`)
      .sort();
    expect(cols).toEqual(
      [
        'shop_quote_outcomes.challenges',
        'shop_quote_outcomes.client',
        'shop_quote_outcomes.last_error_at',
        'shop_quote_outcomes.last_error_code',
        'shop_quote_outcomes.merchant_id',
        'shop_quote_outcomes.pay_attempts',
        'shop_quote_outcomes.quote_id',
        'shop_quote_outcomes.read_at',
        'shop_quote_outcomes.updated_at',
        'shop_quote_refusals.at',
        'shop_quote_refusals.error_code',
        'shop_quote_refusals.id',
        'shop_quote_refusals.merchant_id',
        'shop_quote_refusals.skus',
      ].sort(),
    );
  });
});
