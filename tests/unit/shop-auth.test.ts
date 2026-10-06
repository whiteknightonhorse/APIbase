/** T-INT-02 ID1-ID9. In-memory ShopTx/Redis fakes; real viem EIP-191 signatures. */
import express from 'express';
import type { AddressInfo } from 'node:net';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { generateApiKey, hashApiKey } from '../../src/services/api-key.service';
import { redactObject } from '../../src/config/logger';
import {
  buildSignInMessage,
  issueNonce,
  verifyWalletSignature,
  type NonceRedis,
  type SignPurpose,
} from '../../src/shop/auth/nonce.service';
import { createMerchantRouter, PROBE_LIMIT_PER_MIN } from '../../src/shop/routes/merchant.router';
import { issueKey, requireMerchantKey } from '../../src/shop/auth/merchant-key.service';
import {
  changeIdentity,
  currentPayout,
  reissueKeys,
  requestPayoutChange,
  rotateKey,
} from '../../src/shop/auth/identity.service';

jest.mock('../../src/config', () => ({ config: {} }));

class FakeRedis implements NonceRedis {
  m = new Map<string, { v: string; exp: number }>();
  constructor(public now: () => number) {}
  async set(k: string, v: string, _m: 'EX', s: number) {
    this.m.set(k, { v, exp: this.now() + s * 1000 });
  }
  async getdel(k: string) {
    const e = this.m.get(k);
    this.m.delete(k);
    return e && e.exp > this.now() ? e.v : null;
  }
}

let clock = 1_800_000_000_000;
const now = () => clock;
const acct = () => privateKeyToAccount(generatePrivateKey());

async function sign(a: ReturnType<typeof acct>, redis: NonceRedis, purpose: SignPurpose) {
  const nonce = await issueNonce(a.address, redis);
  const message = buildSignInMessage({
    address: a.address,
    purpose,
    nonce,
    issuedAt: new Date(now()).toISOString(),
  });
  return { message, signature: await a.signMessage({ message }) };
}

// --- tiny SQL-dispatching fake -------------------------------------------------------------
function fakeDb(seed: { merchant: Record<string, unknown>; sanctioned?: string[] }) {
  const merchant = seed.merchant;
  const keys: Array<{
    key_hash: string;
    merchant_id: string;
    scopes: string[];
    revoked_at: Date | null;
  }> = [];
  const outbox: Array<{ event_type: string; payload: unknown }> = [];
  const q = async (sql: string, ...v: unknown[]): Promise<unknown> => {
    if (sql.includes('FROM shop_merchant_keys'))
      return keys.filter((k) => k.key_hash === v[0] && !k.revoked_at);
    if (sql.includes('FROM shop_sanctioned_addresses'))
      return (seed.sanctioned ?? []).includes(v[0] as string) ? [{ x: 1 }] : [];
    if (sql.includes('FROM outbox')) return [];
    if (sql.includes('FROM shop_merchants')) return [merchant];
    throw new Error('unexpected ' + sql);
  };
  const db = {
    async $queryRawUnsafe<T = unknown>(sql: string, ...v: unknown[]): Promise<T> {
      return (await q(sql, ...v)) as T;
    },
    async $executeRawUnsafe(sql: string, ...v: unknown[]) {
      if (sql.includes('INSERT INTO shop_merchant_keys'))
        keys.push({
          key_hash: v[0] as string,
          merchant_id: v[1] as string,
          scopes: v[2] as string[],
          revoked_at: null,
        });
      else if (sql.includes('UPDATE shop_merchant_keys'))
        keys.forEach((k) => {
          if (!k.revoked_at && (v[1] === undefined || v[1] === null || k.key_hash === v[1]))
            k.revoked_at = new Date();
        });
      else if (sql.includes('INSERT INTO outbox'))
        outbox.push({ event_type: v[0] as string, payload: JSON.parse(v[1] as string) });
      else if (sql.includes('SET payout_pending'))
        merchant.payout_pending = JSON.parse(v[1] as string);
      else if (sql.includes('SET wallet_address')) merchant.wallet_address = v[1];
      else throw new Error('unexpected ' + sql);
      return 1;
    },
  };
  return { db, keys, outbox, merchant };
}

const owner = acct();
const mk = (extra: Record<string, unknown> = {}) => ({
  merchant_id: '11111111-1111-1111-1111-111111111111',
  wallet_address: owner.address.toLowerCase(),
  recovery_wallet: null,
  payout_wallet_base: '0xold',
  payout_wallet_tempo: '0xoldt',
  payout_pending: null,
  contact_email: 'a@b.c',
  ...extra,
});

describe('ID1 nonce / EIP-191', () => {
  let redis: FakeRedis;
  beforeEach(() => {
    clock = 1_800_000_000_000;
    redis = new FakeRedis(now);
  });
  const v = (
    s: { message: string; signature: string },
    purpose: SignPurpose = 'register',
    who: string = owner.address,
  ) => verifyWalletSignature({ ...s, expectedAddress: who, purpose }, { redis, now });

  it('valid -> ok; replay -> 401', async () => {
    const s = await sign(owner, redis, 'register');
    await expect(v(s)).resolves.toEqual({ signer_kind: 'eoa' });
    await expect(v(s)).rejects.toMatchObject({ status: 401 });
  });
  it('301 s later -> 401', async () => {
    const s = await sign(owner, redis, 'register');
    clock += 301_000;
    await expect(v(s)).rejects.toMatchObject({ status: 401 });
  });
  it('other purpose / other address -> 401', async () => {
    const s = await sign(owner, redis, 'register');
    await expect(v(s, 'reissue')).rejects.toMatchObject({ status: 401 });
    const other = acct();
    const s2 = await sign(other, redis, 'register');
    await expect(v(s2, 'register', owner.address)).rejects.toMatchObject({ status: 401 });
    // nonce issued to `other`, message names owner, owner signs: nonce bound to the wrong wallet
    const nonce = await issueNonce(other.address, redis);
    const message = buildSignInMessage({
      address: owner.address,
      purpose: 'register',
      nonce,
      issuedAt: new Date(now()).toISOString(),
    });
    await expect(
      v({ message, signature: await owner.signMessage({ message }) }),
    ).rejects.toMatchObject({
      status: 401,
    });
  });
  it('bad signature -> 401', async () => {
    const s = await sign(owner, redis, 'register');
    const forged = await acct().signMessage({ message: s.message });
    await expect(v({ ...s, signature: forged })).rejects.toMatchObject({ status: 401 });
  });
  it('ID9 redis throws -> 503', async () => {
    const bad = {
      set: async () => {
        throw new Error('down');
      },
      getdel: async () => {
        throw new Error('down');
      },
    };
    await expect(issueNonce(owner.address, bad)).rejects.toMatchObject({ status: 503 });
  });
});

describe('ID2 key format', () => {
  it('mk_live_ prefix, ak_live_ default unchanged', () => {
    expect(generateApiKey('mk_live_')).toMatch(/^mk_live_[0-9a-f]{32}$/);
    expect(generateApiKey()).toMatch(/^ak_live_[0-9a-f]{32}$/);
  });
  it('only key_hash is stored', async () => {
    const f = fakeDb({ merchant: mk() });
    const key = await issueKey(f.db, 'm1', ['orders:read'], 'x');
    expect(JSON.stringify(f.keys)).not.toContain(key);
    expect(f.keys[0].key_hash).toBe(hashApiKey(key));
  });
});

describe('ID3/ID7 guard', () => {
  it('scope, revoked, garbage, rate limit', async () => {
    const f = fakeDb({ merchant: mk() });
    const app = express();
    app.get(
      '/read',
      requireMerchantKey(['orders:read'], () => f.db),
      (_q, r) => void r.json({ ok: 1 }),
    );
    app.post(
      '/write',
      requireMerchantKey(['catalog:write'], () => f.db),
      (_q, r) => void r.json({ ok: 1 }),
    );
    const srv = app.listen(0);
    const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    try {
      const ro = await issueKey(f.db, 'm1', ['orders:read']);
      const rw = await issueKey(f.db, 'm1', ['catalog:write']);
      const h = (k: string) => ({ headers: { authorization: `Bearer ${k}` } });
      expect((await fetch(`${base}/read`, h(ro))).status).toBe(200);
      expect((await fetch(`${base}/write`, { method: 'POST', ...h(ro) })).status).toBe(403);
      expect((await fetch(`${base}/read`, h('garbage'))).status).toBe(401);
      expect((await fetch(`${base}/read`)).status).toBe(401);
      f.keys.find((k) => k.key_hash === hashApiKey(ro))!.revoked_at = new Date();
      expect((await fetch(`${base}/read`, h(ro))).status).toBe(401);
      const codes: number[] = [];
      for (let i = 0; i < 61; i++)
        codes.push((await fetch(`${base}/write`, { method: 'POST', ...h(rw) })).status);
      expect(codes.slice(0, 60).every((c) => c === 200)).toBe(true);
      expect(codes[60]).toBe(429);
    } finally {
      srv.close();
    }
  });
});

describe('ID4-ID6 identity', () => {
  let redis: FakeRedis;
  beforeEach(() => {
    clock = 1_800_000_000_000;
    redis = new FakeRedis(now);
  });
  it('ID4 rotateKey', async () => {
    const f = fakeDb({ merchant: mk() });
    const old = await issueKey(f.db, 'm1');
    const fresh = await rotateKey({ db: f.db, redis, now }, 'm1', {
      signature: await sign(owner, redis, 'rotate_key'),
    });
    expect(f.keys.find((k) => k.key_hash === hashApiKey(old))!.revoked_at).not.toBeNull();
    expect(f.keys.find((k) => k.key_hash === hashApiKey(fresh))!.revoked_at).toBeNull();
    expect(f.outbox.filter((o) => o.event_type === 'shop.merchant.key_rotated')).toHaveLength(1);
  });
  it('ID4b reissueKeys revokes all keys, emits keys_reissued; wrong wallet -> 401', async () => {
    const f = fakeDb({ merchant: mk() });
    const a = await issueKey(f.db, 'm1');
    const b = await issueKey(f.db, 'm1');
    const fresh = await reissueKeys(
      { db: f.db, redis, now },
      owner.address,
      await sign(owner, redis, 'reissue'),
    );
    for (const old of [a, b])
      expect(f.keys.find((k) => k.key_hash === hashApiKey(old))!.revoked_at).not.toBeNull();
    expect(f.keys.find((k) => k.key_hash === hashApiKey(fresh))!.revoked_at).toBeNull();
    expect(f.outbox.filter((o) => o.event_type === 'shop.merchant.keys_reissued')).toHaveLength(1);
    const other = acct();
    await expect(
      reissueKeys({ db: f.db, redis, now }, owner.address, await sign(other, redis, 'reissue')),
    ).rejects.toMatchObject({ status: 401 });
  });
  it('ID4c POST /merchants/me/keys/reissue works without Bearer', async () => {
    const f = fakeDb({ merchant: mk() });
    const old = await issueKey(f.db, 'm1');
    const app = express();
    app.use(express.json());
    app.use(
      createMerchantRouter({
        db: f.db as never,
        transaction: (fn) => fn(f.db as never),
        redis: redis as never,
        now,
      }),
    );
    const srv = app.listen(0);
    const url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/api/v1/shop/merchants/me/keys/reissue`;
    const post = (body: unknown) =>
      fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    try {
      expect((await post({ wallet: owner.address })).status).toBe(401);
      const s = await sign(owner, redis, 'reissue');
      const r = await post({ wallet: owner.address, ...s });
      expect(r.status).toBe(200);
      const { api_key } = (await r.json()) as { api_key: string };
      expect(api_key).toMatch(/^mk_live_/);
      expect(f.keys.find((k) => k.key_hash === hashApiKey(old))!.revoked_at).not.toBeNull();
      expect((await post({ wallet: owner.address, ...s })).status).toBe(401);
    } finally {
      srv.close();
    }
  });
  it('ID5 changeIdentity', async () => {
    const rec = acct();
    const nw = acct();
    const noRec = fakeDb({ merchant: mk() });
    await expect(
      changeIdentity({ db: noRec.db, redis, now }, 'm1', {
        new_wallet: nw.address,
        sig_by_recovery: await sign(rec, redis, 'owner'),
        sig_by_new: await sign(nw, redis, 'owner'),
      }),
    ).rejects.toMatchObject({ status: 409 });
    const f = fakeDb({ merchant: mk({ recovery_wallet: rec.address.toLowerCase() }) });
    const old = await issueKey(f.db, 'm1');
    await changeIdentity({ db: f.db, redis, now }, 'm1', {
      new_wallet: nw.address,
      sig_by_recovery: await sign(rec, redis, 'owner'),
      sig_by_new: await sign(nw, redis, 'owner'),
    });
    expect(f.merchant.wallet_address).toBe(nw.address.toLowerCase());
    expect(f.keys.find((k) => k.key_hash === hashApiKey(old))!.revoked_at).not.toBeNull();
  });
  it('ID6 payout change: 24h delay, old wallet until then, sanctions block', async () => {
    const f = fakeDb({ merchant: mk(), sanctioned: ['0xbad'] });
    const r = await requestPayoutChange({ db: f.db, redis, now }, 'm1', {
      rail: 'base',
      new_wallet: '0xNEW',
      signature: await sign(owner, redis, 'payout_change'),
    });
    expect(Date.parse(r.effective_at) - now()).toBe(24 * 3600 * 1000);
    expect(currentPayout(f.merchant as never, 'base', now())).toBe('0xold');
    expect(currentPayout(f.merchant as never, 'base', now() + 25 * 3600 * 1000)).toBe('0xnew');
    expect(f.outbox.some((o) => JSON.stringify(o.payload).includes('payout_change'))).toBe(true);

    const g = fakeDb({ merchant: mk(), sanctioned: ['0xbad'] });
    await expect(
      requestPayoutChange({ db: g.db, redis, now }, 'm1', {
        rail: 'base',
        new_wallet: '0xBAD',
        signature: await sign(owner, redis, 'payout_change'),
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(g.merchant.payout_pending).toBeNull();
  });
});

describe('ID8 redactObject', () => {
  it('masks mk_live_/whsec_ by value, names by key', () => {
    const key = 'mk_live_' + 'a'.repeat(32);
    const out = JSON.stringify(
      redactObject({
        anything: key,
        nested: { x: 'whsec_' + 'b'.repeat(20) },
        webhook_url: 'https://h.example/secret-path',
        ciphertext_blob: 'zzzz',
        pii: { name: 'n' },
        address_line: 'street',
      }),
    );
    expect(out).not.toContain(key);
    expect(out).not.toContain('bbbbbb');
    expect(out).toContain('mk_live_…(len=40)');
    expect(out).toContain('whsec_…(len=26)');
    expect(out).not.toContain('h.example');
    expect(out).toMatch(/<ciphertext sha256:[0-9a-f]{8} len=4>/);
    expect(out).not.toContain('street');
  });
});

describe('ID8 redactObject arrays', () => {
  it('masks mk_live_/whsec_ inside arrays', () => {
    const key = 'mk_live_' + 'c'.repeat(32);
    const out = JSON.stringify(
      redactObject({ list: [key], items: [{ x: 'whsec_' + 'd'.repeat(20) }] }),
    );
    expect(out).not.toContain(key);
    expect(out).not.toContain('dddddd');
    expect(out).toContain('mk_live_…(len=40)');
    expect(out).toContain('whsec_…(len=26)');
  });

  it('masks keys inside nested arrays of any depth', () => {
    const key = 'mk_live_' + 'e'.repeat(32);
    const out = JSON.stringify(
      redactObject({ deep: [[key]], arr: [{ inner: [key] }], d3: [[[key]]] }),
    );
    expect(out).not.toContain(key);
    expect(out).not.toContain('eeeeee');
  });
});

describe('ID10 pre-auth probe limiter', () => {
  const setup = () => {
    const f = fakeDb({ merchant: mk() });
    const app = express();
    app.set('trust proxy', 1);
    app.use(express.json());
    app.use(
      createMerchantRouter({
        db: f.db as never,
        transaction: (fn) => fn(f.db as never),
        redis: new FakeRedis(now) as never,
        now,
      }),
    );
    const srv = app.listen(0);
    const url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/api/v1/shop/merchants/me/events`;
    const get = (key: string, ip: string) =>
      fetch(url, { headers: { authorization: `Bearer ${key}`, 'x-forwarded-for': ip } });
    return { f, srv, get };
  };
  const junk = 'mk_live_' + '0'.repeat(32);

  it('RL1 101st failed request from one address is 429', async () => {
    const { srv, get } = setup();
    try {
      for (let i = 0; i < PROBE_LIMIT_PER_MIN; i++)
        expect((await get(junk, '10.0.0.1')).status).toBe(401);
      const r = await get(junk, '10.0.0.1');
      expect(r.status).toBe(429);
      expect((await r.json()).error).toBe('rate_limited');
    } finally {
      srv.close();
    }
  });

  it('RL2 budget is per address', async () => {
    const { srv, get } = setup();
    try {
      for (let i = 0; i < PROBE_LIMIT_PER_MIN + 1; i++) await get(junk, '10.0.0.1');
      expect((await get(junk, '10.0.0.2')).status).toBe(401);
    } finally {
      srv.close();
    }
  });

  it('RL3 successful requests are not counted', async () => {
    const { f, srv, get } = setup();
    try {
      const key = await issueKey(f.db, 'm1', ['orders:read']);
      for (let i = 0; i < 150; i++) expect((await get(key, '10.0.0.3')).status).toBe(200);
    } finally {
      srv.close();
    }
  });
});
