/**
 * T-INT-24 ST1-ST5: merchant stats (F-12) and the read-only owner page (F-1), against a real Postgres
 * (TEST_DATABASE_URL, disposable). Orders are placed with SQL; the services and routers are real.
 */
import { createHash, randomUUID } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { issueKey } from '../../src/shop/auth/merchant-key.service';
import { buildSignInMessage, issueNonce } from '../../src/shop/auth/nonce.service';
import type { ShopDeps } from '../../src/shop/merchant-lifecycle.service';
import { createMerchantRouter } from '../../src/shop/routes/merchant.router';
import { createOwnerRouter } from '../../src/shop/routes/owner.router';
import { getMerchantStats } from '../../src/shop/stats.service';
import { client, dbDescribe, migrate, mkMerchant } from './helpers/shop-db';

jest.mock('../../src/config/index', () => ({
  config: { ENCRYPTION_KEY: 'k'.repeat(40), X402_NETWORK: 'base' },
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

type Row = Record<string, any>;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const PAYER = '0x00000000000000000000000000000000000a11ce';

function fakeRedis() {
  const m = new Map<string, string>();
  return {
    m,
    get: async (k: string) => m.get(k) ?? null,
    set: async (k: string, v: string) => (m.set(k, v), 'OK'),
    getdel: async (k: string) => {
      const v = m.get(k) ?? null;
      m.delete(k);
      return v;
    },
    incr: async () => 1,
    expire: async () => 1,
  };
}

dbDescribe('merchant stats and owner page', () => {
  const prisma = client();
  let sqlCalls = 0;
  const counted = {
    $queryRawUnsafe: (q: string, ...v: unknown[]) => (sqlCalls++, prisma.$queryRawUnsafe(q, ...v)),
    $executeRawUnsafe: (q: string, ...v: unknown[]) => prisma.$executeRawUnsafe(q, ...v),
  };
  const redis = fakeRedis();
  const deps: ShopDeps = {
    db: counted as never,
    transaction: (fn) => prisma.$transaction((tx) => fn(tx as never)),
    redis: redis as never,
  };
  let n = 0;
  const tag = () => `${Date.now().toString(36)}s${n++}`;
  const q = (sql: string, ...v: unknown[]) => prisma.$queryRawUnsafe<Row[]>(sql, ...v);
  const x = (sql: string, ...v: unknown[]) => prisma.$executeRawUnsafe(sql, ...v);

  beforeAll(() => migrate());
  afterAll(() => prisma.$disconnect());

  async function merchant(wallet?: string) {
    const m = await mkMerchant(prisma, tag());
    await x(
      `UPDATE shop_merchants SET status = 'active'${wallet ? ', wallet_address = $2' : ''} WHERE merchant_id = $1::uuid`,
      ...(wallet ? [m, wallet.toLowerCase()] : [m]),
    );
    return m;
  }

  /** One paid (or test-SKU) order: quote + order + PAID event with the buyer agent. */
  async function order(m: string, o: { test?: boolean; sku?: string; state?: string } = {}) {
    const sku = o.test ? '__apibase_test' : (o.sku ?? 'a');
    const items = [{ sku, title: sku.toUpperCase(), qty: 1, unit_price_usd: 5, line_total_usd: 5 }];
    const qr = await q(
      `INSERT INTO shop_quotes (merchant_id, items, subtotal, total_usd, expires_at, status, is_test)
       VALUES ($1::uuid, $2::jsonb, 5, 5, now() + interval '1 hour', 'paid', $3) RETURNING quote_id`,
      m,
      JSON.stringify(items),
      !!o.test,
    );
    const or = await q(
      `INSERT INTO shop_orders (quote_id, merchant_id, state, total_usd, fee_usd, payer_wallet, rail,
                                tx_hash, settled_at)
       VALUES ($1::uuid, $2::uuid, $3, 5, 0.1, $4, 'base', $5, now()) RETURNING order_id`,
      qr[0].quote_id,
      m,
      o.state ?? 'PAID',
      PAYER,
      `0x${randomUUID().replace(/-/g, '')}`,
    );
    await x(
      `INSERT INTO shop_order_events (order_id, seq, to_state, actor, payload)
       VALUES ($1::uuid, 1, 'PAID', 'system', $2::jsonb)`,
      or[0].order_id,
      JSON.stringify({
        buyer_agent: {
          client_name: 'test-agent',
          client_version: '1.2',
          user_agent: 'python-httpx/0.27',
          wallet_hash_prefix: sha(PAYER).slice(0, 8),
        },
      }),
    );
    return or[0].order_id as string;
  }

  async function seedTen(m: string) {
    for (let i = 0; i < 9; i++) await order(m);
    await order(m, { test: true });
  }

  it('ST1 10 orders (1 test SKU): orders_paid = 9, the test SKU is excluded everywhere', async () => {
    const m = await merchant();
    await seedTen(m);
    const s = (await getMerchantStats(deps, m, {})) as Row;
    expect(s.funnel.orders_paid).toBe(9);
    expect(s.funnel.quotes).toBe(9);
    expect(Number(s.gross_usd)).toBe(45);
    expect(Number(s.fee_usd)).toBeCloseTo(0.9);
    expect(Number(s.net_usd)).toBeCloseTo(44.1);
    expect(Number(s.avg_order_usd)).toBe(5);
    expect(s.top_products).toHaveLength(1);
    expect(s.top_products[0]).toMatchObject({ sku: 'a', qty: 9 });
    expect(s.by_rail[0]).toMatchObject({ rail: 'base', orders_paid: 9 });
    expect(s.by_agent).toEqual([
      expect.objectContaining({
        client_name: 'test-agent',
        client_version: '1.2',
        ua_family: 'python-httpx',
        wallet_hash_prefix: sha(PAYER).slice(0, 8),
        orders_paid: 9,
      }),
    ]);
    expect(JSON.stringify(s)).not.toContain(PAYER);
    expect(s.series).toHaveLength(1);
    const week = (await getMerchantStats(deps, m, { group: 'week' })) as Row;
    expect(week.group).toBe('week');
  });

  it('ST1b validation: bad range / group / format are 422', async () => {
    const m = await merchant();
    for (const bad of [
      { from: 'nope' },
      { from: '2026-02-01', to: '2026-01-01' },
      { from: '2020-01-01', to: '2026-01-01' },
      { group: 'month' },
      { format: 'xml' },
    ]) {
      await expect(getMerchantStats(deps, m, bad)).rejects.toMatchObject({ status: 422 });
    }
  });

  async function serve(app: express.Express) {
    const server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    const get = (path: string, headers: Record<string, string> = {}) =>
      new Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }>(
        (resolve, reject) => {
          http
            .get({ host: '127.0.0.1', port, path, headers }, (res) => {
              const chunks: Buffer[] = [];
              res.on('data', (c) => chunks.push(c));
              res.on('end', () =>
                resolve({
                  status: res.statusCode ?? 0,
                  body: Buffer.concat(chunks).toString('utf8'),
                  headers: res.headers,
                }),
              );
            })
            .on('error', reject);
        },
      );
    return { get, close: () => (server.closeAllConnections(), server.close()) };
  }

  it('ST2 CSV has tx_hash and only the payer hash prefix; scope stats:read is enforced', async () => {
    const m = await merchant();
    await seedTen(m);
    const key = await issueKey(prisma as never, m, ['stats:read']);
    const noScope = await issueKey(prisma as never, m, ['orders:read']);
    const app = express();
    app.use(createMerchantRouter(deps));
    const s = await serve(app);
    try {
      const r = await s.get('/api/v1/shop/merchants/me/stats?format=csv', {
        authorization: `Bearer ${key}`,
      });
      expect(r.status).toBe(200);
      expect(r.headers['content-type']).toMatch(/text\/csv/);
      const lines = r.body.trim().split('\n');
      expect(lines[0].split(',')).toContain('tx_hash');
      expect(lines).toHaveLength(10); // header + 9 paid orders, test SKU excluded
      const txs = await q(
        `SELECT tx_hash FROM shop_orders o JOIN shop_quotes q USING (quote_id)
          WHERE o.merchant_id = $1::uuid AND NOT q.is_test`,
        m,
      );
      for (const t of txs) expect(r.body).toContain(t.tx_hash);
      expect(r.body).not.toContain(PAYER);
      expect(r.body.toLowerCase()).not.toContain(PAYER.slice(2));
      expect(r.body).toContain(sha(PAYER).slice(0, 8));
      const denied = await s.get('/api/v1/shop/merchants/me/stats', {
        authorization: `Bearer ${noScope}`,
      });
      expect(denied.status).toBe(403);
      const json = await s.get('/api/v1/shop/merchants/me/stats', {
        authorization: `Bearer ${key}`,
      });
      expect(JSON.parse(json.body).funnel.orders_paid).toBe(9);
    } finally {
      s.close();
    }
  });

  it('ST3 two requests within 60 s run the SQL once', async () => {
    const m = await merchant();
    await seedTen(m);
    sqlCalls = 0;
    const a = await getMerchantStats(deps, m, { group: 'day' });
    const first = sqlCalls;
    expect(first).toBeGreaterThan(0);
    const b = await getMerchantStats(deps, m, { group: 'day' });
    expect(sqlCalls).toBe(first);
    expect(b).toEqual(a);
    const ttl = [...redis.m.keys()].filter((k) => k.startsWith(`shop:stats:${m}:`));
    expect(ttl).toHaveLength(1);
    // other parameters are another cache entry
    await getMerchantStats(deps, m, { group: 'week' });
    expect(sqlCalls).toBeGreaterThan(first);
  });

  describe('owner page', () => {
    const acct = privateKeyToAccount(generatePrivateKey());
    const stranger = privateKeyToAccount(generatePrivateKey());
    let slug = '';
    let m = '';

    beforeAll(async () => {
      m = await merchant(acct.address);
      slug = (await q(`SELECT slug FROM shop_merchants WHERE merchant_id = $1::uuid`, m))[0].slug;
      await order(m);
      await x(
        `INSERT INTO shop_fee_ledger (merchant_id, order_id, fee_usd, mode, status)
         SELECT $1::uuid, order_id, 0.1, 'receivable', 'owed' FROM shop_orders WHERE merchant_id = $1::uuid LIMIT 1`,
        m,
      );
    });

    async function signed(who: typeof acct) {
      const nonce = await issueNonce(who.address, redis as never);
      const message = buildSignInMessage({
        address: who.address,
        purpose: 'owner',
        nonce,
        issuedAt: new Date().toISOString(),
      });
      const signature = await who.signMessage({ message });
      return {
        'x-owner-message': Buffer.from(message).toString('base64'),
        'x-owner-signature': signature,
      };
    }

    it('ST4 no signature 401; a stranger wallet 404; the owner gets read-only HTML', async () => {
      const app = express();
      app.use(createOwnerRouter(deps));
      const s = await serve(app);
      try {
        expect((await s.get(`/m/${slug}/owner`)).status).toBe(401);
        expect((await s.get(`/m/${slug}/owner`, await signed(stranger))).status).toBe(404);
        const bad = await signed(acct);
        bad['x-owner-signature'] = (await signed(stranger))['x-owner-signature'];
        expect((await s.get(`/m/${slug}/owner`, bad)).status).toBe(401);

        const ok = await s.get(`/m/${slug}/owner`, await signed(acct));
        expect(ok.status).toBe(200);
        expect(ok.headers['content-type']).toMatch(/html/);
        expect(ok.body).not.toMatch(/<form/i);
        expect(ok.body).not.toMatch(/method="?post/i);
        expect(ok.body).toContain('Owed: 0.100000 USD');
        expect(ok.body).not.toContain(PAYER);
        const cookie = String(ok.headers['set-cookie']?.[0]);
        expect(cookie).toMatch(/HttpOnly/);
        expect(cookie).toMatch(/Max-Age=900/);

        // the cookie alone opens the page again; a replayed signature (nonce used) does not
        const again = await s.get(`/m/${slug}/owner`, { cookie: cookie.split(';')[0] });
        expect(again.status).toBe(200);
        const replay = await signed(acct);
        await s.get(`/m/${slug}/owner`, replay);
        expect((await s.get(`/m/${slug}/owner`, replay)).status).toBe(401);
        expect((await s.get(`/m/no-such-shop/owner`, await signed(acct))).status).toBe(404);
      } finally {
        s.close();
      }
    });
  });

  it('ST5 cross-tenant: stats of A never include the orders of B', async () => {
    const a = await merchant();
    const b = await merchant();
    await order(a);
    await order(a);
    for (let i = 0; i < 5; i++) await order(b, { sku: 'only-b' });
    const sa = (await getMerchantStats(deps, a, {})) as Row;
    const sb = (await getMerchantStats(deps, b, {})) as Row;
    expect(sa.funnel.orders_paid).toBe(2);
    expect(sa.top_products.map((p: Row) => p.sku)).toEqual(['a']);
    expect(sb.funnel.orders_paid).toBe(5);
    const csvA = (await getMerchantStats(deps, a, { format: 'csv' })) as { csv: string };
    expect(csvA.csv.trim().split('\n')).toHaveLength(3);
  });
});
