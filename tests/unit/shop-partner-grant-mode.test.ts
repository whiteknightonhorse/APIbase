/**
 * T-0747 (SOUKBASE-A2B-1109 ruling-1, A-2b): partner-mode grants against a real Postgres
 * (TEST_DATABASE_URL, disposable). The committed registry entry (soukbase) is grant_mode partner:
 * a grant mints no key, creates one grant-owned endpoint at the registry delivery URL and parks its
 * secret on the handoff for one read; the partner pushes the catalog, reads its grants and rotates
 * the endpoint secret with its own partner key, only while its grant for that store is live.
 */
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { hashApiKey } from '../../src/services/api-key.service';
import { processEvent, type ProcessorDeps } from '../../src/outbox/processor';
import { issueKey } from '../../src/shop/auth/merchant-key.service';
import type { ShopDeps } from '../../src/shop/merchant-lifecycle.service';
import {
  loadPartners,
  partners as committedPartners,
  type Partner,
} from '../../src/shop/routes/integrator.router';
import { createMerchantRouter } from '../../src/shop/routes/merchant.router';
import { createOwnerRouter } from '../../src/shop/routes/owner.router';
import { bindHandoff } from '../../src/shop/partner/handoff.service';
import { changeIdentity } from '../../src/shop/auth/identity.service';
import { createPartnerRouter } from '../../src/shop/routes/partner.router';
import { deliverDue } from '../../src/shop/webhook/delivery.service';
import type { WebhookRequest } from '../../src/shop/webhook/transport';
import { WEBHOOK_EVENTS } from '../../src/shop/webhook/constants';
import { signPayload } from '../../src/shop/webhook/webhook.service';
import { registerMerchantTools } from '../../src/shop/tools/merchant.tools';
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

const REG = committedPartners().find((p) => p.id === 'soukbase') as Partner;
const PKEY = 'pk_live_' + 'c3'.repeat(16);
const OKEY = 'pk_live_' + 'd4'.repeat(16);
// soukbase as committed (mode partner, registry url/events) with a test key; otherco is a mode-key partner.
const PARTNERS: Partner[] = [
  { ...REG, key_sha256: hashApiKey(PKEY) },
  {
    id: 'otherco',
    name: 'Other',
    site: 'https://other.example',
    return_url: 'https://other.example/r',
    key_sha256: hashApiKey(OKEY),
    grant_mode: 'key',
  },
];

describe('T-0747 registry grant_mode (no DB)', () => {
  const d = mkdtempSync(join(tmpdir(), 'pgm-'));
  const base = {
    id: 'ab',
    name: 'A',
    site: 'https://a.io',
    return_url: 'https://a.io/r',
    key_sha256: 'a'.repeat(64),
  };
  const load = (entry: Row) => {
    const f = join(d, `${randomUUID()}.json`);
    writeFileSync(f, JSON.stringify([entry]));
    return loadPartners(f);
  };

  it('the committed soukbase entry is mode partner with an https delivery url and the five delivery events', () => {
    const raw = JSON.parse(
      readFileSync(resolve(__dirname, '../../config/integrator/partners.json'), 'utf8'),
    ) as Row[];
    const s = raw.find((p) => p.id === 'soukbase') as Row;
    expect(s.grant_mode).toBe('partner');
    expect(new URL(s.delivery_webhook_url).protocol).toBe('https:');
    expect(s.delivery_events).toEqual([
      'order.paid',
      'order.confirmed',
      'refund.requested',
      'refund.verified',
      'dispute.opened',
    ]);
    for (const e of s.delivery_events) expect(WEBHOOK_EVENTS).toContain(e);
  });

  it('T-0801 seller_keys: absent -> shown; hidden loads in mode partner; hidden in mode key or an unknown value stop the start', () => {
    const pm = {
      ...base,
      grant_mode: 'partner',
      delivery_webhook_url: 'https://a.io/h',
      delivery_events: ['order.paid'],
    };
    expect(load(pm)[0].seller_keys).toBe('shown');
    expect(load({ ...base, grant_mode: 'key' })[0].seller_keys).toBe('shown');
    expect(load({ ...pm, seller_keys: 'shown' })[0].seller_keys).toBe('shown');
    expect(load({ ...pm, seller_keys: 'hidden' })[0].seller_keys).toBe('hidden');
    expect(() => load({ ...base, grant_mode: 'key', seller_keys: 'hidden' })).toThrow(
      /seller_keys hidden is for grant_mode partner only/,
    );
    for (const v of ['Hidden', 'none', '', true, null, ['hidden']])
      expect(() => load({ ...pm, seller_keys: v })).toThrow(/bad field seller_keys/);
    const raw = JSON.parse(
      readFileSync(resolve(__dirname, '../../config/integrator/partners.json'), 'utf8'),
    ) as Row[];
    expect(raw.find((p) => p.id === 'soukbase')?.seller_keys).toBe('hidden');
    expect(REG.seller_keys).toBe('hidden');
  });

  it('mode key and mode partner load; the bad shapes are startup errors', () => {
    expect(load({ ...base, grant_mode: 'key' })[0].grant_mode).toBe('key');
    expect(
      load({
        ...base,
        grant_mode: 'partner',
        delivery_webhook_url: 'https://a.io/h',
        delivery_events: ['order.paid'],
      })[0],
    ).toMatchObject({ grant_mode: 'partner', delivery_events: ['order.paid'] });
    const bad: Array<[string, Row]> = [
      ['missing grant_mode', { ...base }],
      ['unknown grant_mode', { ...base, grant_mode: 'both' }],
      ['partner without url', { ...base, grant_mode: 'partner', delivery_events: ['order.paid'] }],
      [
        'partner with http url',
        {
          ...base,
          grant_mode: 'partner',
          delivery_webhook_url: 'http://a.io/h',
          delivery_events: ['order.paid'],
        },
      ],
      [
        'partner without events',
        { ...base, grant_mode: 'partner', delivery_webhook_url: 'https://a.io/h' },
      ],
      [
        'partner with empty events',
        {
          ...base,
          grant_mode: 'partner',
          delivery_webhook_url: 'https://a.io/h',
          delivery_events: [],
        },
      ],
      [
        'unknown event',
        {
          ...base,
          grant_mode: 'partner',
          delivery_webhook_url: 'https://a.io/h',
          delivery_events: ['order.paid', 'order.teleported'],
        },
      ],
      [
        'key with a delivery url',
        { ...base, grant_mode: 'key', delivery_webhook_url: 'https://a.io/h' },
      ],
      ['key with delivery events', { ...base, grant_mode: 'key', delivery_events: ['order.paid'] }],
    ];
    for (const [name, entry] of bad) {
      let threw = false;
      try {
        load(entry);
      } catch {
        threw = true;
      }
      expect([name, threw]).toEqual([name, true]);
    }
  });
});

dbDescribe('T-0747 partner-mode grants', () => {
  const prisma = client();
  const q = (sql: string, ...v: unknown[]) => prisma.$queryRawUnsafe<Row[]>(sql, ...v);
  const x = (sql: string, ...v: unknown[]) => prisma.$executeRawUnsafe(sql, ...v);
  const redis = {
    m: new Map<string, string>(),
    async set(k: string, v: string) {
      this.m.set(k, v);
    },
    async getdel(k: string) {
      const v = this.m.get(k) ?? null;
      this.m.delete(k);
      return v;
    },
    async get() {
      return null;
    },
    async incr() {
      return 1;
    },
    async expire() {
      return 1;
    },
  };
  // the address the delivery host resolves to (a private one makes setWebhook's target check fail)
  let resolveTo = '93.184.216.34';
  const deps = {
    db: prisma as never,
    transaction: (fn: (tx: never) => Promise<unknown>) =>
      prisma.$transaction((tx) => fn(tx as never)),
    redis: redis as never,
    resolve: async () => [resolveTo],
  } as unknown as ShopDeps;
  let server: ReturnType<express.Express['listen']>;
  let base = '';
  let n = 0;
  const tag = () => `${Date.now().toString(36)}m${n++}`;

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
    app.use(createOwnerRouter(deps));
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
  const xff = () => ({ 'x-forwarded-for': `10.9.${(ip >> 8) & 255}.${ip++ & 255}` });
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
    const nr = await http(
      'GET',
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
  async function handoff() {
    const r = await http('POST', '/api/v1/shop/partners/handoffs', { mode: 'grant' }, PKEY);
    expect(r.status).toBe(201);
    return ((await r.json()) as { handoff_id: string }).handoff_id;
  }
  const readHandoff = async (id: string) =>
    (await json(await http('GET', `/api/v1/shop/partners/handoffs/${id}`, undefined, PKEY))).body;
  /** A store with a live mode-partner grant whose endpoint secret the partner has read. */
  async function granted() {
    const m = await merchant();
    const h = await handoff();
    const g = await grant(m.acct, h);
    expect(g.status).toBe(201);
    const read = await readHandoff(h);
    const [ep] = await q(
      `SELECT endpoint_id::text AS endpoint_id FROM shop_webhook_endpoints WHERE grant_id = $1::uuid`,
      g.body.grant_id,
    );
    return {
      ...m,
      handoff_id: h,
      grant_id: g.body.grant_id as string,
      secret: read.grant.webhook_secret as string,
      endpoint_id: ep.endpoint_id as string,
    };
  }
  const ITEM = {
    sku: 'p-1',
    title: 'Partner item',
    description: 'ok',
    price_usd: 5,
    category: 'books',
  };
  const TEST_ITEM = {
    sku: '__apibase_test',
    title: 'Test item',
    description: 'test',
    price_usd: '0.01',
    category: 'books',
    is_test: true,
  };
  const putCatalog = async (slug: string, items: unknown, key?: string) =>
    json(await http('PUT', `/api/v1/shop/partners/merchants/${slug}/catalog`, { items }, key));
  const procDeps: ProcessorDeps = {
    queryRaw: (sql, ...p) => prisma.$queryRawUnsafe(sql, ...p),
    executeRaw: (sql, ...p) => prisma.$executeRawUnsafe(sql, ...p),
    redis: () => {
      throw new Error('no redis');
    },
    log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  };
  /** One shop.order.paid outbox event through the processor: the delivery rows it fans out. */
  async function orderPaid(merchant_id: string) {
    const payload = { order_id: randomUUID(), merchant_id };
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
    return q(
      `SELECT endpoint_id::text AS endpoint_id FROM shop_webhook_deliveries
        WHERE merchant_id = $1::uuid AND outbox_id = $2`,
      merchant_id,
      ev.id,
    );
  }
  async function mcp(key: string) {
    const srv = new McpServer({ name: 't', version: '0' });
    registerMerchantTools(srv, key, 'req-1', deps);
    const c = new Client({ name: 'c', version: '0' });
    const [t1, t2] = InMemoryTransport.createLinkedPair();
    await Promise.all([srv.connect(t1), c.connect(t2)]);
    return async (name: string, args: Row = {}) => {
      const r: any = await c.callTool({ name, arguments: args });
      return { isError: !!r.isError, body: JSON.parse(r.content[0].text) as Row };
    };
  }

  describe('grant in mode partner', () => {
    it('mints no key, creates one grant-owned endpoint at the registry url/events, answers mode without a secret', async () => {
      const m = await merchant();
      const keysBefore = await q(
        `SELECT count(*)::int AS c FROM shop_merchant_keys WHERE merchant_id = $1::uuid`,
        m.id,
      );
      const g = await grant(m.acct);
      expect(g.status).toBe(201);
      expect(g.body).toMatchObject({ partner: 'soukbase', mode: 'partner', slug: m.slug });
      expect(JSON.stringify(g.body)).not.toMatch(/mk_live_|whsec_|secret/);
      // invariant: a mode-partner grant never creates a shop_merchant_keys row
      const keysAfter = await q(
        `SELECT count(*)::int AS c FROM shop_merchant_keys WHERE merchant_id = $1::uuid`,
        m.id,
      );
      expect(keysAfter[0].c).toBe(keysBefore[0].c);
      const [row] = await q(
        `SELECT mode, key_hash FROM shop_partner_grants WHERE grant_id = $1::uuid`,
        g.body.grant_id,
      );
      expect(row).toEqual({ mode: 'partner', key_hash: null });
      const eps = await q(
        `SELECT url, events, status FROM shop_webhook_endpoints WHERE grant_id = $1::uuid`,
        g.body.grant_id,
      );
      expect(eps).toEqual([
        { url: REG.delivery_webhook_url, events: REG.delivery_events, status: 'active' },
      ]);
      expect([...eps[0].events].sort()).toEqual(
        [
          'order.paid',
          'order.confirmed',
          'refund.requested',
          'refund.verified',
          'dispute.opened',
        ].sort(),
      );
      // the merchant's list says mode partner and shows the endpoint (REST and MCP)
      const l = await json(
        await http('GET', '/api/v1/shop/merchants/me/grants', undefined, m.owner),
      );
      expect(l.body.grants).toEqual([
        expect.objectContaining({
          grant_id: g.body.grant_id,
          mode: 'partner',
          endpoints: [expect.any(String)],
        }),
      ]);
      const call = await mcp(m.owner);
      const ml = await call('shop.merchant.grants_list');
      expect([ml.isError, ml.body.grants[0].mode]).toEqual([false, 'partner']);
    });

    it('a failing url check or the endpoint cap fails the whole grant with 422 and leaves nothing', async () => {
      const m = await merchant();
      resolveTo = '10.0.0.1';
      try {
        const g = await grant(m.acct);
        expect([g.status, g.body.error_code]).toEqual([422, 'validation_failed']);
      } finally {
        resolveTo = '93.184.216.34';
      }
      expect(
        await q(`SELECT 1 FROM shop_partner_grants WHERE merchant_id = $1::uuid`, m.id),
      ).toHaveLength(0);

      for (let i = 0; i < 5; i++) {
        const r = await http(
          'PUT',
          '/api/v1/shop/merchants/me/webhooks',
          { url: `https://hook.example/${i}`, events: ['order.paid'] },
          m.owner,
        );
        expect(r.status).toBe(200);
      }
      const capped = await grant(m.acct);
      expect([capped.status, capped.body.error_code]).toEqual([422, 'validation_failed']);
      expect(
        await q(`SELECT 1 FROM shop_partner_grants WHERE merchant_id = $1::uuid`, m.id),
      ).toHaveLength(0);
      expect(
        await q(
          `SELECT 1 FROM shop_webhook_endpoints WHERE merchant_id = $1::uuid AND grant_id IS NOT NULL`,
          m.id,
        ),
      ).toHaveLength(0);
    });

    it('the handoff carries webhook_secret exactly once, then delivered: true; never a key', async () => {
      const m = await merchant();
      const h = await handoff();
      const g = await grant(m.acct, h);
      expect(g.status).toBe(201);
      const first = await readHandoff(h);
      expect(first).toMatchObject({ state: 'granted', slug: m.slug });
      expect(first.grant).toEqual({
        state: 'granted',
        mode: 'partner',
        scopes: ['catalog:write', 'webhooks:write', 'quotes:read'],
        webhook_secret: expect.stringMatching(/^whsec_[0-9a-f]{32}$/),
      });
      const [ep] = await q(
        `SELECT secret_hash FROM shop_webhook_endpoints WHERE grant_id = $1::uuid`,
        g.body.grant_id,
      );
      expect(ep.secret_hash.trim()).toBe(
        createHash('sha256').update(first.grant.webhook_secret).digest('hex'),
      );
      const second = await readHandoff(h);
      expect(second.grant).toEqual({
        state: 'granted',
        mode: 'partner',
        scopes: ['catalog:write', 'webhooks:write', 'quotes:read'],
        delivered: true,
      });
      const [row] = await q(
        `SELECT grant_key_enc, grant_webhook_secret_enc, grant_delivered_at IS NOT NULL AS d
           FROM shop_partner_handoffs WHERE handoff_id = $1::uuid`,
        h,
      );
      expect(row).toEqual({ grant_key_enc: null, grant_webhook_secret_enc: null, d: true });
    });

    it('T-0825: an old two-scope mode-partner grant gains quotes:read in place: same grant, same endpoint id and secret, handoff untouched; a second is 409', async () => {
      const m = await merchant();
      const h = await handoff();
      const g = await grant(m.acct, h);
      expect(g.status).toBe(201);
      await x(
        `UPDATE shop_partner_grants SET scopes = ARRAY['catalog:write','webhooks:write'], proof_message = 'old'
          WHERE grant_id = $1::uuid`,
        g.body.grant_id,
      );
      const epSql = `SELECT endpoint_id::text AS endpoint_id, secret_hash, url, events, status
                       FROM shop_webhook_endpoints WHERE merchant_id = $1::uuid ORDER BY endpoint_id`;
      const hoSql = `SELECT state, grant_id::text AS grant_id, grant_key_enc, grant_webhook_secret_enc,
                            grant_delivered_at
                       FROM shop_partner_handoffs WHERE handoff_id = $1::uuid`;
      const epBefore = await q(epSql, m.id);
      const hoBefore = await q(hoSql, h);
      const keysBefore = await q(
        `SELECT count(*)::int AS c FROM shop_merchant_keys WHERE merchant_id = $1::uuid`,
        m.id,
      );
      expect(epBefore).toHaveLength(1);

      const up = await grant(m.acct);
      expect(up.status).toBe(200);
      expect(up.body).toMatchObject({
        grant_id: g.body.grant_id,
        mode: 'partner',
        scopes: ['catalog:write', 'webhooks:write', 'quotes:read'],
      });
      expect(JSON.stringify(up.body)).not.toMatch(/mk_live_|whsec_|secret/);

      expect(await q(epSql, m.id)).toEqual(epBefore);
      expect(await q(hoSql, h)).toEqual(hoBefore);
      const keysAfter = await q(
        `SELECT count(*)::int AS c FROM shop_merchant_keys WHERE merchant_id = $1::uuid`,
        m.id,
      );
      expect(keysAfter[0].c).toBe(keysBefore[0].c);
      const rows = await q(
        `SELECT grant_id::text AS grant_id, scopes, proof_message, key_hash
           FROM shop_partner_grants WHERE merchant_id = $1::uuid AND revoked_at IS NULL`,
        m.id,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].grant_id).toBe(g.body.grant_id);
      expect(rows[0].scopes).toEqual(['catalog:write', 'webhooks:write', 'quotes:read']);
      expect(rows[0].proof_message).toContain('never who the buyer is');
      expect(rows[0].key_hash).toBeNull();
      const again = await grant(m.acct);
      expect([again.status, again.body.error_code]).toEqual([409, 'grant_exists']);
    });
  });

  describe('PUT /partners/merchants/:slug/catalog', () => {
    it('401 without a partner key; 404 unknown or malformed slug; 403 grant_missing without a grant of this partner', async () => {
      const m = await merchant();
      expect((await putCatalog(m.slug, [ITEM])).status).toBe(401);
      expect((await putCatalog(m.slug, [ITEM], 'pk_live_' + '0'.repeat(32))).status).toBe(401);
      for (const slug of ['no-such-store-xyz', 'AB', 'x']) {
        const r = await putCatalog(slug, [ITEM], PKEY);
        expect([slug, r.status, r.body.error_code]).toEqual([slug, 404, 'merchant_not_found']);
      }
      const r = await putCatalog(m.slug, [ITEM], PKEY);
      expect([r.status, r.body.error_code]).toEqual([403, 'grant_missing']);
      expect(r.body.message).toBe(
        `${m.slug} has not allowed Soukbase; send the seller a grant link`,
      );
    });

    it('T-0803: amounts as content are accepted; a stated price that differs is a 422 price_claim_mismatch in errors[]', async () => {
      const g = await granted();
      const p1 = {
        ...ITEM,
        sku: 'p-amt',
        description:
          'Four tables: seller fees as stated, price points found, and what a seller keeps of a $1, $5 and $20 sale under the stated formulas.',
      };
      const r2 = { ...ITEM, sku: 'p-r2', description: 'Price: $3' };
      const r = await putCatalog(g.slug, [p1, r2], PKEY);
      expect([r.status, r.body.upserted]).toEqual([200, 1]);
      expect(r.body.errors).toHaveLength(1);
      expect([r.body.errors[0].sku, r.body.errors[0].status, r.body.errors[0].error_code]).toEqual([
        'p-r2',
        422,
        'price_claim_mismatch',
      ]);
      expect(r.body.errors[0].message).toContain('Price: $3');
    });

    it("another partner's live grant does not count: 403 grant_missing", async () => {
      const g = await granted();
      const r = await putCatalog(g.slug, [ITEM], OKEY);
      expect([r.status, r.body.error_code]).toEqual([403, 'grant_missing']);
      expect(
        await q(`SELECT 1 FROM shop_products WHERE merchant_id = $1::uuid`, g.id),
      ).toHaveLength(0);
    });

    it('live grant: 200 with the same report as the merchant route; __apibase_test accepted; sku idempotent', async () => {
      const g = await granted();
      const p = await putCatalog(g.slug, [ITEM, TEST_ITEM], PKEY);
      expect([p.status, p.body.upserted]).toEqual([200, 2]);
      const own = await json(
        await http(
          'PUT',
          '/api/v1/shop/merchants/me/catalog',
          { items: [ITEM, TEST_ITEM] },
          g.owner,
        ),
      );
      expect(p.body).toEqual(own.body);
      const again = await putCatalog(g.slug, [{ ...ITEM, title: 'Partner item 2' }], PKEY);
      expect(again.body.upserted).toBe(1);
      const [c] = await q(
        `SELECT count(*)::int AS c FROM shop_products WHERE merchant_id = $1::uuid AND sku = 'p-1'`,
        g.id,
      );
      expect(c.c).toBe(1);
      // a bad item is reported per item exactly like the merchant route
      const bad = await putCatalog(g.slug, [{ sku: 'p-2' }], PKEY);
      const badOwn = await json(
        await http(
          'PUT',
          '/api/v1/shop/merchants/me/catalog',
          { items: [{ sku: 'p-2' }] },
          g.owner,
        ),
      );
      expect([bad.status, bad.body]).toEqual([badOwn.status, badOwn.body]);
      // an inactive store answers as the merchant route does
      await x(`UPDATE shop_merchants SET status = 'suspended' WHERE merchant_id = $1::uuid`, g.id);
      const sus = await putCatalog(g.slug, [ITEM], PKEY);
      const susOwn = await json(
        await http('PUT', '/api/v1/shop/merchants/me/catalog', { items: [ITEM] }, g.owner),
      );
      expect([sus.status, sus.body.error_code]).toEqual([susOwn.status, susOwn.body.error_code]);
      expect(sus.status).toBeGreaterThanOrEqual(400);
    });

    it('a partner key never authenticates on /merchants/me/*', async () => {
      await granted();
      for (const [method, path] of [
        ['PUT', '/api/v1/shop/merchants/me/catalog'],
        ['GET', '/api/v1/shop/merchants/me/grants'],
        ['GET', '/api/v1/shop/merchants/me/webhooks'],
      ]) {
        const r = await http(method, path, method === 'PUT' ? { items: [ITEM] } : undefined, PKEY);
        expect([path, r.status]).toEqual([path, 401]);
      }
    });
  });

  describe('GET /partners/merchants/:slug/grants', () => {
    it('empty list without grants; the active row with its webhook; revoked_at after revoke; webhook deleted after the merchant deletes it', async () => {
      const m0 = await merchant();
      const e = await json(
        await http('GET', `/api/v1/shop/partners/merchants/${m0.slug}/grants`, undefined, PKEY),
      );
      expect([e.status, e.body]).toEqual([200, { slug: m0.slug, grants: [] }]);
      expect((await http('GET', `/api/v1/shop/partners/merchants/${m0.slug}/grants`)).status).toBe(
        401,
      );
      expect(
        (
          await json(
            await http(
              'GET',
              '/api/v1/shop/partners/merchants/no-such-store-q/grants',
              undefined,
              PKEY,
            ),
          )
        ).body.error_code,
      ).toBe('merchant_not_found');

      const g = await granted();
      const read = async (key = PKEY) =>
        json(await http('GET', `/api/v1/shop/partners/merchants/${g.slug}/grants`, undefined, key));
      const a = await read();
      expect(a.body).toEqual({
        slug: g.slug,
        grants: [
          {
            grant_id: g.grant_id,
            partner: 'soukbase',
            mode: 'partner',
            state: 'active',
            scopes: ['catalog:write', 'webhooks:write', 'quotes:read'],
            signed_at: expect.any(String),
            revoked_at: null,
            webhook: {
              endpoint_id: g.endpoint_id,
              url: REG.delivery_webhook_url,
              events: REG.delivery_events,
              status: 'active',
            },
          },
        ],
      });
      expect(JSON.stringify(a.body)).not.toMatch(/whsec_|mk_live_|pk_live_|0x[0-9a-f]{40}|@/);
      // another partner sees none of it
      expect((await read(OKEY)).body).toEqual({ slug: g.slug, grants: [] });

      // the merchant deletes the grant-owned endpoint with its own key
      const del = await http(
        'DELETE',
        `/api/v1/shop/merchants/me/webhooks/${g.endpoint_id}`,
        undefined,
        g.owner,
      );
      expect(del.status).toBe(200);
      expect((await read()).body.grants[0].webhook.status).toBe('deleted');

      const rv = await http(
        'DELETE',
        '/api/v1/shop/merchants/me/grants/soukbase',
        undefined,
        g.owner,
      );
      expect(rv.status).toBe(200);
      const r = await read();
      expect(r.body.grants[0]).toMatchObject({ state: 'revoked', revoked_at: expect.any(String) });
      // a new grant lists first (active first, then newest)
      expect((await grant(g.acct)).status).toBe(201);
      const both = await read();
      expect(both.body.grants.map((x: Row) => x.state)).toEqual(['active', 'revoked']);
    });
  });

  describe('POST /partners/merchants/:slug/webhook/rotate-secret', () => {
    it('a new secret once: it verifies the next delivery signature, the old one does not', async () => {
      const g = await granted();
      const r = await json(
        await http(
          'POST',
          `/api/v1/shop/partners/merchants/${g.slug}/webhook/rotate-secret`,
          {},
          PKEY,
        ),
      );
      expect(r.status).toBe(200);
      expect(r.body).toEqual({
        endpoint_id: g.endpoint_id,
        url: REG.delivery_webhook_url,
        events: REG.delivery_events,
        secret: expect.stringMatching(/^whsec_[0-9a-f]{32}$/),
      });
      expect(r.body.secret).not.toBe(g.secret);

      const dl = await orderPaid(g.id);
      expect(dl).toEqual([{ endpoint_id: g.endpoint_id }]);
      const sent: WebhookRequest[] = [];
      await deliverDue(
        {
          ...(deps as object),
          resolve: async () => ['93.184.216.34'],
          transport: async (req: WebhookRequest) => {
            sent.push(req);
            return { status: 200, body: Buffer.alloc(0) };
          },
        } as never,
        { nowMs: Date.now() + 1000 },
      );
      const mine = sent.filter((s) => s.target.url.href === REG.delivery_webhook_url);
      expect(mine.length).toBeGreaterThanOrEqual(1);
      const s = mine[mine.length - 1];
      const sig =
        s.headers['X-APIbase-Signature'] ??
        Object.entries(s.headers).find(([k]) => /signature/i.test(k))?.[1];
      const t = Number(/^t=(\d+),/.exec(String(sig))?.[1]);
      expect(sig).toBe(signPayload(r.body.secret, t, s.body));
      expect(sig).not.toBe(signPayload(g.secret, t, s.body));
    });

    it('mode key 404; no grant 403 grant_missing; a deleted endpoint 404', async () => {
      // a live mode-key grant of otherco (inserted the T-0740 way: a key row and a grant row)
      const m = await merchant();
      await deps.transaction(async (tx: any) => {
        const k = await issueKey(tx, m.id, ['catalog:write', 'webhooks:write'], 'grant:otherco');
        await tx.$executeRawUnsafe(
          `INSERT INTO shop_partner_grants (merchant_id, partner_id, key_hash, scopes)
           VALUES ($1::uuid, 'otherco', $2, ARRAY['catalog:write','webhooks:write'])`,
          m.id,
          hashApiKey(k),
        );
      });
      const k = await json(
        await http(
          'POST',
          `/api/v1/shop/partners/merchants/${m.slug}/webhook/rotate-secret`,
          {},
          OKEY,
        ),
      );
      expect([k.status, k.body.error_code, k.body.message]).toEqual([
        404,
        'not_found',
        'no partner-mode webhook for this store',
      ]);
      // mode key partner may still push the catalog while its grant is live (any mode)
      expect((await putCatalog(m.slug, [ITEM], OKEY)).status).toBe(200);
      const none = await json(
        await http(
          'POST',
          `/api/v1/shop/partners/merchants/${m.slug}/webhook/rotate-secret`,
          {},
          PKEY,
        ),
      );
      expect([none.status, none.body.error_code]).toEqual([403, 'grant_missing']);

      const g = await granted();
      await http(
        'DELETE',
        `/api/v1/shop/merchants/me/webhooks/${g.endpoint_id}`,
        undefined,
        g.owner,
      );
      const d = await json(
        await http(
          'POST',
          `/api/v1/shop/partners/merchants/${g.slug}/webhook/rotate-secret`,
          {},
          PKEY,
        ),
      );
      expect([d.status, d.body.error_code]).toEqual([404, 'not_found']);
      const [ep] = await q(
        `SELECT status FROM shop_webhook_endpoints WHERE endpoint_id = $1::uuid`,
        g.endpoint_id,
      );
      expect(ep.status).toBe('deleted');
    });
  });

  describe('revoke in mode partner', () => {
    it('endpoint deleted, no delivery row on the next order.paid, PUT now 403 grant_revoked', async () => {
      const g = await granted();
      expect((await putCatalog(g.slug, [ITEM], PKEY)).status).toBe(200);
      const rv = await json(
        await http('DELETE', '/api/v1/shop/merchants/me/grants/soukbase', undefined, g.owner),
      );
      expect([rv.status, rv.body]).toEqual([200, { partner: 'soukbase', revoked: true }]);
      const [ep] = await q(
        `SELECT status FROM shop_webhook_endpoints WHERE endpoint_id = $1::uuid`,
        g.endpoint_id,
      );
      expect(ep.status).toBe('deleted');
      expect(await orderPaid(g.id)).toEqual([]);
      const r = await putCatalog(g.slug, [{ ...ITEM, title: 'after revoke' }], PKEY);
      expect([r.status, r.body.error_code]).toEqual([403, 'grant_revoked']);
      expect(r.body.revoked_at).toEqual(expect.any(String));
      const [p] = await q(
        `SELECT title FROM shop_products WHERE merchant_id = $1::uuid AND sku = 'p-1'`,
        g.id,
      );
      expect(p.title).toBe('Partner item');
      expect((await readHandoff(g.handoff_id)).grant).toEqual({
        state: 'revoked',
        mode: 'partner',
      });
    });

    it('an undelivered webhook secret is dropped on revoke', async () => {
      const m = await merchant();
      const h = await handoff();
      expect((await grant(m.acct, h)).status).toBe(201);
      expect(
        (await http('DELETE', '/api/v1/shop/merchants/me/grants/soukbase', undefined, m.owner))
          .status,
      ).toBe(200);
      const [row] = await q(
        `SELECT grant_webhook_secret_enc FROM shop_partner_handoffs WHERE handoff_id = $1::uuid`,
        h,
      );
      expect(row.grant_webhook_secret_enc).toBeNull();
      expect((await readHandoff(h)).grant).toEqual({ state: 'revoked', mode: 'partner' });
    });
  });
  // T-0801 ruling-1: a reissue keeps grants of mode partner; an identity change does not.
  describe('T-0801 a shop without keys: owner page, reissue, identity change', () => {
    const signed = async (acct: ReturnType<typeof privateKeyToAccount>, purpose: string) => {
      const r = await http(
        'GET',
        `/api/v1/shop/auth/nonce?wallet=${acct.address}&purpose=${purpose}`,
      );
      expect(r.status).toBe(200);
      const { message } = (await r.json()) as { message: string };
      return { message, signature: await acct.signMessage({ message }) };
    };
    const reissue = async (acct: ReturnType<typeof privateKeyToAccount>) =>
      json(
        await http('POST', '/api/v1/shop/merchants/me/keys/reissue', {
          wallet: acct.address,
          ...(await signed(acct, 'reissue')),
        }),
      );
    const endpoint = async (grant_id: string) =>
      q(
        `SELECT endpoint_id::text AS endpoint_id, url, events, secret_hash, status
           FROM shop_webhook_endpoints WHERE grant_id = $1::uuid ORDER BY endpoint_id`,
        grant_id,
      );
    const handoffRow = async (id: string) =>
      (
        await q(
          `SELECT state, slug, merchant_id::text AS merchant_id, grant_id::text AS grant_id,
                  grant_key_enc, grant_webhook_secret_enc, grant_delivered_at
             FROM shop_partner_handoffs WHERE handoff_id = $1::uuid`,
          id,
        )
      )[0];
    /** The server side of a gated registration: register handoff with the grant asked, bound, then granted. */
    async function gated() {
      const m = await merchant();
      const r = await http(
        'POST',
        '/api/v1/shop/partners/handoffs',
        { mode: 'register', grant_requested: true, expected_wallet: m.acct.address },
        PKEY,
      );
      expect(r.status).toBe(201);
      const h = ((await r.json()) as { handoff_id: string }).handoff_id;
      expect(await bindHandoff(prisma as never, h, m.id, m.slug, m.acct.address)).toBe(true);
      const g = await grant(m.acct, h);
      expect(g.status).toBe(201);
      return { ...m, handoff_id: h, grant_id: g.body.grant_id as string };
    }

    it('the handoff read of a gated registration carries no key field, before and after the secret is taken', async () => {
      const g = await gated();
      const first = await readHandoff(g.handoff_id);
      const later = await readHandoff(g.handoff_id);
      expect(first.state).toBe('granted');
      expect(first.grant).toMatchObject({ state: 'granted', mode: 'partner' });
      expect(first.grant.webhook_secret).toMatch(/^whsec_/);
      expect(later.grant).toEqual({
        state: 'granted',
        mode: 'partner',
        scopes: ['catalog:write', 'webhooks:write', 'quotes:read'],
        delivered: true,
      });
      for (const b of [first, later]) {
        expect(Object.keys(b.grant)).not.toContain('key');
        expect(Object.keys(b)).not.toContain('api_key');
        expect(JSON.stringify(b)).not.toContain('mk_live_');
      }
    });

    it('owner page sign-in with the wallet; reissue returns a key with orders:read; the partner grant, its endpoint and the handoff stay', async () => {
      const g = await gated();
      await readHandoff(g.handoff_id); // the partner took its secret, as in production
      const own = await http('GET', `/m/${g.slug}/owner`);
      expect(own.status).toBe(401);
      const s = await signed(g.acct, 'owner');
      const ok = await fetch(`${base}/m/${g.slug}/owner`, {
        headers: {
          ...xff(),
          'x-owner-message': Buffer.from(s.message).toString('base64'),
          'x-owner-signature': s.signature,
        },
      });
      expect(ok.status).toBe(200);
      expect(ok.headers.get('set-cookie')).toMatch(/HttpOnly/);
      const epBefore = await endpoint(g.grant_id);
      expect(epBefore).toHaveLength(1);
      const hBefore = await handoffRow(g.handoff_id);
      const rs = await reissue(g.acct);
      expect(rs.status).toBe(200);
      const key = rs.body.api_key as string;
      expect(key).toMatch(/^mk_live_/);
      expect((await http('GET', '/api/v1/shop/merchants/me/orders', undefined, key)).status).toBe(
        200,
      );
      expect(
        (await http('GET', '/api/v1/shop/merchants/me/orders', undefined, g.owner)).status,
      ).toBe(401);
      const [gr] = await q(
        `SELECT revoked_at FROM shop_partner_grants WHERE grant_id = $1::uuid`,
        g.grant_id,
      );
      expect(gr.revoked_at).toBeNull();
      expect(await endpoint(g.grant_id)).toEqual(epBefore);
      expect(await handoffRow(g.handoff_id)).toEqual(hBefore);
      expect((await putCatalog(g.slug, [ITEM], PKEY)).status).toBe(200);
      expect((await readHandoff(g.handoff_id)).grant).toMatchObject({
        state: 'granted',
        mode: 'partner',
      });
      // the new key sees the partner's grant and can still end it by hand
      const lg = await json(await http('GET', '/api/v1/shop/merchants/me/grants', undefined, key));
      expect(lg.body.grants.map((x: Row) => x.partner)).toEqual(['soukbase']);
      expect(
        (await http('DELETE', '/api/v1/shop/merchants/me/grants/soukbase', undefined, key)).status,
      ).toBe(200);
      expect((await putCatalog(g.slug, [ITEM], PKEY)).body.error_code).toBe('grant_revoked');
    });

    it('reissue with a live grant of mode key: that grant, its key and its endpoints go, its parked key is dropped (T-0740)', async () => {
      const m = await merchant();
      let gk = '';
      let grant_id = '';
      await deps.transaction(async (tx: any) => {
        gk = await issueKey(tx, m.id, ['catalog:write', 'webhooks:write'], 'grant:otherco');
        const [r] = await tx.$queryRawUnsafe(
          `INSERT INTO shop_partner_grants (merchant_id, partner_id, key_hash, scopes)
           VALUES ($1::uuid, 'otherco', $2, ARRAY['catalog:write','webhooks:write'])
           RETURNING grant_id::text AS grant_id`,
          m.id,
          hashApiKey(gk),
        );
        grant_id = r.grant_id;
      });
      const wh = await json(
        await http(
          'PUT',
          '/api/v1/shop/merchants/me/webhooks',
          { url: 'https://hooks.example/k', events: ['order.paid'] },
          gk,
        ),
      );
      expect(wh.status).toBe(200);
      const h = await handoff();
      await x(
        `UPDATE shop_partner_handoffs SET grant_id = $2::uuid, grant_key_enc = 'enc'
          WHERE handoff_id = $1::uuid`,
        h,
        grant_id,
      );
      expect((await reissue(m.acct)).status).toBe(200);
      const [gr] = await q(
        `SELECT revoked_at FROM shop_partner_grants WHERE grant_id = $1::uuid`,
        grant_id,
      );
      expect(gr.revoked_at).not.toBeNull();
      expect((await http('GET', '/api/v1/shop/merchants/me/webhooks', undefined, gk)).status).toBe(
        401,
      );
      expect((await endpoint(grant_id)).map((e) => e.status)).toEqual(['deleted']);
      expect((await handoffRow(h)).grant_key_enc).toBeNull();
    });

    it('an identity change still revokes a grant of mode partner: the partner route answers 403 grant_revoked', async () => {
      const g = await gated();
      const rec = privateKeyToAccount(generatePrivateKey());
      const nw = privateKeyToAccount(generatePrivateKey());
      await x(
        `UPDATE shop_merchants SET recovery_wallet = $2 WHERE merchant_id = $1::uuid`,
        g.id,
        rec.address.toLowerCase(),
      );
      expect((await putCatalog(g.slug, [ITEM], PKEY)).status).toBe(200);
      const sRec = await signed(rec, 'owner');
      const sNew = await signed(nw, 'owner');
      await deps.transaction((tx: any) =>
        changeIdentity({ db: tx, redis: redis as never }, g.id, {
          new_wallet: nw.address,
          sig_by_recovery: sRec,
          sig_by_new: sNew,
        }),
      );
      const r = await putCatalog(g.slug, [ITEM], PKEY);
      expect([r.status, r.body.error_code]).toEqual([403, 'grant_revoked']);
      expect((await endpoint(g.grant_id)).map((e) => e.status)).toEqual(['deleted']);
    });
  });
});
