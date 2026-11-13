/**
 * T-0740: partner grants (SOUKBASE-A16-1109 ruling-1 A-2) against a real Postgres (TEST_DATABASE_URL,
 * disposable): the grant message, POST/GET/DELETE /merchants/me/grants, grant-key scopes and the
 * ownerKeyOnly guard (REST + MCP), grant-scoped webhooks, one-time key delivery via the handoff,
 * revocation effects, and the connect page states.
 */
import express from 'express';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { hashApiKey } from '../../src/services/api-key.service';
import { processEvent, type ProcessorDeps } from '../../src/outbox/processor';
import { issueKey } from '../../src/shop/auth/merchant-key.service';
import { grantMessage, issueNonce, verifyGrantSignature } from '../../src/shop/auth/nonce.service';
import type { ShopDeps } from '../../src/shop/merchant-lifecycle.service';
import { createIntegratorRouter, type Partner } from '../../src/shop/routes/integrator.router';
import { createMerchantRouter } from '../../src/shop/routes/merchant.router';
import { createPartnerRouter } from '../../src/shop/routes/partner.router';
import { registerCatalogTools } from '../../src/shop/tools/catalog.tools';
import {
  GRANT_KEY_TOOLS,
  MERCHANT_TOOL_NAMES,
  registerMerchantTools,
} from '../../src/shop/tools/merchant.tools';
import { client, dbDescribe, migrate, mkMerchant } from './helpers/shop-db';

const ENC = 'k'.repeat(40);
jest.mock('../../src/config', () => ({ config: { ENCRYPTION_KEY: 'k'.repeat(40) } }));
jest.mock('../../src/config/index', () => ({ config: { ENCRYPTION_KEY: 'k'.repeat(40) } }));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
// T-0747: the committed soukbase entry is grant_mode partner; this suite pins mode key (T-0740 as
// shipped) with the same id and name. Mode partner: tests/unit/shop-partner-grant-mode.test.ts.
jest.mock('../../src/shop/routes/integrator.router', () => {
  const actual = jest.requireActual('../../src/shop/routes/integrator.router');
  return {
    ...actual,
    partners: () =>
      actual.partners().map((p: Record<string, unknown>) => ({
        id: p.id,
        name: p.name,
        site: p.site,
        return_url: p.return_url,
        key_sha256: p.key_sha256,
        grant_mode: 'key',
      })),
  };
});
jest.mock('../../src/services/moderation-ban.service', () => ({
  checkBan: async () => ({ banned: false, retryAfterSecs: 0 }),
  recordBlock: async () => undefined,
}));

type Row = Record<string, any>;

const PKEY = 'pk_live_' + 'a1'.repeat(16);
// id and name equal the committed registry entry (config/integrator/partners.json): the grant
// routes read that registry, the partner routes take this test key.
const PARTNERS: Partner[] = [
  {
    id: 'soukbase',
    name: 'Soukbase',
    site: 'https://soukbase.com',
    return_url: 'https://soukbase.com/sell/apibase/return',
    key_sha256: hashApiKey(PKEY),
    grant_mode: 'key',
  },
];

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

describe('T-0740 grant message (no DB)', () => {
  const acct = privateKeyToAccount(generatePrivateKey());
  const partner = { id: 'soukbase', name: 'Soukbase' };
  const make = async (redis: FakeRedis, over: Partial<Parameters<typeof grantMessage>[0]> = {}) => {
    const nonce = await issueNonce(acct.address, redis as never);
    const message = grantMessage({
      partnerName: 'Soukbase',
      partnerId: 'soukbase',
      wallet: acct.address,
      nonce,
      issuedAt: new Date().toISOString(),
      ...over,
    });
    return { message, signature: await acct.signMessage({ message }) };
  };

  it('the text is exactly the card text and verifies once', async () => {
    const redis = new FakeRedis();
    const s = await make(redis);
    expect(s.message).toMatch(
      new RegExp(
        '^apibase\\.pro: allow Soukbase to act for your store\\nAddress: 0x[0-9a-fA-F]{40}\\nPartner: soukbase\\n' +
          'Allows: upload and import your catalog; register its own webhook endpoint and receive your order events; read the outcome of each quote for your products \\(paid, unpaid, expired, refused\\), never who the buyer is\\n' +
          'Does not allow: payouts, keys, orders, refunds\\n' +
          'Revoke any time: DELETE /api/v1/shop/merchants/me/grants/soukbase\\nNonce: [0-9a-f]{32}\\nIssued At: \\S+$',
      ),
    );
    const v = (x: typeof s) =>
      verifyGrantSignature(
        { ...x, expectedAddress: acct.address, partner },
        { redis: redis as never },
      );
    await expect(v(s)).resolves.toEqual({ signer_kind: 'eoa' });
    await expect(v(s)).rejects.toMatchObject({ status: 401 }); // nonce spent
  });

  it('T-0825: the old Allows line (without quotes:read) is refused (401)', async () => {
    const redis = new FakeRedis();
    const s = await make(redis);
    const old = s.message.replace(/; read the outcome[^\n]*/, '');
    expect(old).not.toBe(s.message);
    const sig = await acct.signMessage({ message: old });
    await expect(
      verifyGrantSignature(
        { message: old, signature: sig, expectedAddress: acct.address, partner },
        { redis: redis as never },
      ),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('a tampered Partner line, name, revoke route or address is refused (401)', async () => {
    const redis = new FakeRedis();
    const cases: Array<(m: string) => string> = [
      (m) => m.replace('Partner: soukbase', 'Partner: otherco'),
      (m) => m.replace('allow Soukbase', 'allow Someone'),
      (m) => m.replace('/grants/soukbase', '/grants/otherco'),
      (m) => m.replace('Does not allow: payouts, keys, orders, refunds', 'Does not allow: nothing'),
    ];
    for (const t of cases) {
      const s = await make(redis);
      const message = t(s.message);
      await expect(
        verifyGrantSignature(
          {
            message,
            signature: await acct.signMessage({ message }),
            expectedAddress: acct.address,
            partner,
          },
          { redis: redis as never },
        ),
      ).rejects.toMatchObject({ status: 401 });
    }
    const s = await make(redis, { partnerId: 'otherco' });
    await expect(
      verifyGrantSignature(
        { ...s, expectedAddress: acct.address, partner },
        { redis: redis as never },
      ),
    ).rejects.toMatchObject({ status: 401 });
  });
});

dbDescribe('T-0740 partner grants', () => {
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
  const tag = () => `${Date.now().toString(36)}g${n++}`;

  beforeAll(() => {
    migrate();
    const app = express();
    // every request comes from its own address: the per-address limiters (10/min on grants) stay out of the way
    app.set('trust proxy', true);
    app.use(express.json());
    app.use(
      createPartnerRouter({ db: prisma as never, partners: () => PARTNERS, encryptionKey: ENC }),
    );
    app.use(createMerchantRouter(deps));
    app.use(createIntegratorRouter({ limit: 10_000, db: prisma as never }));
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

  /** An active merchant with a real wallet and its owner key. */
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
  const xff = () => ({ 'x-forwarded-for': `10.7.${(ip >> 8) & 255}.${ip++ & 255}` });
  const get = (path: string) => fetch(`${base}${path}`, { headers: xff() });
  const http = (method: string, path: string, body?: unknown, key?: string) =>
    fetch(`${base}${path}`, {
      method,
      headers: {
        ...xff(),
        'content-type': 'application/json',
        ...(key ? { authorization: `Bearer ${key}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const json = async (r: Response) => ({ status: r.status, body: (await r.json()) as Row });

  async function grant(acct: ReturnType<typeof privateKeyToAccount>, handoff_id?: string) {
    const nr = await get(
      `/api/v1/shop/auth/nonce?wallet=${acct.address}&purpose=grant&partner=soukbase`,
    );
    expect(nr.status).toBe(200);
    const { message } = (await nr.json()) as { message: string };
    return json(
      await http('POST', '/api/v1/shop/merchants/me/grants', {
        wallet: acct.address,
        partner: 'soukbase',
        message,
        signature: await acct.signMessage({ message }),
        ...(handoff_id ? { handoff_id } : {}),
      }),
    );
  }
  async function handoff(body: Row = {}) {
    const r = await fetch(`${base}/api/v1/shop/partners/handoffs`, {
      method: 'POST',
      headers: { authorization: `Bearer ${PKEY}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(r.status).toBe(201);
    return ((await r.json()) as { handoff_id: string }).handoff_id;
  }
  const readHandoff = async (id: string) =>
    (await (
      await fetch(`${base}/api/v1/shop/partners/handoffs/${id}`, {
        headers: { authorization: `Bearer ${PKEY}` },
      })
    ).json()) as Row;
  /** A merchant with a delivered grant key. */
  async function granted() {
    const m = await merchant();
    const h = await handoff({ mode: 'grant' });
    const g = await grant(m.acct, h);
    expect(g.status).toBe(201);
    const read = await readHandoff(h);
    return {
      ...m,
      handoff_id: h,
      grant_id: g.body.grant_id as string,
      gkey: read.grant.key as string,
    };
  }
  async function mcp(key: string) {
    const srv = new McpServer({ name: 't', version: '0' });
    registerMerchantTools(srv, key, 'req-1', deps);
    registerCatalogTools(srv, key, 'req-1', deps);
    const c = new Client({ name: 'c', version: '0' });
    const [t1, t2] = InMemoryTransport.createLinkedPair();
    await Promise.all([srv.connect(t1), c.connect(t2)]);
    return async (name: string, args: Row = {}) => {
      const r: any = await c.callTool({ name, arguments: args });
      return { isError: !!r.isError, body: JSON.parse(r.content[0].text) as Row };
    };
  }

  describe('nonce purpose grant', () => {
    it('answers the grant text for a registered partner; unknown or missing partner = 422', async () => {
      const w = '0x' + '00'.repeat(19) + '01';
      const ok = await fetch(
        `${base}/api/v1/shop/auth/nonce?wallet=${w}&purpose=grant&partner=soukbase`,
      );
      expect(ok.status).toBe(200);
      expect(((await ok.json()) as Row).message).toContain(
        'apibase.pro: allow Soukbase to act for your store',
      );
      for (const qs of ['&partner=nobody', '', '&partner=']) {
        const r = await fetch(`${base}/api/v1/shop/auth/nonce?wallet=${w}&purpose=grant${qs}`);
        expect([qs, r.status]).toEqual([qs, 422]);
      }
    });
  });

  describe('POST /merchants/me/grants', () => {
    it('unknown wallet 404 merchant_not_found; suspended 410 merchant_unavailable; repeat 409 grant_exists', async () => {
      const stranger = privateKeyToAccount(generatePrivateKey());
      const nf = await grant(stranger);
      expect([nf.status, nf.body.error_code]).toEqual([404, 'merchant_not_found']);

      const s = await merchant();
      await x(`UPDATE shop_merchants SET status = 'suspended' WHERE merchant_id = $1::uuid`, s.id);
      const su = await grant(s.acct);
      expect([su.status, su.body.error_code]).toEqual([410, 'merchant_unavailable']);

      const m = await merchant();
      const first = await grant(m.acct);
      expect(first.status).toBe(201);
      expect(first.body).toMatchObject({
        partner: 'soukbase',
        scopes: ['catalog:write', 'webhooks:write', 'quotes:read'],
        slug: m.slug,
      });
      expect(JSON.stringify(first.body)).not.toMatch(/mk_live_/);
      const again = await grant(m.acct);
      expect([again.status, again.body.error_code]).toEqual([409, 'grant_exists']);
      const [k] = await q(
        `SELECT k.scopes, k.label FROM shop_partner_grants g JOIN shop_merchant_keys k USING (key_hash)
          WHERE g.grant_id = $1::uuid`,
        first.body.grant_id,
      );
      expect(k).toEqual({ scopes: ['catalog:write', 'webhooks:write'], label: 'grant:soukbase' });
    });

    it('T-0825: a new grant has three scopes, its key two; the nonce route returns the new line', async () => {
      const m = await merchant();
      const nr = await get(
        `/api/v1/shop/auth/nonce?wallet=${m.acct.address}&purpose=grant&partner=soukbase`,
      );
      const { message } = (await nr.json()) as { message: string };
      expect(message).toContain('never who the buyer is\n');
      const g = await grant(m.acct);
      expect(g.status).toBe(201);
      expect(g.body.scopes).toEqual(['catalog:write', 'webhooks:write', 'quotes:read']);
      const [k] = await q(
        `SELECT k.scopes FROM shop_partner_grants g JOIN shop_merchant_keys k USING (key_hash)
          WHERE g.grant_id = $1::uuid`,
        g.body.grant_id,
      );
      expect(k.scopes).toEqual(['catalog:write', 'webhooks:write']);
    });

    it('T-0825: an old two-scope grant gains quotes:read from one signature, in place; a second is 409', async () => {
      const m = await merchant();
      const g = await grant(m.acct);
      expect(g.status).toBe(201);
      // an older grant: two scopes, an old proof
      await x(
        `UPDATE shop_partner_grants SET scopes = ARRAY['catalog:write','webhooks:write'], proof_message = 'old'
          WHERE grant_id = $1::uuid`,
        g.body.grant_id,
      );
      // another partner's grant of the same store stays as it is
      await x(
        `INSERT INTO shop_partner_grants (merchant_id, partner_id, key_hash, scopes, mode)
         VALUES ($1::uuid, 'otherco', NULL, ARRAY['catalog:write','webhooks:write'], 'partner')`,
        m.id,
      );
      const [before] = await q(
        `SELECT key_hash, created_at FROM shop_partner_grants WHERE grant_id = $1::uuid`,
        g.body.grant_id,
      );
      const up = await grant(m.acct);
      expect(up.status).toBe(200);
      expect(up.body).toMatchObject({
        grant_id: g.body.grant_id,
        partner: 'soukbase',
        scopes: ['catalog:write', 'webhooks:write', 'quotes:read'],
        slug: m.slug,
      });
      expect(JSON.stringify(up.body)).not.toMatch(/mk_live_|whsec_/);
      const rows = await q(
        `SELECT grant_id::text AS grant_id, key_hash, created_at, scopes, proof_message
           FROM shop_partner_grants WHERE merchant_id = $1::uuid AND revoked_at IS NULL
          ORDER BY partner_id`,
        m.id,
      );
      const mine = rows.find((r) => r.grant_id === g.body.grant_id);
      expect(mine?.key_hash).toBe(before.key_hash);
      expect(mine?.proof_message).toContain('never who the buyer is');
      const other = rows.find((r) => r.grant_id !== g.body.grant_id);
      expect(other?.scopes).toEqual(['catalog:write', 'webhooks:write']);
      const [k] = await q(
        `SELECT k.scopes FROM shop_partner_grants g JOIN shop_merchant_keys k USING (key_hash)
          WHERE g.grant_id = $1::uuid`,
        g.body.grant_id,
      );
      expect(k.scopes).toEqual(['catalog:write', 'webhooks:write']);
      const again = await grant(m.acct);
      expect([again.status, again.body.error_code]).toEqual([409, 'grant_exists']);
    });

    it('a bad signature is 401 and creates nothing', async () => {
      const m = await merchant();
      const other = privateKeyToAccount(generatePrivateKey());
      const nr = await get(
        `/api/v1/shop/auth/nonce?wallet=${m.acct.address}&purpose=grant&partner=soukbase`,
      );
      const { message } = (await nr.json()) as { message: string };
      const r = await json(
        await http('POST', '/api/v1/shop/merchants/me/grants', {
          wallet: m.acct.address,
          partner: 'soukbase',
          message,
          signature: await other.signMessage({ message }),
        }),
      );
      expect(r.status).toBe(401);
      expect(
        await q(`SELECT 1 FROM shop_partner_grants WHERE merchant_id = $1::uuid`, m.id),
      ).toHaveLength(0);
    });
  });

  describe('handoff delivery', () => {
    it('the partner reads the key exactly once; the merchant never sees it', async () => {
      const m = await merchant();
      const h = await handoff({ mode: 'grant', seller_ref: 'r-1' });
      const g = await grant(m.acct, h);
      expect(g.status).toBe(201);
      expect(JSON.stringify(g.body)).not.toMatch(/mk_live_/);
      const first = await readHandoff(h);
      expect(first).toMatchObject({ state: 'granted', slug: m.slug, merchant_id: m.id });
      expect(first.grant).toMatchObject({
        state: 'granted',
        scopes: ['catalog:write', 'webhooks:write', 'quotes:read'],
      });
      expect(first.grant.key).toMatch(/^mk_live_[0-9a-f]{32}$/);
      const second = await readHandoff(h);
      expect(second.grant).toEqual({
        state: 'granted',
        mode: 'key',
        scopes: ['catalog:write', 'webhooks:write', 'quotes:read'],
        delivered: true,
      });
      const [row] = await q(
        `SELECT grant_key_enc, grant_delivered_at IS NOT NULL AS d FROM shop_partner_handoffs WHERE handoff_id = $1::uuid`,
        h,
      );
      expect(row).toEqual({ grant_key_enc: null, d: true });
      // the delivered key is the grant's key
      const [kh] = await q(
        `SELECT key_hash FROM shop_partner_grants WHERE grant_id = $1::uuid`,
        g.body.grant_id,
      );
      expect(kh.key_hash).toBe(hashApiKey(first.grant.key));
    });

    it('T-0764: a grant that binds a handoff sets wallet_match; a registered handoff keeps its value', async () => {
      const other = privateKeyToAccount(generatePrivateKey()).address;
      const m1 = await merchant();
      const equal = await handoff({ mode: 'grant', expected_wallet: m1.acct.address });
      expect((await grant(m1.acct, equal)).status).toBe(201);
      expect(await readHandoff(equal)).toMatchObject({ state: 'granted', wallet_match: true });
      const m2 = await merchant();
      const differ = await handoff({ mode: 'grant', expected_wallet: other });
      expect((await grant(m2.acct, differ)).status).toBe(201);
      const d = await readHandoff(differ);
      expect(d).toMatchObject({ state: 'granted', wallet_match: false });
      expect(d.registered_at).toBeUndefined();
      const m3 = await merchant();
      const none = await handoff({ mode: 'grant' });
      expect((await grant(m3.acct, none)).status).toBe(201);
      expect(await readHandoff(none)).toMatchObject({ wallet_match: true });
      const m4 = await merchant();
      const reg = await handoff({ grant_requested: true, expected_wallet: m4.acct.address });
      await x(
        `UPDATE shop_partner_handoffs SET state = 'registered', merchant_id = $2::uuid, slug = $3,
                wallet_match = false, registered_at = now() WHERE handoff_id = $1::uuid`,
        reg,
        m4.id,
        m4.slug,
      );
      expect((await grant(m4.acct, reg)).status).toBe(201);
      expect(await readHandoff(reg)).toMatchObject({ state: 'granted', wallet_match: false });
    });

    it('a handoff without a grant says none; a handoff bound to another merchant is not taken', async () => {
      const h0 = await handoff();
      expect((await readHandoff(h0)).grant).toEqual({ state: 'none' });
      const a = await merchant();
      const b = await merchant();
      const h = await handoff({ mode: 'grant' });
      await x(
        `UPDATE shop_partner_handoffs SET merchant_id = $2::uuid WHERE handoff_id = $1::uuid`,
        h,
        a.id,
      );
      const g = await grant(b.acct, h);
      expect(g.status).toBe(201);
      expect((await readHandoff(h)).grant).toEqual({ state: 'none' });
    });

    it('create validates mode and grant_requested', async () => {
      for (const [body, field] of [
        [{ mode: 'other' }, 'mode'],
        [{ grant_requested: 'yes' }, 'grant_requested'],
      ] as Array<[Row, string]>) {
        const r = await fetch(`${base}/api/v1/shop/partners/handoffs`, {
          method: 'POST',
          headers: { authorization: `Bearer ${PKEY}`, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        expect([r.status, ((await r.json()) as Row).field]).toEqual([422, field]);
      }
      const h = await handoff({ grant_requested: true });
      const [row] = await q(
        `SELECT mode, grant_requested FROM shop_partner_handoffs WHERE handoff_id = $1::uuid`,
        h,
      );
      expect(row).toEqual({ mode: 'register', grant_requested: true });
    });
  });

  describe('grant key scopes and ownerKeyOnly', () => {
    it('authenticates with catalog:write + webhooks:write only (orders 403)', async () => {
      const g = await granted();
      const r = await json(
        await http('GET', '/api/v1/shop/merchants/me/orders', undefined, g.gkey),
      );
      expect(r.status).toBe(403);
      for (const p of ['/api/v1/shop/merchants/me/stats', '/api/v1/shop/merchants/me/events']) {
        expect((await http('GET', p, undefined, g.gkey)).status).toBe(403);
      }
      const call = await mcp(g.gkey);
      const ol = await call('shop.merchant.orders_list');
      expect(ol.isError).toBe(true);
      expect(ol.body.error_code).toBe('grant_key_not_allowed');
    });

    it('rotate, deactivate, acceptances and grants with a grant key: 403 grant_key_not_allowed', async () => {
      const g = await granted();
      const calls: Array<[string, string, unknown?]> = [
        ['POST', '/api/v1/shop/merchants/me/keys/rotate', {}],
        ['POST', '/api/v1/shop/merchants/me/deactivate', {}],
        ['POST', '/api/v1/shop/merchants/me/acceptances', { wallet: g.acct.address }],
        ['GET', '/api/v1/shop/merchants/me/grants'],
        ['DELETE', '/api/v1/shop/merchants/me/grants/soukbase'],
        ['DELETE', '/api/v1/shop/merchants/me/catalog', { skus: ['a'] }],
        ['PUT', '/api/v1/shop/merchants/me/renewer-key', {}],
        ['PATCH', '/api/v1/shop/merchants/me/stream-settings', {}],
        ['PATCH', '/api/v1/shop/merchants/me/provek', {}],
        ['PATCH', '/api/v1/shop/merchants/me/contact', { support_email: 'evil@partner.example' }],
      ];
      for (const [method, path, body] of calls) {
        const r = await json(await http(method, path, body, g.gkey));
        expect([path, r.status, r.body.error_code]).toEqual([path, 403, 'grant_key_not_allowed']);
        expect(r.body.message).toBe('this key was granted to soukbase; use the merchant key');
      }
      // nothing changed: the grant key and the owner key still work, the merchant is active
      expect(
        (await http('GET', '/api/v1/shop/merchants/me/webhooks', undefined, g.gkey)).status,
      ).toBe(200);
      expect(
        (await http('GET', '/api/v1/shop/merchants/me/grants', undefined, g.owner)).status,
      ).toBe(200);
      const [st] = await q(`SELECT status FROM shop_merchants WHERE merchant_id = $1::uuid`, g.id);
      expect(st.status).toBe('active');
    });

    it('T-0768: PATCH /merchants/me/contact with the owner key sets and clears support_email only', async () => {
      const m = await merchant();
      const p = '/api/v1/shop/merchants/me/contact';
      const row = async () =>
        (
          await q(
            `SELECT contact_email, support_email FROM shop_merchants WHERE merchant_id = $1::uuid`,
            m.id,
          )
        )[0];
      const before = await row();
      const set = await json(
        await http('PATCH', p, { support_email: 'help@shop.example' }, m.owner),
      );
      expect(set).toEqual({ status: 200, body: { support_email: 'help@shop.example' } });
      expect(await row()).toEqual({ ...before, support_email: 'help@shop.example' });
      const bad = await json(await http('PATCH', p, { support_email: 'nope' }, m.owner));
      expect(bad.status).toBe(422);
      expect(bad.body).toMatchObject({ error_code: 'validation_failed', field: 'support_email' });
      expect((await json(await http('PATCH', p, {}, m.owner))).status).toBe(422);
      expect((await row()).support_email).toBe('help@shop.example');
      const clear = await json(await http('PATCH', p, { support_email: null }, m.owner));
      expect(clear).toEqual({ status: 200, body: { support_email: null } });
      expect(await row()).toEqual({ ...before, support_email: null });
      expect((await http('PATCH', p, { support_email: null })).status).toBe(401);
    });

    it('MCP: every merchant tool but the grant set refuses a grant key', async () => {
      const g = await granted();
      const call = await mcp(g.gkey);
      const owner = [...MERCHANT_TOOL_NAMES, 'shop.merchant.catalog_delete'].filter(
        (t) => !GRANT_KEY_TOOLS.includes(t),
      );
      expect(owner).toContain('shop.merchant.rotate_key');
      const args: Row = {
        'shop.merchant.register': {
          wallet: g.acct.address,
          slug: 'x-shop',
          name: 'x',
          category: 'c',
          country: 'US',
          contact_email: 'a@b.c',
          site_url: 'https://x.example',
          encryption_key: { kid: 'k', alg: 'a', pub: 'p', sig_by_wallet: 's' },
          message: 'm',
          signature: 's',
        },
        'shop.merchant.accept_terms': {
          wallet: g.acct.address,
          doc_hashes: [],
          message: 'm',
          signature: 's',
        },
        'shop.merchant.order_confirm': { order_id: randomUUID() },
        'shop.merchant.order_ship': { order_id: randomUUID() },
        'shop.merchant.order_document': { order_id: randomUUID(), url: 'https://x.example/i' },
        'shop.merchant.refund': { order_id: randomUUID(), amount: '1', tx_hash: '0x' },
        'shop.merchant.grant_revoke': { partner: 'soukbase' },
        'shop.merchant.catalog_delete': { skus: ['a'] },
      };
      for (const t of owner) {
        const r = await call(t, args[t] ?? {});
        expect([t, r.isError, r.body.error_code]).toEqual([t, true, 'grant_key_not_allowed']);
      }
      expect((await call('shop.merchant.webhook_list')).isError).toBe(false);
      expect((await call('shop.merchant.check')).body.error_code).not.toBe('grant_key_not_allowed');
    });
  });

  describe('grant-scoped webhooks', () => {
    it('webhook_set under a grant stamps grant_id and returns the secret once; list/update/delete see only its own', async () => {
      const g = await granted();
      const own = await json(
        await http(
          'PUT',
          '/api/v1/shop/merchants/me/webhooks',
          { url: 'https://hook.example/own', events: ['order.paid'] },
          g.owner,
        ),
      );
      const pe = await json(
        await http(
          'PUT',
          '/api/v1/shop/merchants/me/webhooks',
          { url: 'https://hook.example/p', events: ['order.paid'] },
          g.gkey,
        ),
      );
      expect(pe.status).toBe(200);
      expect(pe.body.secret).toMatch(/^whsec_[0-9a-f]{32}$/);
      const [row] = await q(
        `SELECT grant_id::text AS grant_id FROM shop_webhook_endpoints WHERE endpoint_id = $1::uuid`,
        pe.body.endpoint_id,
      );
      expect(row.grant_id).toBe(g.grant_id);

      const gl = await json(
        await http('GET', '/api/v1/shop/merchants/me/webhooks', undefined, g.gkey),
      );
      expect(gl.body.endpoints.map((e: Row) => e.endpoint_id)).toEqual([pe.body.endpoint_id]);
      const ol = await json(
        await http('GET', '/api/v1/shop/merchants/me/webhooks', undefined, g.owner),
      );
      expect(ol.body.endpoints.map((e: Row) => [e.endpoint_id, e.partner])).toEqual([
        [own.body.endpoint_id, null],
        [pe.body.endpoint_id, 'soukbase'],
      ]);
      // the partner cannot update or delete the merchant's own endpoint
      const upd = await http(
        'PUT',
        '/api/v1/shop/merchants/me/webhooks',
        {
          url: 'https://hook.example/evil',
          events: ['order.paid'],
          endpoint_id: own.body.endpoint_id,
        },
        g.gkey,
      );
      expect(upd.status).toBe(404);
      const del = await http(
        'DELETE',
        `/api/v1/shop/merchants/me/webhooks/${own.body.endpoint_id}`,
        undefined,
        g.gkey,
      );
      expect(del.status).toBe(404);
      // ... but its own, yes; MAX_ENDPOINTS counts all
      const upd2 = await json(
        await http(
          'PUT',
          '/api/v1/shop/merchants/me/webhooks',
          {
            url: 'https://hook.example/p2',
            events: ['order.paid'],
            endpoint_id: pe.body.endpoint_id,
            rotate_secret: true,
          },
          g.gkey,
        ),
      );
      expect(upd2.status).toBe(200);
      expect(upd2.body.secret).toMatch(/^whsec_/);
      for (let i = 0; i < 3; i++)
        expect(
          (
            await http(
              'PUT',
              '/api/v1/shop/merchants/me/webhooks',
              { url: `https://hook.example/o${i}`, events: ['order.paid'] },
              g.owner,
            )
          ).status,
        ).toBe(200);
      expect(
        (
          await http(
            'PUT',
            '/api/v1/shop/merchants/me/webhooks',
            { url: 'https://hook.example/p3', events: ['order.paid'] },
            g.gkey,
          )
        ).status,
      ).toBe(422);
      const gd = await json(
        await http(
          'DELETE',
          `/api/v1/shop/merchants/me/webhooks/${pe.body.endpoint_id}`,
          undefined,
          g.gkey,
        ),
      );
      expect(gd.body).toEqual({ endpoint_id: pe.body.endpoint_id, deleted: true });
      // MCP twins
      const call = await mcp(g.gkey);
      const ws = await call('shop.merchant.webhook_set', {
        url: 'https://hook.example/m',
        events: ['order.paid'],
      });
      expect(ws.isError).toBe(false);
      const wl = await call('shop.merchant.webhook_list');
      expect(wl.body.endpoints.map((e: Row) => e.endpoint_id)).toEqual([ws.body.endpoint_id]);
      expect(
        (await call('shop.merchant.webhook_delete', { endpoint_id: own.body.endpoint_id })).isError,
      ).toBe(true);
    });
  });

  describe('catalog under a grant', () => {
    it('PUT catalog, POST import and GET import/:id succeed; the test sku may be upserted', async () => {
      const g = await granted();
      const put = await json(
        await http(
          'PUT',
          '/api/v1/shop/merchants/me/catalog',
          {
            items: [
              {
                sku: 'g-1',
                title: 'Grant item',
                description: 'ok',
                price_usd: 5,
                category: 'books',
              },
              {
                sku: '__apibase_test',
                title: 'Test item',
                description: 'test',
                price_usd: '0.01',
                category: 'books',
                is_test: true,
              },
            ],
          },
          g.gkey,
        ),
      );
      expect([put.status, put.body.upserted]).toEqual([200, 2]);
      const again = await json(
        await http(
          'PUT',
          '/api/v1/shop/merchants/me/catalog',
          {
            items: [
              {
                sku: 'g-1',
                title: 'Grant item 2',
                description: 'ok',
                price_usd: 6,
                category: 'books',
              },
            ],
          },
          g.gkey,
        ),
      );
      expect(again.body.upserted).toBe(1);
      const [p] = await q(
        `SELECT count(*)::int AS c FROM shop_products WHERE merchant_id = $1::uuid AND sku = 'g-1'`,
        g.id,
      );
      expect(p.c).toBe(1);
      const imp = await json(
        await http(
          'POST',
          '/api/v1/shop/merchants/me/catalog/import',
          { source: 'csv', body: 'sku,title,price_usd\na,b,1\n' },
          g.gkey,
        ),
      );
      expect(imp.status).toBe(202);
      const st = await http(
        'GET',
        `/api/v1/shop/merchants/me/catalog/import/${imp.body.import_job_id}`,
        undefined,
        g.gkey,
      );
      expect(st.status).toBe(200);
      const call = await mcp(g.gkey);
      const up = await call('shop.merchant.catalog_upsert', {
        items: [
          { sku: 'g-2', title: 'Grant item', description: 'ok', price_usd: 5, category: 'books' },
        ],
      });
      expect(up.isError).toBe(false);
    });
  });

  describe('merchant side: list and revoke', () => {
    it('list shows the grant with its endpoints; revoke -> key 401, endpoints deleted, no delivery, handoff revoked', async () => {
      const g = await granted();
      const pe = await json(
        await http(
          'PUT',
          '/api/v1/shop/merchants/me/webhooks',
          { url: 'https://hook.example/p', events: ['order.paid'] },
          g.gkey,
        ),
      );
      const own = await json(
        await http(
          'PUT',
          '/api/v1/shop/merchants/me/webhooks',
          { url: 'https://hook.example/own', events: ['order.paid'] },
          g.owner,
        ),
      );
      const l = await json(
        await http('GET', '/api/v1/shop/merchants/me/grants', undefined, g.owner),
      );
      expect(l.body).toEqual({
        grants: [
          {
            grant_id: g.grant_id,
            partner: 'soukbase',
            mode: 'key',
            scopes: ['catalog:write', 'webhooks:write', 'quotes:read'],
            created_at: expect.any(String),
            endpoints: [pe.body.endpoint_id],
          },
        ],
      });
      const call = await mcp(g.owner);
      expect((await call('shop.merchant.grants_list')).body.grants[0].grant_id).toBe(g.grant_id);

      const rv = await json(
        await http('DELETE', '/api/v1/shop/merchants/me/grants/soukbase', undefined, g.owner),
      );
      expect([rv.status, rv.body]).toEqual([200, { partner: 'soukbase', revoked: true }]);
      expect(
        (await http('GET', '/api/v1/shop/merchants/me/webhooks', undefined, g.gkey)).status,
      ).toBe(401);
      const eps = await q(
        `SELECT endpoint_id::text AS id, status FROM shop_webhook_endpoints WHERE merchant_id = $1::uuid ORDER BY created_at`,
        g.id,
      );
      expect(eps).toEqual([
        { id: pe.body.endpoint_id, status: 'deleted' },
        { id: own.body.endpoint_id, status: 'active' },
      ]);
      const procDeps: ProcessorDeps = {
        queryRaw: (sql, ...p) => prisma.$queryRawUnsafe(sql, ...p),
        executeRaw: (sql, ...p) => prisma.$executeRawUnsafe(sql, ...p),
        redis: () => {
          throw new Error('no redis');
        },
        log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
      };
      const payload = { order_id: randomUUID(), merchant_id: g.id };
      const [ev] = await q(
        `INSERT INTO outbox (event_type, payload) VALUES ('shop.order.paid', $1::jsonb) RETURNING id, created_at`,
        JSON.stringify(payload),
      );
      expect(
        await processEvent(
          {
            id: BigInt(ev.id),
            created_at: ev.created_at,
            event_type: 'shop.order.paid',
            payload,
          } as never,
          procDeps,
        ),
      ).toBe(true);
      const dl = await q(
        `SELECT endpoint_id::text AS id FROM shop_webhook_deliveries WHERE merchant_id = $1::uuid`,
        g.id,
      );
      expect(dl).toEqual([{ id: own.body.endpoint_id }]);
      expect((await readHandoff(g.handoff_id)).grant).toEqual({ state: 'revoked', mode: 'key' });
      expect(
        (await json(await http('GET', '/api/v1/shop/merchants/me/grants', undefined, g.owner)))
          .body,
      ).toEqual({ grants: [] });
      const again = await http(
        'DELETE',
        '/api/v1/shop/merchants/me/grants/soukbase',
        undefined,
        g.owner,
      );
      expect(again.status).toBe(404);
      expect(
        (await http('DELETE', '/api/v1/shop/merchants/me/grants/nobody', undefined, g.owner))
          .status,
      ).toBe(404);
      // a new grant is possible after the revoke
      expect((await grant(g.acct)).status).toBe(201);
      // MCP revoke works the same
      expect(await call('shop.merchant.grant_revoke', { partner: 'soukbase' })).toEqual({
        isError: false,
        body: { partner: 'soukbase', revoked: true },
      });
    });

    it('an undelivered key is dropped on revoke: the partner never receives it', async () => {
      const m = await merchant();
      const h = await handoff({ mode: 'grant' });
      expect((await grant(m.acct, h)).status).toBe(201);
      expect(
        (await http('DELETE', '/api/v1/shop/merchants/me/grants/soukbase', undefined, m.owner))
          .status,
      ).toBe(200);
      expect((await readHandoff(h)).grant).toEqual({ state: 'revoked', mode: 'key' });
    });

    it('rotating the owner key keeps the grant key working', async () => {
      const g = await granted();
      const r = await json(
        await http('POST', '/api/v1/shop/merchants/me/keys/rotate', {}, g.owner),
      );
      expect(r.status).toBe(200);
      expect(
        (await http('GET', '/api/v1/shop/merchants/me/webhooks', undefined, g.gkey)).status,
      ).toBe(200);
      expect(
        (await http('GET', '/api/v1/shop/merchants/me/webhooks', undefined, g.owner)).status,
      ).toBe(401);
    });
  });

  describe('connect page', () => {
    const page = async (id: string) =>
      (await fetch(`${base}/integrator/connect?from=soukbase&handoff=${id}`)).text();

    it('mode grant: own H1 and lead, bar hidden, one signature row, no payout block', async () => {
      const t = await page(await handoff({ mode: 'grant' }));
      expect(t).toContain('<h1>Allow Soukbase to sell for your store</h1>');
      expect(t).toContain(
        'It gets no access to payouts, keys, orders or refunds. You can revoke it any time.',
      );
      expect(t).toContain('<ol class="cn-bar" id="bar" hidden>');
      expect(t).toContain('<b>1 free signature</b>');
      const sig = /<ol class="cn-sig" id="sig">([\s\S]*?)<\/ol>/.exec(t)?.[1] ?? '';
      expect(sig.match(/<li /g)).toHaveLength(1);
      expect(sig).toContain(
        '<b>Allow Soukbase to sell for you</b><span>Uploads your catalog and receives your orders. Revocable any time.</span>',
      );
      expect(t).not.toContain('Use a different payout wallet');
      expect(t).toContain('"mode":"grant"');
      expect(t).toContain('This wallet has no store on APIbase yet');
      expect(t).toContain("'Sign in wallet'");
    });

    it('T-0802 mode register with grant_requested: 1 free signature and the four statements it carries', async () => {
      const t = await page(await handoff({ grant_requested: true }));
      expect(t).toContain('<h1>Connect your store</h1>');
      expect(t).toContain(
        '<p>Your wallet will ask for <b>1 free signature</b>. No gas, no money leaves your wallet. The one message you sign states:</p>',
      );
      expect(t).not.toContain('free signatures');
      const sig = /<ol class="cn-sig" id="sig">([\s\S]*?)<\/ol>/.exec(t)?.[1] ?? '';
      expect(sig.match(/<li /g)).toHaveLength(4);
      expect(sig).toContain('<b>Your encryption key</b>');
      expect(sig).toContain('<b>Register your store</b>');
      expect(sig).toContain('<b>Accept the documents</b>');
      expect(sig).toContain('<li data-n="4"><div><b>Allow Soukbase to sell for you</b>');
      expect(t).toContain('of 1</b>');
      expect(t).toContain('/api/v1/shop/merchants/handoff');
    });

    it('T-0768: a prefill without contact_email is 201; Contact email renders empty, support_email is never prefilled', async () => {
      const t = await page(await handoff({ prefill: { name: 'Prefill Shop' } }));
      expect(t).toContain(
        '<input name="contact_email" type="email" autocomplete="email" placeholder="you@example.com">',
      );
      expect(t).toContain(
        '<label>Support email (optional)<input name="support_email" type="email"></label><small class="hint">Shown to buyers on their orders.</small>',
      );
      expect(t).toContain('"Prefill Shop"');
      expect(t.toLowerCase()).not.toContain('northsidekicks');
      const pay =
        /<details><summary>Use a different payout wallet<\/summary>([\s\S]*?)<\/details>/.exec(
          t,
        )?.[1] ?? '';
      expect(pay.match(/<p /g)).toHaveLength(1);
      expect(pay).toContain('<label>Payout wallet on Base<input name="payout_wallet_base"');
      expect(pay).toContain('<label>Payout wallet on Tempo<input name="payout_wallet_tempo"');
      expect(t).not.toContain('"contact_email":');
      expect(t).not.toMatch(/PF\.prefill[^;]*support_email|for \(const n of \[[^\]]*support_email/);
    });

    it('a plain handoff and the plain page keep 3 signatures', async () => {
      for (const t of [
        await page(await handoff()),
        await (await fetch(`${base}/integrator/connect`)).text(),
      ]) {
        expect(t).toContain('<b>3 free signatures</b>');
        expect(t).not.toContain('Allow Soukbase to sell');
      }
    });
  });
});
