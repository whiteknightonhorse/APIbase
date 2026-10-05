/** T-INT-04 TA1-TA9. Real MCP server + real express router; in-memory ShopTx/Redis; real EIP-191 signatures. */
import express from 'express';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createHash } from 'node:crypto';
import { hashApiKey } from '../../src/services/api-key.service';
import { encryptionKeyMessage } from '../../src/shop/merchant.service';
import { assertTermsAccepted } from '../../src/shop/auth/terms.guard';
import { issueNonce } from '../../src/shop/auth/nonce.service';
import { acceptTermsMessage, type ShopDeps } from '../../src/shop/merchant-lifecycle.service';
import { createMerchantRouter } from '../../src/shop/routes/merchant.router';
import { registerMerchantTools, MERCHANT_TOOL_NAMES } from '../../src/shop/tools/merchant.tools';

jest.mock('../../src/config', () => ({ config: {} }));
jest.mock('../../src/pipeline/pipeline', () => ({ runPipeline: jest.fn() }));
jest.mock('../../src/services/discovery.service', () => ({ discover: jest.fn() }));
jest.mock('../../src/pipeline/stages/tool-status.stage', () => ({
  getActiveToolIds: () => new Set(),
}));
jest.mock('../../src/services/moderation-ban.service', () => ({
  checkBan: async () => ({ banned: false, retryAfterSecs: 0 }),
  recordBlock: async () => undefined,
}));

const DAY = 24 * 3600 * 1000;
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

type Row = Record<string, any>;
type M = { merchant_id: string; status: string; status_reason?: string | null };
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

function fixtureDocs(): Row[] {
  return ['merchant-agreement', 'aup', 'dpa', 'refund-framework'].map((doc_id) => ({
    doc_id,
    version: '1.0',
    sha256: sha(doc_id + '1.0'),
    url: `/legal/${doc_id}`,
    effective_from: new Date(now() - 400 * DAY).toISOString(),
  }));
}

function build() {
  const merchants: Array<Row & M> = [];
  const acceptances: Row[] = [];
  const keys: Row[] = [];
  const outbox: Row[] = [];
  const docs = fixtureDocs();
  const redis = new FakeRedis();
  const db = {
    async $queryRawUnsafe(sql: string, ...v: any[]): Promise<any> {
      if (sql.includes('FROM shop_sanctioned_addresses')) return [];
      if (sql.includes('SELECT slug, wallet_address'))
        return merchants.filter((m) => m.slug === v[0] || m.wallet_address === v[1]);
      if (sql.includes('INSERT INTO agents')) return [{ agent_id: 'agent-1' }];
      if (sql.includes('INSERT INTO shop_merchants')) {
        const merchant_id = `m-${merchants.length + 1}`;
        merchants.push({
          merchant_id,
          slug: v[0],
          wallet_address: v[5],
          status: 'pending',
          status_reason: null,
        });
        return [{ merchant_id }];
      }
      if (sql.includes('FROM shop_legal_docs')) {
        const cutoff = Date.parse(v[1]);
        const out: Row[] = [];
        for (const id of v[0] as string[]) {
          const c = docs
            .filter((d) => d.doc_id === id && Date.parse(d.effective_from) <= cutoff)
            .sort((a, b) => Date.parse(b.effective_from) - Date.parse(a.effective_from));
          if (c[0]) out.push(c[0]);
        }
        return out;
      }
      if (sql.includes('FROM shop_acceptances'))
        return acceptances.filter((a) => a.merchant_id === v[0]);
      if (sql.includes('FROM shop_merchant_keys'))
        return keys.filter((k) => k.key_hash === v[0] && !k.revoked_at);
      if (sql.includes("SET status = 'active'")) {
        const m = merchants.find((x) => x.merchant_id === v[0] && x.status === 'pending');
        if (m) m.status = 'active';
        return m ? [{ merchant_id: m.merchant_id }] : [];
      }
      if (sql.includes("SET status = 'deactivated'")) {
        const m = merchants.find(
          (x) => x.merchant_id === v[0] && ['pending', 'active'].includes(x.status),
        );
        if (m) Object.assign(m, { status: 'deactivated', status_reason: 'self' });
        return m ? [{ merchant_id: m.merchant_id }] : [];
      }
      if (sql.includes('SELECT status FROM shop_merchants'))
        return merchants.filter((m) => m.merchant_id === v[0]).map((m) => ({ status: m.status }));
      if (sql.includes('FROM shop_merchants WHERE wallet_address'))
        return merchants.filter((m) => m.wallet_address === v[0]);
      if (sql.includes('FROM shop_merchants WHERE merchant_id'))
        return merchants.filter((m) => m.merchant_id === v[0]);
      throw new Error('unexpected query ' + sql);
    },
    async $executeRawUnsafe(sql: string, ...v: any[]): Promise<number> {
      if (sql.includes('INTO shop_moderation_reviews') || sql.includes('INTO shop_connect_events'))
        return 1;
      if (sql.includes('INTO shop_acceptances'))
        acceptances.push({
          merchant_id: v[0],
          doc_id: v[1],
          version: v[2],
          sha256: v[3],
          method: v[4],
          signer: v[5],
          signature: v[6],
          message: v[7],
        });
      else if (sql.includes('INTO shop_merchant_keys'))
        keys.push({
          key_hash: v[0],
          merchant_id: v[1],
          scopes: v[2],
          label: v[3],
          revoked_at: null,
        });
      else if (sql.includes('UPDATE shop_merchant_keys'))
        keys.forEach((k) => {
          if (k.merchant_id === v[0] && !k.revoked_at && (!v[1] || k.key_hash === v[1]))
            k.revoked_at = 'now';
        });
      else if (sql.includes('INTO outbox'))
        outbox.push({ event_type: v[0], payload: JSON.parse(v[1]) });
      else throw new Error('unexpected exec ' + sql);
      return 1;
    },
  };
  const deps: ShopDeps = {
    db,
    transaction: (fn) => fn(db),
    redis: redis as never,
    now,
  };
  return { deps, merchants, acceptances, keys, outbox, docs, redis };
}

type Env = ReturnType<typeof build>;

async function regBody(
  env: Env,
  over: Row = {},
  wallet = privateKeyToAccount(generatePrivateKey()),
) {
  const nonce = await issueNonce(wallet.address, env.redis as never);
  const message = `apibase.pro wants you to sign in with your wallet.\nAddress: ${wallet.address}\nPurpose: register\nNonce: ${nonce}\nIssued At: ${new Date(now()).toISOString()}`;
  const kid = 'k1',
    alg = 'x25519',
    pub = 'AAAA';
  return {
    wallet,
    body: {
      wallet: wallet.address,
      slug: 'shop-' + wallet.address.slice(2, 8).toLowerCase(),
      name: 'Shop',
      category: 'digital-goods',
      country: 'DE',
      contact_email: 'a@example.org',
      site_url: 'https://example.org',
      encryption_key: {
        kid,
        alg,
        pub,
        sig_by_wallet: await wallet.signMessage({
          message: encryptionKeyMessage({ kid, alg, pub }),
        }),
      },
      message,
      signature: await wallet.signMessage({ message }),
      ...over,
    },
  };
}

async function acceptBody(
  env: Env,
  wallet: ReturnType<typeof privateKeyToAccount>,
  signer = wallet,
  docs = env.docs,
) {
  const nonce = await issueNonce(wallet.address, env.redis as never);
  const message = acceptTermsMessage(docs as never, {
    wallet: wallet.address,
    nonce,
    time: new Date(now()).toISOString(),
  });
  return {
    wallet: wallet.address,
    doc_hashes: docs.map(({ doc_id, version, sha256 }) => ({ doc_id, version, sha256 })),
    message,
    signature: await signer.signMessage({ message }),
  };
}

async function connect(env: Env, apiKey = '') {
  const server = new McpServer({ name: 't', version: '0' });
  registerMerchantTools(server, apiKey, 'req-1', env.deps);
  const client = new Client({ name: 'c', version: '0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Row = {}) => {
    const r: any = await client.callTool({ name, arguments: args });
    const text = JSON.parse(r.content[0].text);
    return { isError: !!r.isError, text, structured: r.structuredContent };
  };
  return { client, call };
}

beforeEach(() => {
  clock = 1_800_000_000_000;
});

describe('TA1/TA2/TA9 register -> accept_terms (MCP)', () => {
  it('TA1+TA2: nonce -> register -> accept_terms activates, key once, hash only in DB', async () => {
    const env = build();
    const { call } = await connect(env);
    const { wallet, body } = await regBody(env);
    const reg = await call('shop.merchant.register', body);
    expect(reg.isError).toBe(false);
    expect(reg.structured).toMatchObject({ slug: body.slug, status: 'pending' });
    expect(reg.structured.docs_to_accept).toHaveLength(4);

    const acc = await acceptBody(env, wallet);
    const r1 = await call('shop.merchant.accept_terms', acc);
    expect(r1.isError).toBe(false);
    expect(r1.structured.status).toBe('active');
    expect(r1.structured.api_key).toMatch(/^mk_live_[0-9a-f]{32}$/);
    expect(env.merchants[0].status).toBe('active');
    expect(env.keys).toHaveLength(1);
    expect(env.keys[0].key_hash).toBe(hashApiKey(r1.structured.api_key));
    expect(JSON.stringify(env)).not.toContain(r1.structured.api_key);
    expect(env.keys[0].label).toBe('initial');

    // TA2: snapshot of the stored §11.2 message
    const h = env.docs.map((d) => d.sha256);
    const nonce = acc.message.match(/Nonce: ([0-9a-f]+)\./)![1];
    const expected =
      `I accept APIbase documents: merchant-agreement v1.0 sha256:${h[0]}; aup v1.0 sha256:${h[1]}; ` +
      `dpa v1.0 sha256:${h[2]}; refund-framework v1.0 sha256:${h[3]}. ` +
      `Wallet: ${wallet.address}. Nonce: ${nonce}. Time: ${new Date(now()).toISOString()}`;
    expect(env.acceptances).toHaveLength(4);
    for (const a of env.acceptances) {
      expect(a.message).toBe(expected);
      expect(a.signer).toBe(wallet.address.toLowerCase());
      expect(a.method).toBe('wallet_signature');
      expect(a.signature).toBe(acc.signature);
    }

    // replay: 200, no new key
    const r2 = await call('shop.merchant.accept_terms', acc);
    expect(r2.isError).toBe(false);
    expect(r2.structured).toEqual({ status: 'active' });
    expect(env.keys).toHaveLength(1);
    expect(env.acceptances).toHaveLength(4);
  });

  it('TA3: stale hash -> 428 with the 4 current hashes, still pending; 3 of 4 -> 428', async () => {
    const env = build();
    const { call } = await connect(env);
    const { wallet, body } = await regBody(env);
    await call('shop.merchant.register', body);

    const stale = env.docs.map((d) => ({ ...d, sha256: sha('old' + d.doc_id) }));
    const r = await call(
      'shop.merchant.accept_terms',
      await acceptBody(env, wallet, wallet, stale),
    );
    expect(r.isError).toBe(true);
    expect(r.text.error_code).toBe('terms_not_accepted');
    expect(r.text.docs.map((d: Row) => d.sha256)).toEqual(env.docs.map((d) => d.sha256));
    expect(env.merchants[0].status).toBe('pending');

    const three = await call(
      'shop.merchant.accept_terms',
      await acceptBody(env, wallet, wallet, env.docs.slice(0, 3)),
    );
    expect(three.isError).toBe(true);
    expect(three.text.error_code).toBe('terms_not_accepted');
    expect(three.text.docs).toHaveLength(4);
    expect(env.merchants[0].status).toBe('pending');
    expect(env.acceptances).toHaveLength(0);

    // message text diverging from the template while doc_hashes are right -> 428
    const ok = await acceptBody(env, wallet);
    const tampered = { ...ok, message: ok.message.replace('aup v1.0', 'aup v9.9') };
    const t = await call('shop.merchant.accept_terms', tampered);
    expect(t.text.error_code).toBe('terms_not_accepted');
    expect(env.acceptances).toHaveLength(0);
  });

  it('TA9: signature of another wallet -> 401, no acceptance rows', async () => {
    const env = build();
    const { call } = await connect(env);
    const { wallet, body } = await regBody(env);
    await call('shop.merchant.register', body);
    const other = privateKeyToAccount(generatePrivateKey());
    const r = await call('shop.merchant.accept_terms', await acceptBody(env, wallet, other));
    expect(r.isError).toBe(true);
    expect(r.text.error_code).toBe('unauthorized');
    expect(env.acceptances).toHaveLength(0);
    expect(env.merchants[0].status).toBe('pending');
  });

  it('TA8: register country IR -> isError country_not_supported with F-15 fields', async () => {
    const env = build();
    const { call } = await connect(env);
    const { body } = await regBody(env, { country: 'IR' });
    const r = await call('shop.merchant.register', body);
    expect(r.isError).toBe(true);
    expect(r.text).toMatchObject({
      error_code: 'country_not_supported',
      suggested_action: 'contact_support',
      documentation_url: '/legal/aup',
    });
    expect(env.merchants).toHaveLength(0);
  });
});

async function activeMerchant(env: Env) {
  const { call } = await connect(env);
  const { wallet, body } = await regBody(env);
  await call('shop.merchant.register', body);
  const r = await call('shop.merchant.accept_terms', await acceptBody(env, wallet));
  return { key: r.structured.api_key as string, merchant: env.merchants[0] };
}

describe('TA4 assertTermsAccepted', () => {
  it('pending -> 428 with docs', async () => {
    const env = build();
    const { call } = await connect(env);
    const { body } = await regBody(env);
    await call('shop.merchant.register', body);
    // docs published 5 days ago: inside the re-accept window, so only status='pending' can force the 428
    env.docs.forEach((d) => (d.effective_from = new Date(now() - 5 * DAY).toISOString()));
    await expect(assertTermsAccepted(env.deps.db, env.merchants[0], now())).rejects.toMatchObject({
      status: 428,
      error_code: 'terms_not_accepted',
    });
  });
  it('new aup version: +10 days -> banner, +31 days -> 428', async () => {
    const env = build();
    const { merchant } = await activeMerchant(env);
    expect(await assertTermsAccepted(env.deps.db, merchant, now())).toEqual({});
    env.docs.push({
      doc_id: 'aup',
      version: '1.1',
      sha256: sha('aup1.1'),
      url: '/legal/aup',
      effective_from: new Date(now()).toISOString(),
    });
    const r = await assertTermsAccepted(env.deps.db, merchant, now() + 10 * DAY);
    expect(r.terms_update_pending?.docs).toEqual([
      { doc_id: 'aup', version: '1.1', sha256: sha('aup1.1'), url: '/legal/aup' },
    ]);
    await expect(
      assertTermsAccepted(env.deps.db, merchant, now() + 31 * DAY),
    ).rejects.toMatchObject({
      status: 428,
      error_code: 'terms_not_accepted',
    });
  });
});

describe('TA5 deactivate', () => {
  it('deactivated -> 410 without status_reason; rotate_key still 200; catalog scope irrelevant', async () => {
    const env = build();
    const { key, merchant } = await activeMerchant(env);
    const { call } = await connect(env, key);
    const d = await call('shop.merchant.deactivate');
    expect(d.isError).toBe(false);
    expect(merchant).toMatchObject({ status: 'deactivated', status_reason: 'self' });
    expect(env.outbox.map((o) => o.event_type)).toContain('shop.merchant.deactivated');

    let err: any;
    await assertTermsAccepted(env.deps.db, merchant, now()).catch((e) => (err = e));
    expect(err).toMatchObject({ status: 410, error_code: 'merchant_unavailable' });
    expect(JSON.stringify({ m: err.message, e: err.extra })).not.toContain('self');
    expect(JSON.stringify({ m: err.message, e: err.extra })).not.toContain('status_reason');

    const rot = await call('shop.merchant.rotate_key');
    expect(rot.isError).toBe(false);
    expect(rot.structured.api_key).toMatch(/^mk_live_/);
    expect(rot.structured.api_key).not.toBe(key);
  });
  it('deactivate needs orders:write', async () => {
    const env = build();
    const { key } = await activeMerchant(env);
    env.keys[0].scopes = ['orders:read'];
    const { call } = await connect(env, key);
    const d = await call('shop.merchant.deactivate');
    expect(d.isError).toBe(true);
    expect(d.text.error_code).toBe('forbidden');
  });
});

describe('TA6 tools/list', () => {
  it('lists the 4 merchant tools with outputSchema', async () => {
    const env = build();
    const { client } = await connect(env);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...MERCHANT_TOOL_NAMES].sort());
    for (const t of tools) expect(t.outputSchema).toBeTruthy();
  });
  it('/mcp createMcpServer: other tools unchanged vs registerTools alone', async () => {
    const { createMcpServer } = await import('../../src/mcp/server');
    const { registerTools } = await import('../../src/mcp/tool-adapter');
    const list = async (s: McpServer) => {
      const c = new Client({ name: 'c', version: '0' });
      const [a, b] = InMemoryTransport.createLinkedPair();
      await Promise.all([s.connect(a), c.connect(b)]);
      return (await c.listTools()).tools;
    };
    const full = await list(createMcpServer('k', 'r', {} as never));
    const base = new McpServer({ name: 'b', version: '0' });
    registerTools(base, 'k', 'r', {} as never);
    const before = await list(base);
    const names = new Set<string>(MERCHANT_TOOL_NAMES);
    expect(full.filter((t) => names.has(t.name))).toHaveLength(4);
    expect(full.filter((t) => !names.has(t.name))).toEqual(before);
  });
});

describe('TA7 REST', () => {
  it('POST /merchants without signature -> 401; 6th from one IP/hour -> 429; nonce+accept flow works', async () => {
    const env = build();
    const app = express();
    app.use(express.json());
    app.use(createMerchantRouter(env.deps));
    const srv = app.listen(0);
    const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/api/v1/shop`;
    try {
      const post = (p: string, body: object, headers: Row = {}) =>
        fetch(base + p, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers },
          body: JSON.stringify(body),
        });
      const codes: number[] = [];
      for (let i = 0; i < 6; i++) codes.push((await post('/merchants', { slug: 'x' })).status);
      expect(codes).toEqual([401, 401, 401, 401, 401, 429]);

      // full flow through the nonce endpoint (separate router => fresh limiter)
      const app2 = express();
      app2.use(express.json());
      app2.use(createMerchantRouter(env.deps));
      const srv2 = app2.listen(0);
      const b2 = `http://127.0.0.1:${(srv2.address() as AddressInfo).port}/api/v1/shop`;
      try {
        const wallet = privateKeyToAccount(generatePrivateKey());
        const n1: any = await (
          await fetch(`${b2}/auth/nonce?wallet=${wallet.address}&purpose=register`)
        ).json();
        const { body } = await regBody(env, {}, wallet);
        body.message = n1.message;
        body.signature = await wallet.signMessage({ message: n1.message });
        const reg = await fetch(`${b2}/merchants`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        expect(reg.status).toBe(201);
        const n2: any = await (
          await fetch(`${b2}/auth/nonce?wallet=${wallet.address}&purpose=accept_terms`)
        ).json();
        const acc = await fetch(`${b2}/merchants/me/acceptances`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            wallet: wallet.address,
            doc_hashes: env.docs.map(({ doc_id, version, sha256 }) => ({
              doc_id,
              version,
              sha256,
            })),
            message: n2.message,
            signature: await wallet.signMessage({ message: n2.message }),
          }),
        });
        expect(acc.status).toBe(200);
        const key = ((await acc.json()) as any).api_key as string;
        expect(key).toMatch(/^mk_live_/);
        const dea = await fetch(`${b2}/merchants/me/deactivate`, {
          method: 'POST',
          headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
          body: '{}',
        });
        expect(dea.status).toBe(200);
        const rot = await fetch(`${b2}/merchants/me/keys/rotate`, {
          method: 'POST',
          headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
          body: '{}',
        });
        expect(rot.status).toBe(200);
      } finally {
        srv2.close();
      }
    } finally {
      srv.close();
    }
  });
});
