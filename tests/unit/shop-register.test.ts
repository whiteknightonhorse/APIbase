/** T-INT-03 RG1-RG10. In-memory ShopTx/Redis fakes; real viem EIP-191 signatures. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { logger } from '../../src/config/logger';
import type { ApiErrorResponse } from '../../src/types/errors';
import { buildSignInMessage, issueNonce } from '../../src/shop/auth/nonce.service';
import {
  encryptionKeyMessage,
  registerMerchant,
  type RegisterCtx,
  type RegisterInput,
} from '../../src/shop/merchant.service';
import { ALLOWED_CATEGORIES } from '../../src/shop/moderation/categories';
import { isRestrictedIp } from '../../src/shop/moderation/countries';
import { addressesFromCsv, syncOfacSdn } from '../../src/shop/moderation/sanctions';

// adapters/ofac -> base.adapter -> config validates the full env at import; no env here.
jest.mock('../../src/config', () => ({ config: {} }));
jest.mock('../../src/services/moderation-ban.service', () => ({
  checkBan: async () => ({ banned: false, retryAfterSecs: 0 }),
  recordBlock: async () => undefined,
}));

let clock = 1_800_000_000_000;
const now = () => clock;

class FakeRedis {
  m = new Map<string, { v: string; exp: number }>();
  async set(k: string, v: string, _m: 'EX', s: number) {
    this.m.set(k, { v, exp: now() + s * 1000 });
  }
  async getdel(k: string) {
    const e = this.m.get(k);
    this.m.delete(k);
    return e && e.exp > now() ? e.v : null;
  }
  c = new Map<string, number>();
  async incr(k: string) {
    this.c.set(k, (this.c.get(k) ?? 0) + 1);
    return this.c.get(k)!;
  }
  async expire() {
    return 1;
  }
}

function fakeDb(sanctioned: string[] = []) {
  const merchants: Array<Record<string, unknown>> = [];
  const reviews: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];
  const addrs = new Set(sanctioned);
  const db = {
    async $queryRawUnsafe<T = unknown>(sql: string, ...v: unknown[]): Promise<T> {
      if (sql.includes('FROM shop_sanctioned_addresses'))
        return (addrs.has(v[0] as string) ? [{ x: 1 }] : []) as T;
      if (sql.includes('SELECT slug, wallet_address'))
        return merchants.filter((m) => m.slug === v[0] || m.wallet_address === v[1]) as T;
      if (sql.includes('INSERT INTO agents')) return [{ agent_id: 'agent-' + v[0] }] as T;
      if (sql.includes('INSERT INTO shop_merchants')) {
        const deactivated = sql.includes("'deactivated'");
        const row = deactivated
          ? {
              slug: v[0],
              wallet_address: v[5],
              registration_ip_country: v[4],
              status: 'deactivated',
              status_reason: 'payout_wallet_sanctioned',
            }
          : {
              slug: v[0],
              category: v[2],
              wallet_address: v[5],
              registration_ip_country: v[4],
              payout_wallet_base: v[6],
              contact_email: v[10],
              status: 'pending',
              limits: JSON.parse(v[12] as string),
              agent_id: v[14],
            };
        const merchant_id = `m-${merchants.length + 1}`;
        merchants.push({ merchant_id, ...row });
        return [{ merchant_id }] as T;
      }
      throw new Error('unexpected ' + sql);
    },
    async $executeRawUnsafe(sql: string, ...v: unknown[]) {
      if (sql.includes('INTO shop_moderation_reviews'))
        reviews.push({
          merchant_id: v[0],
          verdict: sql.includes("'reject'") ? 'reject' : 'ok',
          category: sql.includes("'ofac'") ? 'ofac' : null,
        });
      else if (sql.includes('INTO shop_connect_events'))
        events.push({ identity_hash: v[0], ip_prefix: v[4], error_code: v[5], path: v[6] });
      else if (sql.includes('INTO shop_sanctioned_addresses'))
        (v[0] as string[]).forEach((a) => addrs.add(a));
      else throw new Error('unexpected ' + sql);
      return 1;
    },
  };
  return { db, merchants, reviews, events, addrs };
}

async function build(
  over: Partial<RegisterInput> = {},
  wallet = privateKeyToAccount(generatePrivateKey()),
  redis = new FakeRedis(),
) {
  const kid = 'k1',
    alg = 'x25519',
    pub = 'AAAA';
  const base: Omit<RegisterInput, 'signed'> = {
    wallet: wallet.address,
    slug: 'shop-' + wallet.address.slice(2, 8).toLowerCase(),
    name: 'Shop',
    category: 'digital-goods',
    country: 'DE',
    contact_email: 'secret.person@example.org',
    site_url: 'https://example.org',
    encryption_key: {
      kid,
      alg,
      pub,
      sig_by_wallet: await wallet.signMessage({ message: encryptionKeyMessage({ kid, alg, pub }) }),
    },
  };
  const nonce = await issueNonce(wallet.address, redis as never);
  const message = buildSignInMessage({
    address: wallet.address,
    purpose: 'register',
    nonce,
    issuedAt: new Date(now()).toISOString(),
  });
  const signed = { message, signature: await wallet.signMessage({ message }) };
  return { input: { ...base, signed, ...over } as RegisterInput, wallet, redis };
}
const ctxOf = (
  db: ReturnType<typeof fakeDb>['db'],
  redis: FakeRedis,
  extra: Partial<RegisterCtx> = {},
): RegisterCtx => ({ db, redis: redis as never, now, ip: '203.0.113.7', ...extra });

beforeEach(() => {
  clock = 1_800_000_000_000;
});

describe('RG1/RG2 countries', () => {
  it('IR -> 403 country_not_supported, no merchant row, one event', async () => {
    const f = fakeDb();
    const { input, redis } = await build({ country: 'IR' });
    await expect(registerMerchant(input, ctxOf(f.db, redis))).rejects.toMatchObject({
      status: 403,
      error_code: 'country_not_supported',
      documentation_url: '/legal/aup',
    });
    expect(f.merchants).toHaveLength(0);
    expect(f.events).toHaveLength(1);
    expect(f.events[0].error_code).toBe('country_not_supported');
  });
  it('DE + IP UA-43 -> 403; IP UA-65 -> ok with registration_ip_country UA', async () => {
    const f = fakeDb();
    const a = await build();
    await expect(
      registerMerchant(a.input, ctxOf(f.db, a.redis, { ip_country: 'UA', ip_region: '43' })),
    ).rejects.toMatchObject({ status: 403 });
    const b = await build();
    await registerMerchant(b.input, ctxOf(f.db, b.redis, { ip_country: 'UA', ip_region: '65' }));
    expect(f.merchants[0].registration_ip_country).toBe('UA');
    expect(isRestrictedIp('IR')).toBe(true);
    expect(isRestrictedIp('UA', '65')).toBe(false);
  });
  it('all 25 entity codes -> 403; US/DE/JP ok', async () => {
    const codes = JSON.parse(
      readFileSync(
        resolve(__dirname, '../../config/integrator/countries-restricted.json'),
        'utf-8',
      ),
    ).restricted_entity_countries;
    expect(codes).toHaveLength(25);
    for (const country of codes) {
      const f = fakeDb();
      const { input, redis } = await build({ country });
      await expect(
        registerMerchant(input, ctxOf(f.db, redis, { ip: undefined })),
      ).rejects.toMatchObject({ error_code: 'country_not_supported' });
    }
    for (const country of ['US', 'DE', 'JP']) {
      const f = fakeDb();
      const { input, redis } = await build({ country });
      await expect(
        registerMerchant(input, ctxOf(f.db, redis, { ip: undefined })),
      ).resolves.toMatchObject({ status: 'pending' });
    }
  });
});

describe('RG3 category', () => {
  it('gambling -> 403 with 3 alternatives; digital-goods ok', async () => {
    const f = fakeDb();
    const { input, redis } = await build({ category: 'gambling' });
    const err = await registerMerchant(input, ctxOf(f.db, redis)).catch((e) => e);
    expect(err).toMatchObject({ status: 403, error_code: 'category_prohibited' });
    expect(err.alternatives).toHaveLength(3);
    expect(err.documentation_url).toContain('/legal/aup');
    err.alternatives.forEach((a: { value: string }) =>
      expect(ALLOWED_CATEGORIES).toContain(a.value),
    );
    const ok = await build({ category: 'digital-goods' });
    await expect(registerMerchant(ok.input, ctxOf(f.db, ok.redis))).resolves.toBeDefined();
  });
});

const FIXTURE_ADDR = '0xDEAD00000000000000000000000000000000BEEF';
const SDN_CSV =
  `1001,"TEST, ENTITY","individual","CYBER2",-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,"Digital Currency Address - ETH ${FIXTURE_ADDR}; Digital Currency Address - XBT bc1qtest; Linked To: X."\n` +
  `1002,"NO ADDR","entity","SDGT",-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,"Website x.example"\n`;

describe('RG4 OFAC', () => {
  it('sync on fixture is lowercase and idempotent; payout from SDN -> 403 + review', async () => {
    const f = fakeDb();
    expect(addressesFromCsv(SDN_CSV)).toEqual([FIXTURE_ADDR.toLowerCase(), 'bc1qtest']);
    await syncOfacSdn(f.db, async () => ({ sdn: SDN_CSV, alt: '' }));
    await syncOfacSdn(f.db, async () => ({ sdn: SDN_CSV, alt: '' }));
    expect(f.addrs.has(FIXTURE_ADDR.toLowerCase())).toBe(true);
    expect(f.addrs.size).toBe(2);
    const { input, redis } = await build({ payout_wallet: FIXTURE_ADDR });
    await expect(registerMerchant(input, ctxOf(f.db, redis))).rejects.toMatchObject({
      status: 403,
      message: 'payout wallet cannot be used',
    });
    expect(f.reviews).toContainEqual(
      expect.objectContaining({ verdict: 'reject', category: 'ofac' }),
    );
  });
  it('source unavailable -> previous rows stay', async () => {
    const f = fakeDb([FIXTURE_ADDR.toLowerCase()]);
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    await expect(
      syncOfacSdn(f.db, async () => {
        throw new Error('down');
      }),
    ).resolves.toBeNull();
    expect(f.addrs.size).toBe(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('RG5/RG6/RG7/RG8', () => {
  it('RG5 bad signature -> 401, event; three refusals share identity_hash', async () => {
    const f = fakeDb();
    const a = await build();
    a.input.signed.signature = a.input.signed.signature.replace(/.$/, (c) =>
      c === '0' ? '1' : '0',
    );
    await expect(registerMerchant(a.input, ctxOf(f.db, a.redis))).rejects.toMatchObject({
      status: 401,
    });
    expect(f.events).toHaveLength(1);
    const w = privateKeyToAccount(generatePrivateKey());
    const redis = new FakeRedis();
    for (let i = 0; i < 3; i++) {
      const { input } = await build({ country: 'IR' }, w, redis);
      await registerMerchant(input, ctxOf(f.db, redis)).catch(() => undefined);
    }
    const hashes = f.events.slice(1).map((e) => e.identity_hash);
    expect(hashes).toHaveLength(3);
    expect(new Set(hashes).size).toBe(1);
  });
  it('RG6 encryption key not signed by wallet -> 422', async () => {
    const f = fakeDb();
    const other = privateKeyToAccount(generatePrivateKey());
    const { input, redis } = await build();
    input.encryption_key.sig_by_wallet = await other.signMessage({
      message: encryptionKeyMessage(input.encryption_key),
    });
    await expect(registerMerchant(input, ctxOf(f.db, redis))).rejects.toMatchObject({
      status: 422,
    });
  });
  it('RG7 6th registration from one IP in an hour -> 429', async () => {
    const f = fakeDb();
    const redis = new FakeRedis();
    for (let i = 0; i < 5; i++) {
      const { input } = await build({}, undefined, redis);
      await registerMerchant(input, ctxOf(f.db, redis));
    }
    const { input } = await build({}, undefined, redis);
    await expect(registerMerchant(input, ctxOf(f.db, redis))).rejects.toMatchObject({
      status: 429,
    });
  });
  it('RG8 success -> pending, limits, agent_id, email not logged', async () => {
    const f = fakeDb();
    const spies = (['info', 'warn', 'error', 'debug'] as const).map((l) =>
      jest.spyOn(logger, l).mockImplementation(() => logger),
    );
    const { input, redis } = await build();
    const r = await registerMerchant(input, ctxOf(f.db, redis));
    expect(r.status).toBe('pending');
    expect(r.agent_id).toBeTruthy();
    expect(f.merchants[0]).toMatchObject({
      status: 'pending',
      limits: expect.objectContaining({
        max_order_usd: 10000,
        new_merchant_cap_usd: 200,
        quote_ttl_s: 900,
      }),
    });
    expect(f.reviews).toContainEqual(expect.objectContaining({ verdict: 'ok' }));
    expect(JSON.stringify(spies.flatMap((s) => s.mock.calls))).not.toContain('secret.person');
    spies.forEach((s) => s.mockRestore());
  });
});

describe('RG9/RG10 files and types', () => {
  it('countries-restricted.json is byte-for-byte the approved text', () => {
    const buf = readFileSync(
      resolve(__dirname, '../../config/integrator/countries-restricted.json'),
    );
    expect(createHash('sha256').update(buf).digest('hex')).toBe(
      'bcb8e8f52a7b35baf51d79f2ba9312d4fe028d229ff81f088bbba29694a8cf20',
    );
  });
  it('prohibited-categories.json valid, allowed ∩ prohibited = ∅', () => {
    const j = JSON.parse(
      readFileSync(
        resolve(__dirname, '../../config/integrator/prohibited-categories.json'),
        'utf-8',
      ),
    );
    expect(j.allowed.length).toBeGreaterThanOrEqual(3);
    const bad = new Set(j.prohibited.map((p: { slug: string }) => p.slug));
    j.prohibited.forEach((p: { slug: string; text: string }) => expect(p.text).toBeTruthy());
    expect(j.allowed.filter((a: string) => bad.has(a))).toEqual([]);
  });
  it('alternatives is optional on ApiErrorResponse', () => {
    const e: ApiErrorResponse = {
      error: 'forbidden',
      error_code: 'x',
      message: 'm',
      request_id: 'r',
      suggested_action: 'fix_request',
      documentation_url: '/d',
    };
    expect(e.alternatives).toBeUndefined();
  });
});
