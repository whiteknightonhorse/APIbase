/**
 * T-0802 (SELLER-LIVE-1112 ruling-3): a partner handoff that asked for the grant is signed once.
 * The message (no DB) and the route against a real Postgres (TEST_DATABASE_URL, disposable): one
 * verification, one transaction writing the encryption key, the registration, one acceptance per
 * document and the grant with the same message and signature, the handoff `granted`; refusals write
 * nothing; the API key follows the registry `seller_keys`; revoke and reissue afterwards.
 */
import express from 'express';
import type { AddressInfo } from 'node:net';
import { randomBytes } from 'node:crypto';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { hashApiKey } from '../../src/services/api-key.service';
import { grantMessage } from '../../src/shop/auth/nonce.service';
import { acceptTermsMessage, type ShopDeps } from '../../src/shop/merchant-lifecycle.service';
import { encryptionKeyMessage } from '../../src/shop/merchant.service';
import {
  handoffMessage,
  statementsMessage,
  type HandoffNonceRecord,
} from '../../src/shop/partner/one-signature.service';
import {
  partners as committedPartners,
  type Partner,
} from '../../src/shop/routes/integrator.router';
import { createMerchantRouter } from '../../src/shop/routes/merchant.router';
import { createOwnerRouter } from '../../src/shop/routes/owner.router';
import { createPartnerRouter } from '../../src/shop/routes/partner.router';
import { client, dbDescribe, migrate } from './helpers/shop-db';

jest.mock('../../src/config', () => ({ config: { ENCRYPTION_KEY: 'k'.repeat(40) } }));
jest.mock('../../src/config/index', () => ({ config: { ENCRYPTION_KEY: 'k'.repeat(40) } }));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../src/services/moderation-ban.service', () => ({
  checkBan: async () => ({ banned: false, retryAfterSecs: 0 }),
  recordBlock: async () => undefined,
}));
// the committed registry (soukbase: mode partner, seller_keys hidden) plus a mode-partner partner
// that keeps the keys shown, for the other branch of item 3
jest.mock('../../src/shop/routes/integrator.router', () => {
  const actual = jest.requireActual('../../src/shop/routes/integrator.router');
  const extra = {
    id: 'shownco',
    name: 'Shown Co',
    site: 'https://shown.example',
    return_url: 'https://shown.example/r',
    key_sha256: 'e'.repeat(64),
    grant_mode: 'partner',
    delivery_webhook_url: 'https://shown.example/hook',
    delivery_events: ['order.paid'],
    seller_keys: 'shown',
  };
  return { ...actual, partners: () => [...actual.partners(), extra] };
});

type Row = Record<string, any>;

const DOCS = [
  { doc_id: 'merchant-agreement', version: '2.1', sha256: 'a'.repeat(64) },
  { doc_id: 'aup', version: '1.5', sha256: 'b'.repeat(64) },
  { doc_id: 'dpa', version: '1.0', sha256: 'c'.repeat(64) },
  { doc_id: 'refund-framework', version: '1.2', sha256: 'd'.repeat(64) },
];
const REC: HandoffNonceRecord = {
  address: '0x' + 'Ab'.repeat(20),
  handoff_id: '11111111-2222-3333-4444-555555555555',
  partner_id: 'soukbase',
  slug: 'north-shop',
  kid: 'k1',
  alg: 'x25519',
  pub: 'P'.repeat(43) + '=',
  docs: DOCS,
  nonce: 'f'.repeat(32),
  issued_at: '2026-11-12T12:00:00.000Z',
};

describe('T-0802 the one message (no DB)', () => {
  const m = handoffMessage(REC, { id: 'soukbase', name: 'Soukbase' });
  const lines = m.split('\n');

  it('first line says what is done for which shop; then key, registration, documents, permission, nonce, time', () => {
    expect(lines[0]).toBe(
      'apibase.pro: open the shop apibase.pro/m/north-shop and allow Soukbase to act for it',
    );
    const at = (h: string) => lines.indexOf(h);
    const order = [
      '1. Encryption key of the shop',
      '2. Registration',
      '3. I accept the APIbase documents',
      '4. Permission for Soukbase',
    ].map(at);
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(lines.slice(-2)).toEqual([`Nonce: ${REC.nonce}`, `Issued At: ${REC.issued_at}`]);
  });

  it('holds every value of the four statements, with the words of the per-purpose messages', () => {
    // the key lines are the per-purpose key text without its first line
    for (const l of encryptionKeyMessage(REC).split('\n').slice(1)) expect(lines).toContain(l);
    expect(lines).toContain(`Address: ${REC.address}`);
    expect(lines).toContain('Purpose: register');
    for (const d of DOCS) expect(lines).toContain(`${d.doc_id} v${d.version} sha256:${d.sha256}`);
    // Partner, Allows, Does not allow, Revoke: the per-purpose grant text, word for word
    const g = grantMessage({
      partnerName: 'Soukbase',
      partnerId: 'soukbase',
      wallet: REC.address,
      nonce: REC.nonce,
      issuedAt: REC.issued_at,
    }).split('\n');
    for (const l of g.slice(2, 6)) expect(lines).toContain(l);
    expect(lines).toContain('Does not allow: payouts, keys, orders, refunds');
    expect(lines).toContain('Revoke any time: DELETE /api/v1/shop/merchants/me/grants/soukbase');
    // and it is none of the per-purpose messages
    expect(m).not.toBe(
      acceptTermsMessage(DOCS, { wallet: REC.address, nonce: REC.nonce, time: REC.issued_at }),
    );
    expect(m.startsWith('apibase.pro wants you to sign in')).toBe(false);
    expect(m.startsWith('apibase.pro: allow')).toBe(false);
  });

  it('the builder takes any list of statements, numbered in order', () => {
    expect(
      statementsMessage({
        title: 'T',
        statements: [
          { heading: 'A', lines: ['a: 1'] },
          { heading: 'B', lines: [] },
        ],
        nonce: 'n',
        issuedAt: 't',
      }),
    ).toBe('T\n1. A\na: 1\n2. B\nNonce: n\nIssued At: t');
  });
});

dbDescribe('T-0802 POST /merchants/handoff (one signature)', () => {
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
  let clock = Date.now();
  const deps = {
    db: prisma as never,
    transaction: (fn: (tx: never) => Promise<unknown>) =>
      prisma.$transaction((tx) => fn(tx as never)),
    redis: redis as never,
    now: () => clock,
    resolve: async () => ['93.184.216.34'],
  } as unknown as ShopDeps;
  const PKEY = 'pk_live_' + 'c3'.repeat(16);
  const SKEY = 'pk_live_' + 'e5'.repeat(16);
  const SOUK = committedPartners().find((p) => p.id === 'soukbase') as Partner;
  const SHOWN = committedPartners().find((p) => p.id === 'shownco') as Partner;
  const PARTNERS: Partner[] = [
    { ...SOUK, key_sha256: hashApiKey(PKEY) },
    { ...SHOWN, key_sha256: hashApiKey(SKEY) },
  ];
  let server: ReturnType<express.Express['listen']>;
  let base = '';
  let n = 0;
  const tag = () => `os-${Date.now().toString(36)}${n++}`;

  beforeAll(async () => {
    migrate();
    for (const d of DOCS) {
      await x(
        `INSERT INTO shop_legal_docs (doc_id, version, sha256, url, effective_from, body_md)
         VALUES ($1, $2, $3, $4, now() - interval '1 day', 'b') ON CONFLICT DO NOTHING`,
        d.doc_id,
        d.version,
        d.sha256,
        `/legal/${d.doc_id}`,
      );
    }
    const app = express();
    app.set('trust proxy', true);
    app.use(express.json());
    app.use(
      createPartnerRouter({ db: prisma as never, partners: () => PARTNERS, deps: deps as never }),
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
  beforeEach(() => {
    clock = Date.now();
  });

  let ip = 0;
  const http = (method: string, path: string, body?: unknown, key?: string) =>
    fetch(`${base}${path}`, {
      method,
      headers: {
        'x-forwarded-for': `10.8.${(ip >> 8) & 255}.${ip++ & 255}`,
        'content-type': 'application/json',
        ...(key ? { authorization: `Bearer ${key}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const json = async (r: Response) => ({ status: r.status, body: (await r.json()) as Row });
  type Acct = ReturnType<typeof privateKeyToAccount>;

  async function handoff(acct: Acct, key = PKEY) {
    const r = await http(
      'POST',
      '/api/v1/shop/partners/handoffs',
      { mode: 'register', grant_requested: true, expected_wallet: acct.address },
      key,
    );
    expect(r.status).toBe(201);
    return ((await r.json()) as { handoff_id: string }).handoff_id;
  }
  async function nonce(acct: Acct, h: string, slug: string, pub: string) {
    return json(
      await http(
        'GET',
        `/api/v1/shop/auth/nonce?purpose=handoff&wallet=${acct.address}&handoff=${h}&slug=${slug}&kid=k1&pub=${encodeURIComponent(pub)}`,
      ),
    );
  }
  const fields = (slug: string, acct: Acct) => ({
    slug,
    name: 'One Sig Shop',
    category: 'digital-goods',
    country: 'DE',
    contact_email: 'owner@example.org',
    site_url: 'https://example.org',
    payout_wallet_base: acct.address,
    payout_wallet_tempo: acct.address,
  });
  /** the whole page flow; `edit` changes the message or the signer before the POST */
  async function flow(
    o: {
      key?: string;
      signer?: Acct;
      tamper?: (m: string) => string;
      before?: () => void;
    } = {},
  ) {
    const acct = privateKeyToAccount(generatePrivateKey());
    const h = await handoff(acct, o.key);
    const slug = tag();
    const pub = randomBytes(32).toString('base64');
    const nr = await nonce(acct, h, slug, pub);
    expect(nr.status).toBe(200);
    const message = o.tamper ? o.tamper(nr.body.message) : (nr.body.message as string);
    const signature = await (o.signer ?? acct).signMessage({ message });
    o.before?.();
    const body = { wallet: acct.address, ...fields(slug, acct), handoff_id: h, message, signature };
    const r = await json(await http('POST', '/api/v1/shop/merchants/handoff', body));
    return { acct, h, slug, pub, message: nr.body.message as string, signature, body, r };
  }
  const nothingWritten = async (acct: Acct, h: string) => {
    expect(
      await q(`SELECT 1 FROM shop_merchants WHERE wallet_address = $1`, acct.address.toLowerCase()),
    ).toHaveLength(0);
    const [hr] = await q(
      `SELECT state, merchant_id, grant_id FROM shop_partner_handoffs WHERE handoff_id = $1::uuid`,
      h,
    );
    expect(hr).toEqual({ state: 'created', merchant_id: null, grant_id: null });
  };

  it('a valid signature writes the four kinds of record with the same message and signature; handoff granted; keys hidden -> no key field, no key minted', async () => {
    const f = await flow();
    expect(f.r.status).toBe(201);
    expect(f.r.body).toEqual({
      merchant_id: expect.any(String),
      slug: f.slug,
      status: 'active',
      handoff: { handoff_id: f.h, state: 'granted' },
      grant: {
        grant_id: expect.any(String),
        partner: 'soukbase',
        mode: 'partner',
        scopes: ['catalog:write', 'webhooks:write'],
        created_at: expect.any(String),
      },
    });
    expect(Object.keys(f.r.body)).not.toContain('api_key');
    expect(JSON.stringify(f.r.body)).not.toContain('mk_live_');
    const id = f.r.body.merchant_id;
    const [m] = await q(
      `SELECT status, wallet_address, encryption_key, register_message, register_signature
         FROM shop_merchants WHERE merchant_id = $1::uuid`,
      id,
    );
    expect(m.status).toBe('active');
    expect(m.wallet_address).toBe(f.acct.address.toLowerCase());
    expect(m.register_message).toBe(f.message);
    expect(m.register_signature).toBe(f.signature);
    expect(m.encryption_key).toEqual({
      kid: 'k1',
      alg: 'x25519',
      pub: f.pub,
      sig_by_wallet: f.signature,
      signed_message: f.message,
    });
    const acc = await q(
      `SELECT doc_id, version, sha256, method, signer, signature, message FROM shop_acceptances
        WHERE merchant_id = $1::uuid ORDER BY doc_id`,
      id,
    );
    expect(acc.map((a) => a.doc_id)).toEqual([
      'aup',
      'dpa',
      'merchant-agreement',
      'refund-framework',
    ]);
    for (const a of acc) {
      expect(a).toMatchObject({
        method: 'checkbox+wallet_signature',
        signature: f.signature,
        message: f.message,
      });
      expect(a.signer).toBe(f.acct.address.toLowerCase());
    }
    const [g] = await q(
      `SELECT partner_id, mode, proof_message, proof_signature, revoked_at FROM shop_partner_grants
        WHERE merchant_id = $1::uuid`,
      id,
    );
    expect(g).toEqual({
      partner_id: 'soukbase',
      mode: 'partner',
      proof_message: f.message,
      proof_signature: f.signature,
      revoked_at: null,
    });
    expect(
      await q(`SELECT 1 FROM shop_merchant_keys WHERE merchant_id = $1::uuid`, id),
    ).toHaveLength(0);
    const [h] = await q(
      `SELECT state, slug, wallet_match, registered_at IS NOT NULL AS reg FROM shop_partner_handoffs WHERE handoff_id = $1::uuid`,
      f.h,
    );
    expect(h).toEqual({ state: 'granted', slug: f.slug, wallet_match: true, reg: true });
    // the partner's read: granted, the webhook secret once, never a merchant key
    const rd = await json(
      await http('GET', `/api/v1/shop/partners/handoffs/${f.h}`, undefined, PKEY),
    );
    expect(rd.body.state).toBe('granted');
    expect(rd.body.grant.webhook_secret).toMatch(/^whsec_/);
    expect(JSON.stringify(rd.body)).not.toContain('mk_live_');
  });

  it('keys shown: the answer carries the API key once and it works', async () => {
    const f = await flow({ key: SKEY });
    expect(f.r.status).toBe(201);
    expect(f.r.body.api_key).toMatch(/^mk_live_/);
    expect(f.r.body.grant.partner).toBe('shownco');
    expect(
      (await http('GET', '/api/v1/shop/merchants/me/orders', undefined, f.r.body.api_key)).status,
    ).toBe(200);
  });

  it('a message changed by one byte is refused and nothing is written', async () => {
    const f = await flow({ tamper: (m) => m.replace('Purpose: register', 'Purpose: registeR') });
    expect(f.r.status).toBe(401);
    await nothingWritten(f.acct, f.h);
  });

  it('an expired nonce is refused and nothing is written', async () => {
    const f = await flow({ before: () => (clock += 301_000) });
    expect(f.r.status).toBe(401);
    expect(f.r.body.message).toMatch(/expired/);
    await nothingWritten(f.acct, f.h);
  });

  it('another signer is refused and nothing is written', async () => {
    const f = await flow({ signer: privateKeyToAccount(generatePrivateKey()) });
    expect(f.r.status).toBe(401);
    await nothingWritten(f.acct, f.h);
  });

  it('a reused nonce is refused and nothing more is written', async () => {
    const f = await flow();
    expect(f.r.status).toBe(201);
    const count = async (t: string) =>
      Number(
        (
          await q(
            `SELECT count(*)::int AS n FROM ${t} WHERE merchant_id = $1::uuid`,
            f.r.body.merchant_id,
          )
        )[0].n,
      );
    const before = [await count('shop_acceptances'), await count('shop_partner_grants')];
    const again = await json(await http('POST', '/api/v1/shop/merchants/handoff', f.body));
    expect(again.status).toBe(401);
    expect(again.body.message).toMatch(/nonce unknown, expired or used/);
    expect([await count('shop_acceptances'), await count('shop_partner_grants')]).toEqual(before);
  });

  it('a wallet other than the expected one gets no message; a used handoff gets none either', async () => {
    const acct = privateKeyToAccount(generatePrivateKey());
    const h = await handoff(acct);
    const other = privateKeyToAccount(generatePrivateKey());
    const pub = randomBytes(32).toString('base64');
    expect((await nonce(other, h, tag(), pub)).status).toBe(401);
    const f = await flow();
    // the used handoff is no longer live; a new handoff for a wallet that has a store: wallet_registered
    const used = await nonce(f.acct, f.h, tag(), pub);
    expect(used.status).toBe(422);
    expect(used.body.field).toBe('handoff');
    const again = await nonce(f.acct, await handoff(f.acct), tag(), pub);
    expect(again.status).toBe(409);
    expect(again.body.error_code).toBe('wallet_registered');
    // a free wallet, a free slug, but a slug that is taken: slug_taken before anything is signed
    const fresh = privateKeyToAccount(generatePrivateKey());
    const taken = await nonce(fresh, await handoff(fresh), f.slug, pub);
    expect(taken.body.error_code).toBe('slug_taken');
  });

  it('revoke removes the permission only: key, registration and acceptance stay', async () => {
    const f = await flow();
    const id = f.r.body.merchant_id;
    const ns = await json(
      await http('GET', `/api/v1/shop/auth/nonce?wallet=${f.acct.address}&purpose=reissue`),
    );
    const rs = await json(
      await http('POST', '/api/v1/shop/merchants/me/keys/reissue', {
        wallet: f.acct.address,
        message: ns.body.message,
        signature: await f.acct.signMessage({ message: ns.body.message }),
      }),
    );
    expect(rs.status).toBe(200);
    const snap = async () =>
      (
        await q(
          `SELECT status, encryption_key, register_message, register_signature,
                (SELECT count(*)::int FROM shop_acceptances a WHERE a.merchant_id = m.merchant_id) AS acc
           FROM shop_merchants m WHERE merchant_id = $1::uuid`,
          id,
        )
      )[0];
    const before = await snap();
    expect(
      (
        await http(
          'DELETE',
          '/api/v1/shop/merchants/me/grants/soukbase',
          undefined,
          rs.body.api_key,
        )
      ).status,
    ).toBe(200);
    expect(await snap()).toEqual(before);
    expect(before.acc).toBe(4);
    const [g] = await q(
      `SELECT revoked_at, proof_message FROM shop_partner_grants WHERE merchant_id = $1::uuid`,
      id,
    );
    expect(g.revoked_at).not.toBeNull();
    expect(g.proof_message).toBe(f.message);
  });

  it('a reissue after a one-signature registration returns a working key and leaves the grant', async () => {
    const f = await flow();
    const ns = await json(
      await http('GET', `/api/v1/shop/auth/nonce?wallet=${f.acct.address}&purpose=reissue`),
    );
    const rs = await json(
      await http('POST', '/api/v1/shop/merchants/me/keys/reissue', {
        wallet: f.acct.address,
        message: ns.body.message,
        signature: await f.acct.signMessage({ message: ns.body.message }),
      }),
    );
    expect(rs.status).toBe(200);
    expect(
      (await http('GET', '/api/v1/shop/merchants/me/orders', undefined, rs.body.api_key)).status,
    ).toBe(200);
    const [g] = await q(
      `SELECT revoked_at FROM shop_partner_grants WHERE merchant_id = $1::uuid`,
      f.r.body.merchant_id,
    );
    expect(g.revoked_at).toBeNull();
    const put = await json(
      await http(
        'PUT',
        `/api/v1/shop/partners/merchants/${f.slug}/catalog`,
        {
          items: [
            { sku: 'p-1', title: 'Item', description: 'ok', price_usd: 5, category: 'books' },
          ],
        },
        PKEY,
      ),
    );
    expect(put.status).toBe(200);
  });
});
