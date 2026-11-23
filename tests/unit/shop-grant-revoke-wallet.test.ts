/**
 * T-0942 (REQ-AB-R7-1 item 5): a seller stops a partner with one wallet signature (purpose
 * grant_revoke), no merchant key. The message (no DB), then the route against a real Postgres
 * (TEST_DATABASE_URL, disposable): the same revokeGrant and effects as DELETE, 404 not_found without
 * an active grant, 404 merchant_not_found for a wallet without a store, a suspended store may revoke,
 * and the per-address limiter sits in the route's own handler array.
 */
import express from 'express';
import type { AddressInfo } from 'node:net';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { hashApiKey } from '../../src/services/api-key.service';
import { issueKey } from '../../src/shop/auth/merchant-key.service';
import {
  grantRevokeMessage,
  issueNonce,
  verifyGrantRevokeSignature,
} from '../../src/shop/auth/nonce.service';
import type { ShopDeps } from '../../src/shop/merchant-lifecycle.service';
import {
  partners as committedPartners,
  type Partner,
} from '../../src/shop/routes/integrator.router';
import { createMerchantRouter } from '../../src/shop/routes/merchant.router';
import { createPartnerRouter } from '../../src/shop/routes/partner.router';
import { client, dbDescribe, migrate, mkMerchant } from './helpers/shop-db';

const ENC = 'k'.repeat(40);
jest.mock('../../src/config', () => ({ config: { ENCRYPTION_KEY: 'k'.repeat(40) } }));
jest.mock('../../src/config/index', () => ({ config: { ENCRYPTION_KEY: 'k'.repeat(40) } }));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../src/services/moderation-ban.service', () => ({
  checkBan: async () => ({ banned: false, retryAfterSecs: 0 }),
  recordBlock: async () => undefined,
}));

type Row = Record<string, any>;

class FakeRedis {
  m = new Map<string, string>();
  async set(k: string, v: string) {
    this.m.set(k, v);
  }
  async getdel(k: string) {
    const v = this.m.get(k) ?? null;
    this.m.delete(k);
    return v;
  }
  async get() {
    return null;
  }
  async incr() {
    return 1;
  }
  async expire() {
    return 1;
  }
}

const SOUK = { id: 'soukbase', name: 'Soukbase' };

describe('T-0942 grant_revoke message (no DB)', () => {
  const acct = privateKeyToAccount(generatePrivateKey());
  const make = async (
    redis: FakeRedis,
    over: Partial<Parameters<typeof grantRevokeMessage>[0]> = {},
  ) => {
    const nonce = await issueNonce(acct.address, redis as never);
    const message = grantRevokeMessage({
      partnerName: 'Soukbase',
      partnerId: 'soukbase',
      wallet: acct.address,
      nonce,
      issuedAt: new Date().toISOString(),
      ...over,
    });
    return { message, nonce, signature: await acct.signMessage({ message }) };
  };
  const verify = (
    redis: FakeRedis,
    s: { message: string; signature: string },
    addr = acct.address,
  ) =>
    verifyGrantRevokeSignature(
      { ...s, expectedAddress: addr, partner: SOUK },
      { redis: redis as never },
    );

  it('the text is exactly the card text and verifies once (a used nonce is 401)', async () => {
    const redis = new FakeRedis();
    const s = await make(redis, { issuedAt: new Date().toISOString() });
    const lines = s.message.split('\n');
    expect(lines.slice(0, 4)).toEqual([
      'apibase.pro: stop Soukbase acting for your store',
      `Address: ${acct.address}`,
      'Partner: soukbase',
      'Effect: Soukbase can no longer upload your catalog or receive your order events. Your store, payouts and orders stay.',
    ]);
    expect(lines[4]).toBe(`Nonce: ${s.nonce}`);
    expect(lines[5]).toMatch(/^Issued At: \d{4}-\d\d-\d\dT/);
    expect(lines).toHaveLength(6);
    await expect(verify(redis, s)).resolves.toEqual({ signer_kind: 'eoa' });
    await expect(verify(redis, s)).rejects.toMatchObject({ status: 401 });
  });

  it('a changed line, another partner id, another address are 401', async () => {
    const redis = new FakeRedis();
    const edits: Array<(m: string) => string> = [
      (m) => m.replace('Your store, payouts and orders stay.', 'Your store stays.'),
      (m) => m.replace('stop Soukbase', 'stop Someone'),
      (m) => m.replace('Partner: soukbase', 'Partner: otherco'),
    ];
    for (const t of edits) {
      const s = await make(redis);
      const message = t(s.message);
      expect(message).not.toBe(s.message);
      await expect(
        verify(redis, { message, signature: await acct.signMessage({ message }) }),
      ).rejects.toMatchObject({ status: 401 });
    }
    // built for another partner id
    const o = await make(redis, { partnerId: 'otherco' });
    await expect(verify(redis, o)).rejects.toMatchObject({ status: 401 });
    // another address than the one the route is called with
    const s = await make(redis);
    const other = privateKeyToAccount(generatePrivateKey());
    await expect(verify(redis, s, other.address)).rejects.toMatchObject({ status: 401 });
    // signed by another key
    const s2 = await make(redis);
    await expect(
      verify(redis, {
        message: s2.message,
        signature: await other.signMessage({ message: s2.message }),
      }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('the grant text is not accepted as a stop text', async () => {
    const redis = new FakeRedis();
    const s = await make(redis);
    const message = s.message.replace(
      'apibase.pro: stop Soukbase acting for your store',
      'apibase.pro: allow Soukbase to act for your store',
    );
    await expect(
      verify(redis, { message, signature: await acct.signMessage({ message }) }),
    ).rejects.toMatchObject({ status: 401 });
  });
});

describe('T-0942 the route carries its own limiter (CodeQL rule 2)', () => {
  it('the first handler of POST /grants/:partner/revoke is an express-rate-limit middleware', () => {
    const router = createMerchantRouter({} as never) as unknown as {
      stack: Array<{
        route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: any }> };
      }>;
    };
    const layer = router.stack.find(
      (l) =>
        l.route?.path === '/api/v1/shop/merchants/me/grants/:partner/revoke' &&
        l.route.methods.post,
    );
    expect(layer).toBeDefined();
    const handlers = layer!.route!.stack.map((s) => s.handle);
    expect(handlers.length).toBe(2);
    expect(typeof handlers[0].resetKey).toBe('function');
  });
});

const REG = committedPartners().find((p) => p.id === 'soukbase') as Partner;
const PKEY = 'pk_live_' + 'e5'.repeat(16);
const PARTNERS: Partner[] = [{ ...REG, key_sha256: hashApiKey(PKEY) }];

dbDescribe('T-0942 POST /merchants/me/grants/:partner/revoke', () => {
  const prisma = client();
  const q = (sql: string, ...v: unknown[]) => prisma.$queryRawUnsafe<Row[]>(sql, ...v);
  const x = (sql: string, ...v: unknown[]) => prisma.$executeRawUnsafe(sql, ...v);
  const redis = new FakeRedis();
  const deps = {
    db: prisma as never,
    transaction: (fn: (tx: never) => Promise<unknown>) =>
      prisma.$transaction((tx) => fn(tx as never)),
    redis: redis as never,
    resolve: async () => ['93.184.216.34'],
  } as unknown as ShopDeps;
  let server: ReturnType<express.Express['listen']>;
  let base = '';
  let n = 0;
  const tag = () => `${Date.now().toString(36)}r${n++}`;

  beforeAll(() => {
    migrate();
    const app = express();
    app.set('trust proxy', true);
    app.use(express.json());
    app.use(
      createPartnerRouter({
        db: prisma as never,
        partners: () => PARTNERS,
        encryptionKey: ENC,
        deps: deps as never,
      }),
    );
    app.use(createMerchantRouter(deps));
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server.close();
    await prisma.$disconnect();
  });

  async function activate(merchant_id: string) {
    for (const doc_id of ['merchant-agreement', 'aup', 'dpa', 'refund-framework']) {
      const have = await q(`SELECT 1 FROM shop_legal_docs WHERE doc_id = $1`, doc_id);
      if (have.length === 0) {
        await x(
          `INSERT INTO shop_legal_docs (doc_id, version, sha256, url, effective_from, body_md)
           VALUES ($1, 'g1', $2, $3, now() - interval '1 day', 'b')`,
          doc_id,
          doc_id.padEnd(64, '0'),
          `/legal/${doc_id}`,
        );
      }
    }
    await x(
      `INSERT INTO shop_acceptances (merchant_id, doc_id, version, sha256, method, signer, signature, message)
       SELECT DISTINCT ON (doc_id) $1::uuid, doc_id, version, sha256, 'wallet_signature', 's', 'sig', 'm'
         FROM shop_legal_docs WHERE doc_id IN ('merchant-agreement','aup','dpa','refund-framework')
        ORDER BY doc_id, effective_from DESC`,
      merchant_id,
    );
    await x(
      `UPDATE shop_merchants SET status = 'active',
         encryption_key = '{"kid":"k1","alg":"x25519","pub":"AAAA","sig_by_wallet":"0xsig"}'::jsonb
       WHERE merchant_id = $1::uuid`,
      merchant_id,
    );
  }

  async function merchant() {
    const acct = privateKeyToAccount(generatePrivateKey());
    const id = await mkMerchant(prisma, tag());
    await x(
      `UPDATE shop_merchants SET wallet_address = $2 WHERE merchant_id = $1::uuid`,
      id,
      acct.address.toLowerCase(),
    );
    await activate(id);
    const owner = await deps.transaction((tx) => issueKey(tx, id));
    const [{ slug }] = await q(`SELECT slug FROM shop_merchants WHERE merchant_id = $1::uuid`, id);
    return { id, acct, owner, slug: slug as string };
  }

  let ip = 0;
  const xff = () => ({ 'x-forwarded-for': `10.11.${(ip >> 8) & 255}.${ip++ & 255}` });
  const http = (method: string, path: string, body?: unknown, key?: string, from = xff()) =>
    fetch(`${base}${path}`, {
      method,
      headers: {
        ...from,
        'content-type': 'application/json',
        ...(key ? { authorization: `Bearer ${key}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const json = async (r: Response) => ({ status: r.status, body: (await r.json()) as Row });

  async function signed(acct: ReturnType<typeof privateKeyToAccount>, purpose: string) {
    const nr = await http(
      'GET',
      `/api/v1/shop/auth/nonce?wallet=${acct.address}&purpose=${purpose}&partner=soukbase`,
    );
    expect(nr.status).toBe(200);
    const { message } = (await nr.json()) as { message: string };
    return { wallet: acct.address, message, signature: await acct.signMessage({ message }) };
  }
  async function granted() {
    const m = await merchant();
    const s = await signed(m.acct, 'grant');
    const g = await json(
      await http('POST', '/api/v1/shop/merchants/me/grants', { ...s, partner: 'soukbase' }),
    );
    expect(g.status).toBe(201);
    const [ep] = await q(
      `SELECT endpoint_id::text AS endpoint_id FROM shop_webhook_endpoints WHERE grant_id = $1::uuid`,
      g.body.grant_id,
    );
    return { ...m, grant_id: g.body.grant_id as string, endpoint_id: ep.endpoint_id as string };
  }
  const revoke = async (acct: ReturnType<typeof privateKeyToAccount>, partner = 'soukbase') =>
    json(
      await http(
        'POST',
        `/api/v1/shop/merchants/me/grants/${partner}/revoke`,
        await signed(acct, 'grant_revoke'),
      ),
    );
  const putCatalog = async (slug: string) =>
    json(
      await http(
        'PUT',
        `/api/v1/shop/partners/merchants/${slug}/catalog`,
        {
          items: [
            { sku: 'p-1', title: 'Item', description: 'ok', price_usd: 5, category: 'books' },
          ],
        },
        PKEY,
      ),
    );

  it('nonce purpose grant_revoke returns the stop text; an unknown partner is 422', async () => {
    const acct = privateKeyToAccount(generatePrivateKey());
    const s = await signed(acct, 'grant_revoke');
    expect(s.message.split('\n')[0]).toBe('apibase.pro: stop Soukbase acting for your store');
    const r = await json(
      await http(
        'GET',
        `/api/v1/shop/auth/nonce?wallet=${acct.address}&purpose=grant_revoke&partner=nobody`,
      ),
    );
    expect([r.status, r.body.error_code]).toEqual([422, 'validation_failed']);
  });

  it('200 and the grant is revoked with the effects of DELETE: partner routes 403 grant_revoked, endpoint deleted', async () => {
    const g = await granted();
    expect((await putCatalog(g.slug)).status).toBe(200);
    const rv = await revoke(g.acct);
    expect([rv.status, rv.body]).toEqual([200, { partner: 'soukbase', revoked: true }]);
    const [row] = await q(
      `SELECT revoked_at FROM shop_partner_grants WHERE grant_id = $1::uuid`,
      g.grant_id,
    );
    expect(row.revoked_at).not.toBeNull();
    const [ep] = await q(
      `SELECT status FROM shop_webhook_endpoints WHERE endpoint_id = $1::uuid`,
      g.endpoint_id,
    );
    expect(ep.status).toBe('deleted');
    const r = await putCatalog(g.slug);
    expect([r.status, r.body.error_code]).toEqual([403, 'grant_revoked']);
    const pg = await json(
      await http('GET', `/api/v1/shop/partners/merchants/${g.slug}/grants`, undefined, PKEY),
    );
    expect(pg.body.grants[0]).toMatchObject({ grant_id: g.grant_id, state: 'revoked' });
    // a second stop: no active grant, as on DELETE
    const again = await revoke(g.acct);
    expect([again.status, again.body.error_code]).toEqual([404, 'not_found']);
  });

  it('404 not_found for a store that never allowed the partner', async () => {
    const m = await merchant();
    const r = await revoke(m.acct);
    expect([r.status, r.body.error_code]).toEqual([404, 'not_found']);
  });

  it('404 merchant_not_found for a wallet without a store', async () => {
    const acct = privateKeyToAccount(generatePrivateKey());
    const r = await revoke(acct);
    expect([r.status, r.body.error_code]).toEqual([404, 'merchant_not_found']);
  });

  it('a suspended store can revoke', async () => {
    const g = await granted();
    await x(`UPDATE shop_merchants SET status = 'suspended' WHERE merchant_id = $1::uuid`, g.id);
    const r = await revoke(g.acct);
    expect([r.status, r.body]).toEqual([200, { partner: 'soukbase', revoked: true }]);
  });

  it('a bad signature or a text for another wallet is 401 and revokes nothing; no Authorization is needed', async () => {
    const g = await granted();
    const other = privateKeyToAccount(generatePrivateKey());
    const s = await signed(g.acct, 'grant_revoke');
    const bad = await json(
      await http('POST', '/api/v1/shop/merchants/me/grants/soukbase/revoke', {
        ...s,
        signature: await other.signMessage({ message: s.message }),
      }),
    );
    expect(bad.status).toBe(401);
    const o = await signed(other, 'grant_revoke');
    const wrong = await json(
      await http('POST', '/api/v1/shop/merchants/me/grants/soukbase/revoke', {
        ...o,
        wallet: g.acct.address,
      }),
    );
    expect(wrong.status).toBe(401);
    const [row] = await q(
      `SELECT revoked_at FROM shop_partner_grants WHERE grant_id = $1::uuid`,
      g.grant_id,
    );
    expect(row.revoked_at).toBeNull();
  });

  it('10 requests/min per address: the 11th is 429', async () => {
    const from = { 'x-forwarded-for': '10.12.0.1' };
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) {
      codes.push(
        (
          await http(
            'POST',
            '/api/v1/shop/merchants/me/grants/soukbase/revoke',
            {},
            undefined,
            from,
          )
        ).status,
      );
    }
    expect(codes.slice(0, 10).every((c) => c === 422)).toBe(true);
    expect(codes[10]).toBe(429);
  });
});
