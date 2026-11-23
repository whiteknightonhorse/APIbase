/**
 * T-0871 (REQUEST-SOUKBASE-R5-3-1116 ruling-1): the one registration signature collected on the
 * partner's own page. The text (no DB), the registry flag, and both partner routes against a real
 * Postgres (TEST_DATABASE_URL, disposable): every refusal with its status, code and field; a second
 * text kills the first; a spent text and another signer are 401 and write nothing; a good signature
 * writes an active store with the placeholder key, four acceptances, the grant and a `granted`
 * handoff, and no key of any kind reaches either answer.
 */
import express from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { hashApiKey } from '../../src/services/api-key.service';
import { GRANT_ALLOWS_LINE } from '../../src/shop/auth/nonce.service';
import type { ShopDeps } from '../../src/shop/merchant-lifecycle.service';
import {
  documentsStatement,
  encryptionKeyStatement,
  isPublicIp,
  partnerPageMessage,
  permissionStatement,
  placeholderEncryptionKey,
  type HandoffNonceRecord,
} from '../../src/shop/partner/one-signature.service';
import {
  loadPartners,
  partners as committedPartners,
  type Partner,
} from '../../src/shop/routes/integrator.router';
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
// the country of the seller's address: 5.62.1.1 is in a restricted country, anything else in FR
jest.mock('../../src/shop/geo-lookup', () => ({
  countryOf: (ip: unknown) => (ip === '5.62.1.1' ? 'IR' : typeof ip === 'string' ? 'FR' : null),
}));

type Row = Record<string, any>;

const DOCS = [
  { doc_id: 'merchant-agreement', version: '2.1', sha256: 'a'.repeat(64) },
  { doc_id: 'aup', version: '1.5', sha256: 'b'.repeat(64) },
  { doc_id: 'dpa', version: '1.0', sha256: 'c'.repeat(64) },
  { doc_id: 'refund-framework', version: '1.2', sha256: 'd'.repeat(64) },
];
const HID = '11111111-2222-4333-8444-555555555555';
const SOUK = { id: 'soukbase', name: 'Soukbase', site: 'https://soukbase.com' };
const REC: HandoffNonceRecord = {
  address: '0x' + 'Ab'.repeat(20),
  handoff_id: HID,
  partner_id: 'soukbase',
  slug: 'north-shop',
  ...placeholderEncryptionKey(HID),
  docs: DOCS,
  nonce: 'f'.repeat(32),
  issued_at: '2026-11-16T12:00:00.000Z',
};

describe('T-0871 the partner-page text (no DB)', () => {
  const m = partnerPageMessage(REC, SOUK);
  const lines = m.split('\n');

  it('first line names the host of the partner site; then the five plain lines (T-0942: the stop line)', () => {
    expect(lines[0]).toBe(
      'APIbase (apibase.pro), asked on soukbase.com: open my shop apibase.pro/m/north-shop and let Soukbase sell for it.',
    );
    expect(lines.slice(1, 6)).toEqual([
      'I accept the four APIbase documents: Merchant Agreement v2.1, Acceptable Use Policy v1.5, Data Processing Addendum v1.0, Refund Framework v1.2. Texts: https://apibase.pro/legal',
      `Soukbase may: ${GRANT_ALLOWS_LINE.replace(/^Allows: /, '')}. It may not touch payouts, keys, orders or refunds.`,
      'You can stop this any time at apibase.pro/integrator/permissions.',
      'Payouts go to this wallet. The shop starts without a decryption key.',
      'This is a signature only: no transaction, no payment, no gas.',
    ]);
  });

  it('T-0942: the stop line appears once, right after the may line; the Revoke any time line is unchanged', () => {
    const stop = 'You can stop this any time at apibase.pro/integrator/permissions.';
    expect(lines.filter((l) => l === stop)).toHaveLength(1);
    expect(lines[lines.indexOf(stop) - 1].startsWith('Soukbase may: ')).toBe(true);
    expect(lines).toContain('Revoke any time: DELETE /api/v1/shop/merchants/me/grants/soukbase');
  });

  it('lines 2 to 6 carry no base64 and no hash', () => {
    for (const l of lines.slice(1, 6)) {
      expect(l).not.toMatch(/[A-Za-z0-9+/]{43}=/);
      expect(l).not.toMatch(/sha256:/);
      expect(l).not.toMatch(/[0-9a-f]{32,}/i);
    }
  });

  it('Technical details: registration with the handoff, documents, permission, key; then nonce and time', () => {
    expect(lines[6]).toBe('Technical details');
    const expected = [
      '1. Registration',
      `Address: ${REC.address}`,
      'Purpose: register',
      `Handoff: ${HID}`,
      ...[documentsStatement(DOCS), permissionStatement(SOUK), encryptionKeyStatement(REC)].flatMap(
        (s, i) => [`${i + 2}. ${s.heading}`, ...s.lines],
      ),
      `Nonce: ${REC.nonce}`,
      `Issued At: ${REC.issued_at}`,
    ];
    expect(lines.slice(7)).toEqual(expected);
  });

  it('the placeholder key: kid none-<id>, x25519, pub = base64 sha256 of the fixed text and the lower-case id', () => {
    const k = placeholderEncryptionKey(HID.toUpperCase());
    expect(k.kid).toBe(`none-${HID}`);
    expect(k.alg).toBe('x25519');
    const pub = createHash('sha256')
      .update(Buffer.from(`apibase.pro shop without a decryption key\n${HID}`, 'utf8'))
      .digest('base64');
    expect(k.pub).toBe(pub);
    expect(Buffer.from(k.pub, 'base64')).toHaveLength(32);
    expect(placeholderEncryptionKey(HID)).toEqual(k); // deterministic
    expect(lines).toContain(`kid: none-${HID}`);
    expect(lines).toContain(`pub: ${pub}`);
  });

  it('seller_ip: public unicast only', () => {
    for (const ok of ['81.2.69.142', '8.8.8.8', '2a00:1450:4001:81b::200e', '::ffff:81.2.69.142'])
      expect([ok, isPublicIp(ok)]).toEqual([ok, true]);
    for (const bad of [
      '10.1.2.3',
      '172.16.0.1',
      '192.168.1.1',
      '127.0.0.1',
      '169.254.1.1',
      '100.64.0.1',
      '0.0.0.0',
      '224.0.0.1',
      '255.255.255.255',
      '::',
      '::1',
      'fe80::1',
      'fc00::1',
      'fd12:3456::1',
      '::ffff:10.0.0.1',
      '::ffff:7f00:1',
      'example.com',
      '',
      '1.2.3',
      7,
      null,
    ])
      expect([bad, isPublicIp(bad)]).toEqual([bad, false]);
  });
});

describe('T-0871 registry: partner_page_signature', () => {
  const d = mkdtempSync(join(tmpdir(), 'pps-'));
  const load = (entry: Row) => {
    const f = join(d, `${randomUUID()}.json`);
    writeFileSync(f, JSON.stringify([entry]));
    return loadPartners(f);
  };
  const pm = {
    id: 'ab',
    name: 'A',
    site: 'https://a.io',
    return_url: 'https://a.io/r',
    key_sha256: 'a'.repeat(64),
    grant_mode: 'partner',
    delivery_webhook_url: 'https://a.io/h',
    delivery_events: ['order.paid'],
  };

  it('absent = false; true loads with seller_keys hidden; with shown, absent seller_keys or a non-boolean the start stops', () => {
    expect(load({ ...pm, seller_keys: 'hidden' })[0].partner_page_signature).toBe(false);
    expect(
      load({ ...pm, seller_keys: 'hidden', partner_page_signature: true })[0]
        .partner_page_signature,
    ).toBe(true);
    expect(() => load({ ...pm, seller_keys: 'shown', partner_page_signature: true })).toThrow(
      /partner_page_signature needs seller_keys hidden/,
    );
    expect(() => load({ ...pm, partner_page_signature: true })).toThrow(
      /partner_page_signature needs seller_keys hidden/,
    );
    for (const v of ['true', 1, null, ['x']])
      expect(() => load({ ...pm, seller_keys: 'hidden', partner_page_signature: v })).toThrow(
        /bad field partner_page_signature/,
      );
  });

  it('the committed soukbase entry has the flag', () => {
    expect(committedPartners().find((p) => p.id === 'soukbase')?.partner_page_signature).toBe(true);
  });
});

dbDescribe('T-0871 signature-text and registration (partner key)', () => {
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
  const deps = {
    db: prisma as never,
    transaction: (fn: (tx: never) => Promise<unknown>) =>
      prisma.$transaction((tx) => fn(tx as never)),
    redis: redis as never,
    resolve: async () => ['93.184.216.34'],
  } as unknown as ShopDeps;
  const base = committedPartners().find((p) => p.id === 'soukbase') as Partner;
  // several keys per partner: the per-key write limiter (60/min) is not what this suite tests
  const keys = (p: string) => [0, 1, 2, 3, 4, 5].map((i) => `pk_live_${p}${i}`.padEnd(40, '0'));
  const SOUK_KEYS = keys('a1');
  const TWO_KEYS = keys('b2');
  const OFF_KEYS = keys('c3');
  const PARTNERS: Partner[] = [
    ...SOUK_KEYS.map((k) => ({ ...base, key_sha256: hashApiKey(k) })),
    // a second partner with the flag (a handoff of soukbase is not its handoff)
    ...TWO_KEYS.map((k) => ({
      ...base,
      id: 'pagetwo',
      name: 'Page Two',
      site: 'https://two.example',
      key_sha256: hashApiKey(k),
    })),
    // the same kind of partner without the flag
    ...OFF_KEYS.map((k) => ({
      ...base,
      id: 'pageoff',
      name: 'Page Off',
      site: 'https://off.example',
      partner_page_signature: false,
      key_sha256: hashApiKey(k),
    })),
  ];
  let n = 0;
  const rr = (ks: string[]) => ks[n++ % ks.length];
  let server: ReturnType<express.Express['listen']>;
  let url = '';
  const tag = () => `pp-${Date.now().toString(36)}${n++}`;

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
    server = app.listen(0);
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server.close();
    await prisma.$disconnect();
  });

  let ip = 0;
  const http = (method: string, path: string, body: unknown, key: string) =>
    fetch(`${url}${path}`, {
      method,
      headers: {
        'x-forwarded-for': `10.9.${(ip >> 8) & 255}.${ip++ & 255}`,
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const json = async (r: Response) => ({ status: r.status, body: (await r.json()) as Row });
  type Acct = ReturnType<typeof privateKeyToAccount>;
  const prefillOf = (slug: string) => ({
    name: 'Page Sig Shop',
    site_url: 'https://example.org',
    contact_email: 'owner@example.org',
    category: 'digital-goods',
    country: 'DE',
    slug,
  });

  async function handoff(acct: Acct | null, over: Row = {}, ks = SOUK_KEYS) {
    const slug = tag();
    const r = await json(
      await http(
        'POST',
        '/api/v1/shop/partners/handoffs',
        {
          mode: 'register',
          grant_requested: true,
          ...(acct ? { expected_wallet: acct.address } : {}),
          prefill: prefillOf(slug),
          ...over,
        },
        rr(ks),
      ),
    );
    expect(r.status).toBe(201);
    return { h: r.body.handoff_id as string, slug };
  }
  const text = async (h: string, body: unknown, ks = SOUK_KEYS) =>
    json(await http('POST', `/api/v1/shop/partners/handoffs/${h}/signature-text`, body, rr(ks)));
  const register = async (h: string, body: unknown, ks = SOUK_KEYS) =>
    json(await http('POST', `/api/v1/shop/partners/handoffs/${h}/registration`, body, rr(ks)));
  const SELLER_IP = '81.2.69.142';

  /** handoff, text, signature; `o` changes the signer or the body before the registration */
  async function flow(
    o: {
      signer?: Acct;
      body?: (b: Row) => Row;
      ks?: string[];
      before?: (h: string) => Promise<void>;
    } = {},
  ) {
    const acct = privateKeyToAccount(generatePrivateKey());
    const { h, slug } = await handoff(acct);
    const t = await text(h, { wallet: acct.address });
    expect(t.status).toBe(200);
    const message = t.body.message as string;
    const signature = await (o.signer ?? acct).signMessage({ message });
    await o.before?.(h);
    const b0 = {
      wallet: acct.address,
      signature,
      seller_ip: SELLER_IP,
      seller_user_agent: 'Mozilla/5.0 test',
    };
    const r = await register(h, o.body ? o.body(b0) : b0, o.ks);
    return { acct, h, slug, t, message, signature, r };
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
  const refusal = (r: { status: number; body: Row }) => [r.status, r.body.error_code, r.body.field];

  it('success: active store, placeholder key, four acceptances, grant, handoff granted, no key in either answer', async () => {
    const f = await flow();
    expect(f.t.body).toEqual({
      handoff_id: f.h,
      message: f.message,
      issued_at: expect.any(String),
      expires_in: 300,
    });
    expect(f.message.split('\n')[0]).toBe(
      `APIbase (apibase.pro), asked on soukbase.com: open my shop apibase.pro/m/${f.slug} and let Soukbase sell for it.`,
    );
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
        scopes: ['catalog:write', 'webhooks:write', 'quotes:read'],
        created_at: expect.any(String),
      },
    });
    for (const a of [f.t.body, f.r.body])
      expect(JSON.stringify(a)).not.toMatch(/mk_live_|whsec_|api_key|pk_live_/);
    const id = f.r.body.merchant_id;
    const lower = f.acct.address.toLowerCase();
    const [m] = await q(
      `SELECT status, wallet_address, payout_wallet_base, payout_wallet_tempo, recovery_wallet,
              support_email, name, site_url, contact_email, category, country,
              registration_ip_country, encryption_key, register_message, register_signature
         FROM shop_merchants WHERE merchant_id = $1::uuid`,
      id,
    );
    expect(m).toEqual({
      status: 'active',
      wallet_address: lower,
      payout_wallet_base: lower,
      payout_wallet_tempo: lower,
      recovery_wallet: null,
      support_email: null,
      ...(({ slug: _s, ...rest }) => rest)(prefillOf(f.slug)),
      registration_ip_country: 'FR',
      encryption_key: {
        ...placeholderEncryptionKey(f.h),
        sig_by_wallet: f.signature,
        signed_message: f.message,
      },
      register_message: f.message,
      register_signature: f.signature,
    });
    const acc = await q(
      `SELECT doc_id, method, signer, signature, message, ip_hash, user_agent FROM shop_acceptances
        WHERE merchant_id = $1::uuid ORDER BY doc_id`,
      id,
    );
    expect(acc.map((a) => a.doc_id)).toEqual([
      'aup',
      'dpa',
      'merchant-agreement',
      'refund-framework',
    ]);
    for (const a of acc)
      expect(a).toEqual({
        doc_id: a.doc_id,
        method: 'wallet_signature',
        signer: lower,
        signature: f.signature,
        message: f.message,
        ip_hash: createHash('sha256').update(SELLER_IP).digest('hex'),
        user_agent: 'Mozilla/5.0 test',
      });
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
      `SELECT state, slug, wallet_match, prefill FROM shop_partner_handoffs WHERE handoff_id = $1::uuid`,
      f.h,
    );
    expect(h).toEqual({ state: 'granted', slug: f.slug, wallet_match: true, prefill: null });
    // a spent text: 401, nothing more written
    const again = await register(f.h, {
      wallet: f.acct.address,
      signature: f.signature,
      seller_ip: SELLER_IP,
    });
    expect(refusal(again)).toEqual([401, 'unauthorized', undefined]);
    expect(again.body.message).toMatch(/nonce unknown, expired or used/);
  });

  it('a seller_ip in a restricted country is 403 country_not_supported and writes nothing', async () => {
    const f = await flow({ body: (b) => ({ ...b, seller_ip: '5.62.1.1' }) });
    expect(refusal(f.r)).toEqual([403, 'country_not_supported', undefined]);
    await nothingWritten(f.acct, f.h);
  });

  it('a signature by another wallet is 401 and writes nothing; the text is then spent', async () => {
    const f = await flow({ signer: privateKeyToAccount(generatePrivateKey()) });
    expect(refusal(f.r)).toEqual([401, 'unauthorized', undefined]);
    await nothingWritten(f.acct, f.h);
    const good = await register(f.h, {
      wallet: f.acct.address,
      signature: await f.acct.signMessage({ message: f.message }),
      seller_ip: SELLER_IP,
    });
    expect(refusal(good)).toEqual([401, 'unauthorized', undefined]);
    await nothingWritten(f.acct, f.h);
  });

  it('a second text kills the first', async () => {
    const acct = privateKeyToAccount(generatePrivateKey());
    const { h } = await handoff(acct);
    const t1 = await text(h, { wallet: acct.address });
    const t2 = await text(h, { wallet: acct.address });
    expect([t1.status, t2.status]).toEqual([200, 200]);
    expect(t2.body.message).not.toBe(t1.body.message);
    const old = await register(h, {
      wallet: acct.address,
      signature: await acct.signMessage({ message: t1.body.message }),
      seller_ip: SELLER_IP,
    });
    expect(refusal(old)).toEqual([401, 'unauthorized', undefined]);
    await nothingWritten(acct, h);
    // a fresh text after the refusal registers
    const t3 = await text(h, { wallet: acct.address });
    const ok = await register(h, {
      wallet: acct.address,
      signature: await acct.signMessage({ message: t3.body.message }),
      seller_ip: SELLER_IP,
    });
    expect(ok.status).toBe(201);
  });

  it('signature-text refusals: status, code and field', async () => {
    const acct = privateKeyToAccount(generatePrivateKey());
    const { h } = await handoff(acct);
    const w = { wallet: acct.address };
    expect(refusal(await text(h, { ...w, slug: 'x' }))).toEqual([422, 'validation_failed', 'slug']);
    expect(refusal(await text(h, { wallet: '0x12' }))).toEqual([
      422,
      'validation_failed',
      'wallet',
    ]);
    expect(refusal(await text(h, {}))).toEqual([422, 'validation_failed', 'wallet']);
    expect(refusal(await text(h, w, OFF_KEYS))).toEqual([
      403,
      'partner_page_signature_off',
      undefined,
    ]);
    expect(refusal(await text(h, w, TWO_KEYS))).toEqual([404, 'not_found', undefined]);
    expect(refusal(await text(randomUUID(), w))).toEqual([404, 'not_found', undefined]);
    expect(refusal(await text('not-a-uuid', w))).toEqual([404, 'not_found', undefined]);
    // not live, mode grant, no grant asked
    const expired = await handoff(acct);
    await x(
      `UPDATE shop_partner_handoffs SET expires_at = now() - interval '1 second' WHERE handoff_id = $1::uuid`,
      expired.h,
    );
    for (const hh of [
      expired.h,
      (await handoff(acct, { mode: 'grant', grant_requested: false })).h,
      (await handoff(acct, { grant_requested: false })).h,
    ])
      expect(refusal(await text(hh, w))).toEqual([422, 'validation_failed', 'handoff']);
    expect(refusal(await text((await handoff(null)).h, w))).toEqual([
      422,
      'validation_failed',
      'expected_wallet',
    ]);
    const noCountry = await handoff(acct, {
      prefill: (({ country: _c, ...rest }) => rest)(prefillOf(tag())),
    });
    expect(refusal(await text(noCountry.h, w))).toEqual([
      422,
      'validation_failed',
      'prefill.country',
    ]);
    const noPrefill = await handoff(acct, { prefill: undefined });
    expect(refusal(await text(noPrefill.h, w))).toEqual([422, 'validation_failed', 'prefill.name']);
    // another wallet than expected_wallet
    const other = privateKeyToAccount(generatePrivateKey());
    expect(refusal(await text(h, { wallet: other.address }))).toEqual([
      401,
      'unauthorized',
      undefined,
    ]);
    // wallet or slug already taken, before anything is signed
    const done = await flow();
    expect(done.r.status).toBe(201);
    const again = await handoff(done.acct);
    expect(refusal(await text(again.h, { wallet: done.acct.address }))).toEqual([
      409,
      'wallet_registered',
      undefined,
    ]);
    const taken = await handoff(acct, { prefill: prefillOf(done.slug) });
    expect(refusal(await text(taken.h, w))).toEqual([409, 'slug_taken', undefined]);
  });

  it('registration refusals: status, code and field; each writes nothing', async () => {
    const acct = privateKeyToAccount(generatePrivateKey());
    const { h } = await handoff(acct);
    const sig = '0x' + 'ab'.repeat(65);
    const b = { wallet: acct.address, signature: sig, seller_ip: SELLER_IP };
    expect(refusal(await register(h, { ...b, payout_wallet_base: acct.address }))).toEqual([
      422,
      'validation_failed',
      'payout_wallet_base',
    ]);
    expect(refusal(await register(h, { ...b, message: 'x' }))).toEqual([
      422,
      'validation_failed',
      'message',
    ]);
    expect(refusal(await register(h, { ...b, wallet: 'nope' }))).toEqual([
      422,
      'validation_failed',
      'wallet',
    ]);
    expect(refusal(await register(h, { ...b, signature: 'zz' }))).toEqual([
      422,
      'validation_failed',
      'signature',
    ]);
    for (const seller_ip of [
      undefined,
      '10.0.0.1',
      '127.0.0.1',
      '100.64.1.1',
      'fe80::1',
      '::1',
      'x',
    ])
      expect(refusal(await register(h, { ...b, seller_ip }))).toEqual([
        422,
        'validation_failed',
        'seller_ip',
      ]);
    expect(refusal(await register(h, { ...b, seller_user_agent: 'u'.repeat(513) }))).toEqual([
      422,
      'validation_failed',
      'seller_user_agent',
    ]);
    expect(refusal(await register(h, b, OFF_KEYS))).toEqual([
      403,
      'partner_page_signature_off',
      undefined,
    ]);
    expect(refusal(await register('not-a-uuid', b))).toEqual([404, 'not_found', undefined]);
    // no text issued
    expect(refusal(await register(h, b))).toEqual([401, 'unauthorized', undefined]);
    await nothingWritten(acct, h);
  });

  it('registration: a handoff of another partner is 404; a wallet other than the text is 401', async () => {
    const two = await flow({ ks: TWO_KEYS });
    expect(refusal(two.r)).toEqual([404, 'not_found', undefined]);
    await nothingWritten(two.acct, two.h);
    const other = privateKeyToAccount(generatePrivateKey());
    const w = await flow({ body: (b) => ({ ...b, wallet: other.address }) });
    expect(refusal(w.r)).toEqual([401, 'unauthorized', undefined]);
    await nothingWritten(w.acct, w.h);
  });

  it('registration: the handoff no longer live is 422 handoff; a changed prefill slug is 422 prefill.slug', async () => {
    const dead = await flow({
      before: async (h) => {
        await x(
          `UPDATE shop_partner_handoffs SET expires_at = now() - interval '1 second' WHERE handoff_id = $1::uuid`,
          h,
        );
      },
    });
    expect(refusal(dead.r)).toEqual([422, 'validation_failed', 'handoff']);
    expect(
      await q(
        `SELECT 1 FROM shop_merchants WHERE wallet_address = $1`,
        dead.acct.address.toLowerCase(),
      ),
    ).toHaveLength(0);
    const acct = privateKeyToAccount(generatePrivateKey());
    const { h } = await handoff(acct);
    const t = await text(h, { wallet: acct.address });
    await x(
      `UPDATE shop_partner_handoffs SET prefill = jsonb_set(prefill, '{slug}', '"other-slug-x"') WHERE handoff_id = $1::uuid`,
      h,
    );
    const r = await register(h, {
      wallet: acct.address,
      signature: await acct.signMessage({ message: t.body.message }),
      seller_ip: SELLER_IP,
    });
    expect(refusal(r)).toEqual([422, 'validation_failed', 'prefill.slug']);
    await nothingWritten(acct, h);
  });

  it('registration: a document changed after the text is 428 terms_not_accepted', async () => {
    let added = false;
    try {
      const f = await flow({
        before: async () => {
          await x(
            `INSERT INTO shop_legal_docs (doc_id, version, sha256, url, effective_from, body_md)
             VALUES ('dpa', '9.9', $1, '/legal/dpa', now() - interval '1 second', 'b')`,
            'e'.repeat(64),
          );
          added = true;
        },
      });
      expect(refusal(f.r)).toEqual([428, 'terms_not_accepted', undefined]);
      await nothingWritten(f.acct, f.h);
    } finally {
      if (added) await x(`DELETE FROM shop_legal_docs WHERE doc_id = 'dpa' AND version = '9.9'`);
    }
  });
});
