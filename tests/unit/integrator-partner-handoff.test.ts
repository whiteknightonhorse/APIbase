/**
 * T-0739: partner handoff (SOUKBASE-A16-1109 ruling-1 A-1) against a real Postgres (TEST_DATABASE_URL,
 * disposable): partner key, create/read, prefilled connect page, register binding, sweeper.
 */
import express from 'express';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { hashApiKey } from '../../src/services/api-key.service';
import { buildSignInMessage, issueNonce } from '../../src/shop/auth/nonce.service';
import { encryptionKeyMessage, registerMerchant } from '../../src/shop/merchant.service';
import { ALLOWED_CATEGORIES } from '../../src/shop/moderation/categories';
import { sweepHandoffs } from '../../src/shop/partner/handoff.service';
import { createIntegratorRouter, type Partner } from '../../src/shop/routes/integrator.router';
import { createPartnerRouter } from '../../src/shop/routes/partner.router';
import { client, dbDescribe, migrate } from './helpers/shop-db';

jest.mock('../../src/config', () => ({ config: {} }));
jest.mock('../../src/config/index', () => ({ config: {} }));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/services/moderation-ban.service', () => ({
  checkBan: async () => ({ banned: false, retryAfterSecs: 0 }),
  recordBlock: async () => undefined,
}));

type Row = Record<string, any>;

const KEY = 'pk_live_' + 'a1'.repeat(16);
const OTHER_KEY = 'pk_live_' + 'b2'.repeat(16);
const PARTNERS: Partner[] = [
  {
    id: 'soukbase',
    name: 'Soukbase',
    site: 'https://soukbase.com',
    return_url: 'https://soukbase.com/sell/apibase/return',
    key_sha256: hashApiKey(KEY),
  },
  {
    id: 'otherco',
    name: 'Other',
    site: 'https://other.example',
    return_url: 'https://other.example/r',
    key_sha256: hashApiKey(OTHER_KEY),
  },
];
const CONNECT_HTML = readFileSync(
  resolve(__dirname, '../../static/integrator/connect.html'),
  'utf-8',
);
const UUID0 = '00000000-0000-0000-0000-000000000000';

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

dbDescribe('T-0739 partner handoff', () => {
  const prisma = client();
  const q = (sql: string, ...v: unknown[]) => prisma.$queryRawUnsafe<Row[]>(sql, ...v);
  let server: ReturnType<express.Express['listen']>;
  let base = '';

  beforeAll(() => {
    migrate();
    const app = express();
    app.use(express.json());
    app.use(createPartnerRouter({ db: prisma as never, partners: () => PARTNERS }));
    app.use(createIntegratorRouter({ limit: 10_000, db: prisma as never }));
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server.close();
    await prisma.$disconnect();
  });

  const create = (body: unknown, key = KEY) =>
    fetch(`${base}/api/v1/shop/partners/handoffs`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  const read = (id: string, key = KEY) =>
    fetch(`${base}/api/v1/shop/partners/handoffs/${id}`, {
      headers: { authorization: `Bearer ${key}` },
    });
  const page = async (qs: string) => (await fetch(`${base}/integrator/connect${qs}`)).text();
  const newHandoff = async (body: Row = {}) => {
    const r = await create(body);
    expect(r.status).toBe(201);
    return (await r.json()) as { handoff_id: string; url: string; expires_at: string };
  };

  describe('partner key', () => {
    it('malformed and unknown keys are 401 partner_key_invalid', async () => {
      for (const auth of [
        undefined,
        'Bearer nope',
        `Bearer ${KEY.slice(0, -1)}`,
        `Basic ${KEY}`,
        `Bearer pk_live_${'c3'.repeat(16)}`,
      ]) {
        const r = await fetch(`${base}/api/v1/shop/partners/handoffs`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
          body: '{}',
        });
        expect([auth, r.status]).toEqual([auth, 401]);
        expect((await r.json()).error_code).toBe('partner_key_invalid');
      }
      const r = await read(UUID0, `pk_live_${'c3'.repeat(16)}`);
      expect(r.status).toBe(401);
    });
  });

  describe('create', () => {
    it('201 with handoff_id, the connect url and expires_at (+24 h)', async () => {
      const h = await newHandoff({ seller_ref: 's-1', expected_wallet: '0x' + 'AB'.repeat(20) });
      expect(h.url).toBe(
        `https://apibase.pro/integrator/connect?from=soukbase&handoff=${h.handoff_id}`,
      );
      const ttl = Date.parse(h.expires_at) - Date.now();
      expect(ttl).toBeGreaterThan(23.9 * 3600_000);
      expect(ttl).toBeLessThanOrEqual(24 * 3600_000);
      const [row] = await q(
        `SELECT expected_wallet, state FROM shop_partner_handoffs WHERE handoff_id = $1::uuid`,
        h.handoff_id,
      );
      expect(row).toEqual({ expected_wallet: '0x' + 'ab'.repeat(20), state: 'created' });
    });

    it('validates each prefill field and names it (422 validation_failed)', async () => {
      const bad: Array<[Row, string]> = [
        [{ prefill: { name: '   ' } }, 'prefill.name'],
        [{ prefill: { site_url: 'http://shop.example' } }, 'prefill.site_url'],
        [{ prefill: { contact_email: 'not-an-email' } }, 'prefill.contact_email'],
        [{ prefill: { category: 'weapons-and-stuff' } }, 'prefill.category'],
        [{ prefill: { country: 'usa' } }, 'prefill.country'],
        [{ prefill: { slug: 'No Caps' } }, 'prefill.slug'],
        [{ prefill: { colour: 'red' } }, 'prefill.colour'],
        [{ prefill: { name: 7 } }, 'prefill.name'],
        [{ expected_wallet: '0x123' }, 'expected_wallet'],
        [{ seller_ref: 'x'.repeat(129) }, 'seller_ref'],
      ];
      for (const [body, field] of bad) {
        const r = await create(body);
        const j = await r.json();
        expect([field, r.status, j.error_code, j.field]).toEqual([
          field,
          422,
          'validation_failed',
          field,
        ]);
      }
      const ok = await create({
        prefill: {
          name: 'Northside Kicks',
          site_url: 'https://northside.example',
          contact_email: 'owner@northside.example',
          category: ALLOWED_CATEGORIES[0],
          country: 'DE',
          slug: 'northside-kicks',
        },
      });
      expect(ok.status).toBe(201);
    });
  });

  describe('read', () => {
    it('shows created, opened, registered and expired; never the prefill or the wallet', async () => {
      const h = await newHandoff({
        seller_ref: 'ref-7',
        prefill: { contact_email: 'p@x.example' },
        expected_wallet: '0x' + '11'.repeat(20),
      });
      const st = async () => (await (await read(h.handoff_id)).json()) as Row;
      let j = await st();
      expect(j.state).toBe('created');
      expect(j.seller_ref).toBe('ref-7');
      const text = JSON.stringify(j);
      expect(text).not.toContain('p@x.example');
      expect(text).not.toMatch(/prefill|expected_wallet|0x1111/);
      expect(j.opened_at).toBeUndefined();

      await page(`?from=soukbase&handoff=${h.handoff_id}`);
      j = await st();
      expect(j.state).toBe('opened');
      expect(typeof j.opened_at).toBe('string');

      const m = await q(`SELECT gen_random_uuid()::text AS id`);
      await prisma.$executeRawUnsafe(
        `UPDATE shop_partner_handoffs SET state = 'registered', merchant_id = $2::uuid, slug = 'bound-shop',
            wallet_match = true, registered_at = now() WHERE handoff_id = $1::uuid`,
        h.handoff_id,
        m[0].id,
      );
      j = await st();
      expect(j).toMatchObject({
        state: 'registered',
        slug: 'bound-shop',
        merchant_id: m[0].id,
        wallet_match: true,
      });

      const e = await newHandoff();
      await prisma.$executeRawUnsafe(
        `UPDATE shop_partner_handoffs SET created_at = now() - interval '25 hours', expires_at = now() - interval '1 hour'
          WHERE handoff_id = $1::uuid`,
        e.handoff_id,
      );
      expect(((await (await read(e.handoff_id)).json()) as Row).state).toBe('expired');
    });

    it("another partner's id and an unknown id are 404", async () => {
      const h = await newHandoff();
      expect((await read(h.handoff_id, OTHER_KEY)).status).toBe(404);
      expect((await read(UUID0)).status).toBe(404);
      expect((await read('not-a-uuid')).status).toBe(404);
    });
  });

  describe('connect page', () => {
    it('a live handoff renders the hidden input, #pf with escaped JSON and the hint; state turns opened', async () => {
      const h = await newHandoff({
        prefill: { name: '</script><b>x', contact_email: 'a@b.example' },
        expected_wallet: '0x' + 'cd'.repeat(20),
      });
      const html = await page(`?from=soukbase&handoff=${h.handoff_id}`);
      expect(html).toContain(
        `<input type="hidden" name="handoff" value="${h.handoff_id}" data-partner="Soukbase" form="f">`,
      );
      const pf = /<script type="application\/json" id="pf">([^<]*)<\/script>/.exec(html);
      expect(pf).not.toBeNull();
      expect(pf![1]).toContain('\\u003c/script\\u003e\\u003cb\\u003ex');
      expect(JSON.parse(pf![1])).toEqual({
        prefill: { name: '</script><b>x', contact_email: 'a@b.example' },
        expected_wallet: '0x' + 'cd'.repeat(20),
        mode: 'register', // T-0740
        grant_requested: false,
      });
      expect(html).toContain('Prefilled from Soukbase. Check the values and continue.');
      expect(html).not.toContain('no longer valid');
      const [row] = await q(
        `SELECT state, opened_at FROM shop_partner_handoffs WHERE handoff_id = $1::uuid`,
        h.handoff_id,
      );
      expect(row.state).toBe('opened');
      // opened once: a second open keeps opened_at
      await page(`?from=soukbase&handoff=${h.handoff_id}`);
      const [again] = await q(
        `SELECT opened_at FROM shop_partner_handoffs WHERE handoff_id = $1::uuid`,
        h.handoff_id,
      );
      expect(again.opened_at).toEqual(row.opened_at);
    });

    it('expired, foreign, registered and malformed handoffs render the plain page plus the hint, no echo', async () => {
      const plain = await page('?from=soukbase');
      const expired = await newHandoff();
      await prisma.$executeRawUnsafe(
        `UPDATE shop_partner_handoffs SET expires_at = now() - interval '1 second' WHERE handoff_id = $1::uuid`,
        expired.handoff_id,
      );
      const foreign = (await (await create({}, OTHER_KEY)).json()) as { handoff_id: string };
      const registered = await newHandoff();
      await prisma.$executeRawUnsafe(
        `UPDATE shop_partner_handoffs SET state = 'registered' WHERE handoff_id = $1::uuid`,
        registered.handoff_id,
      );
      const hint =
        '<p class="hint">This link from Soukbase is no longer valid. You can still connect your store and return there.</p>';
      for (const id of [
        expired.handoff_id,
        foreign.handoff_id,
        registered.handoff_id,
        UUID0,
        '%3Cscript%3Ex',
        'nope',
      ]) {
        const html = await page(`?from=soukbase&handoff=${id}`);
        expect(html).toBe(plain.replace('It costs nothing.</p>', `It costs nothing.</p>${hint}`));
        expect(html).not.toContain(decodeURIComponent(id));
        expect(html).not.toContain('id="pf"');
      }
      const [f] = await q(
        `SELECT state FROM shop_partner_handoffs WHERE handoff_id = $1::uuid`,
        foreign.handoff_id,
      );
      expect(f.state).toBe('created');
    });

    it('the page without a handoff is unchanged: no hint, no #pf, no handoff input', async () => {
      const plain = await page('');
      expect(await page('?from=nobody&handoff=' + UUID0)).toBe(plain);
      for (const qs of ['', '?from=soukbase']) {
        const html = await page(qs);
        expect(html).not.toContain('no longer valid');
        expect(html).not.toContain('Prefilled from');
        expect(html).not.toContain('id="pf"');
        expect(html).not.toContain('name="handoff"');
        expect(html).not.toContain('{{HANDOFF_HINT}}');
      }
    });

    it('the Continue href carries apibase_slug and handoff; the register body carries handoff_id', () => {
      expect(CONNECT_HTML).toContain(
        "pt.dataset.return + '?apibase_slug=' + encodeURIComponent(slug) + (F.handoff ? '&handoff=' + encodeURIComponent(F.handoff.value) : '')",
      );
      expect(CONNECT_HTML).toContain('handoff_id: x.handoff');
      expect(CONNECT_HTML).toContain("'⚠ Different wallet'");
      expect(CONNECT_HTML).toContain("'Continue with this wallet'");
      expect(CONNECT_HTML).toContain(
        ' may require them to match. Switch the wallet in your wallet app, or continue with this one.',
      );
    });
  });

  describe('register binding', () => {
    const redis = new FakeRedis();
    const register = async (
      handoff_id: unknown,
      wallet = privateKeyToAccount(generatePrivateKey()),
    ) => {
      const nonce = await issueNonce(wallet.address, redis as never);
      const message = buildSignInMessage({
        address: wallet.address,
        purpose: 'register',
        nonce,
        issuedAt: new Date().toISOString(),
      });
      const k = { kid: 'k1', alg: 'x25519', pub: 'AAAA' };
      const slug = 'hs-' + wallet.address.slice(2, 10).toLowerCase();
      const r = await registerMerchant(
        {
          wallet: wallet.address,
          slug,
          name: 'Handoff Shop',
          category: ALLOWED_CATEGORIES[0],
          country: 'DE',
          contact_email: 'h@shop.example',
          site_url: 'https://shop.example',
          encryption_key: {
            ...k,
            sig_by_wallet: await wallet.signMessage({ message: encryptionKeyMessage(k) }),
          },
          handoff_id,
          signed: { message, signature: await wallet.signMessage({ message }) },
        },
        { db: prisma as never, redis: redis as never, path: '/api/v1/shop/merchants' },
      );
      return { ...r, slug, wallet: wallet.address.toLowerCase() };
    };
    const row = async (id: string) =>
      (await q(`SELECT * FROM shop_partner_handoffs WHERE handoff_id = $1::uuid`, id))[0];
    const staleEvents = async () =>
      Number(
        (
          await q(
            `SELECT count(*)::int AS n FROM shop_connect_events WHERE error_code = 'handoff_stale'`,
          )
        )[0].n,
      );

    it('a live handoff binds: registered, slug, merchant_id, wallet_match true, prefill nulled', async () => {
      const w = privateKeyToAccount(generatePrivateKey());
      const h = await newHandoff({
        prefill: { contact_email: 'h@shop.example' },
        expected_wallet: w.address,
      });
      await page(`?from=soukbase&handoff=${h.handoff_id}`);
      const r = await register(h.handoff_id, w);
      const b = await row(h.handoff_id);
      expect(b).toMatchObject({
        state: 'registered',
        slug: r.slug,
        merchant_id: r.merchant_id,
        wallet_match: true,
        prefill: null,
      });
      expect(b.registered_at).toBeInstanceOf(Date);
      const j = (await (await read(h.handoff_id)).json()) as Row;
      expect(j).toMatchObject({ state: 'registered', slug: r.slug, wallet_match: true });
      expect(JSON.stringify(j)).not.toContain(r.wallet);
    });

    it('a different signing wallet binds with wallet_match false (a warning, never a refusal)', async () => {
      const h = await newHandoff({ expected_wallet: '0x' + '22'.repeat(20) });
      const r = await register(h.handoff_id);
      expect(r.status).toBe('pending');
      expect(await row(h.handoff_id)).toMatchObject({ state: 'registered', wallet_match: false });
    });

    it('a handoff without expected_wallet binds with wallet_match true', async () => {
      const h = await newHandoff();
      await register(h.handoff_id);
      expect(await row(h.handoff_id)).toMatchObject({ state: 'registered', wallet_match: true });
    });

    it('a stale (expired) handoff: registration succeeds, the handoff stays unbound, one handoff_stale event', async () => {
      const h = await newHandoff({ prefill: { slug: 'stale-one' } });
      await prisma.$executeRawUnsafe(
        `UPDATE shop_partner_handoffs SET expires_at = now() - interval '1 second' WHERE handoff_id = $1::uuid`,
        h.handoff_id,
      );
      const before = await staleEvents();
      const r = await register(h.handoff_id);
      expect(r.status).toBe('pending');
      const b = await row(h.handoff_id);
      expect(b.state).toBe('created');
      expect(b.merchant_id).toBeNull();
      expect(await staleEvents()).toBe(before + 1);
      // an unknown uuid is stale too; a malformed id is ignored (never an error, no event)
      await register(UUID0);
      expect(await staleEvents()).toBe(before + 2);
      await register('not-a-uuid');
      await register(undefined);
      expect(await staleEvents()).toBe(before + 2);
    });

    it('an already registered handoff is not rebound', async () => {
      const h = await newHandoff();
      const first = await register(h.handoff_id);
      await register(h.handoff_id);
      expect((await row(h.handoff_id)).merchant_id).toBe(first.merchant_id);
    });
  });

  describe('sweeper', () => {
    it('nulls the prefill of expired handoffs and deletes rows older than 30 days', async () => {
      const live = await newHandoff({ prefill: { contact_email: 'live@x.example' } });
      const old = await newHandoff({ prefill: { contact_email: 'old@x.example' } });
      const ancient = await newHandoff({ prefill: { contact_email: 'anc@x.example' } });
      await prisma.$executeRawUnsafe(
        `UPDATE shop_partner_handoffs SET created_at = now() - interval '2 days', expires_at = now() - interval '1 day'
          WHERE handoff_id = $1::uuid`,
        old.handoff_id,
      );
      await prisma.$executeRawUnsafe(
        `UPDATE shop_partner_handoffs SET created_at = now() - interval '31 days', expires_at = now() - interval '30 days'
          WHERE handoff_id = $1::uuid`,
        ancient.handoff_id,
      );
      const r = await sweepHandoffs(prisma as never, new Date());
      expect(r.prefill_nulled).toBeGreaterThanOrEqual(1);
      expect(r.deleted).toBeGreaterThanOrEqual(1);
      const rows = await q(
        `SELECT handoff_id::text AS id, prefill FROM shop_partner_handoffs WHERE handoff_id = ANY($1::uuid[])`,
        [live.handoff_id, old.handoff_id, ancient.handoff_id],
      );
      const by = Object.fromEntries(rows.map((x) => [x.id, x.prefill]));
      expect(by[live.handoff_id]).toEqual({ contact_email: 'live@x.example' });
      expect(by[old.handoff_id]).toBeNull();
      expect(ancient.handoff_id in by).toBe(false);
    });
  });
});
