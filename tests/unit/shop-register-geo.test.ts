/**
 * T-0310 G1-G6: edge geo headers (UC-22) reach the registration ctx on REST and /mcp, and the
 * /mcp caller address reaches the per-IP rate limit. Real routers and handlers; in-memory DB/Redis.
 */
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { geoOf } from '../../src/shop/geo-headers';
import { encryptionKeyMessage } from '../../src/shop/merchant.service';
import { buildSignInMessage, issueNonce } from '../../src/shop/auth/nonce.service';
import type { ShopDeps } from '../../src/shop/merchant-lifecycle.service';
import { createMerchantRouter } from '../../src/shop/routes/merchant.router';
import { setSignaturePublicClient } from '../../src/shop/wallet-signature';
import { createMcpRouter } from '../../src/mcp/server';

jest.mock('../../src/config/index', () => ({
  config: { ENCRYPTION_KEY: 'k'.repeat(40), X402_NETWORK: 'base' },
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/pipeline/pipeline', () => ({ runPipeline: jest.fn() }));
jest.mock('../../src/pipeline/stages/tool-status.stage', () => ({
  getActiveToolIds: () => new Set<string>(),
}));
jest.mock('../../src/services/moderation-ban.service', () => ({
  checkBan: async () => ({ banned: false, retryAfterSecs: 0 }),
  recordBlock: async () => undefined,
}));

// The /mcp register tool builds its deps with defaultShopDeps(); hand it the in-memory ones.
let current: ShopDeps;
jest.mock('../../src/shop/merchant-lifecycle.service', () => ({
  ...jest.requireActual('../../src/shop/merchant-lifecycle.service'),
  defaultShopDeps: () => current,
}));

type Row = Record<string, unknown>;

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
  c = new Map<string, number>();
  async incr(k: string) {
    this.c.set(k, (this.c.get(k) ?? 0) + 1);
    return this.c.get(k)!;
  }
  async expire() {
    return 1;
  }
}

function build() {
  const merchants: Row[] = [];
  const events: Row[] = [];
  const redis = new FakeRedis();
  const db = {
    async $queryRawUnsafe(sql: string, ...v: unknown[]): Promise<any> {
      if (sql.includes('FROM shop_sanctioned_addresses')) return [];
      if (sql.includes('SELECT slug, wallet_address'))
        return merchants.filter((m) => m.slug === v[0] || m.wallet_address === v[1]);
      if (sql.includes('INSERT INTO agents')) return [{ agent_id: 'agent-1' }];
      if (sql.includes('FROM shop_legal_docs')) return [];
      if (sql.includes('INSERT INTO shop_merchants')) {
        const merchant_id = `m-${merchants.length + 1}`;
        merchants.push({
          merchant_id,
          slug: v[0],
          wallet_address: v[5],
          registration_ip_country: v[4],
        });
        return [{ merchant_id }];
      }
      throw new Error('unexpected query ' + sql);
    },
    async $executeRawUnsafe(sql: string, ...v: unknown[]) {
      if (sql.includes('INTO shop_connect_events')) events.push({ error_code: v[5] });
      else if (!sql.includes('INTO shop_moderation_reviews')) throw new Error('unexpected ' + sql);
      return 1;
    },
  };
  const deps: ShopDeps = { db, transaction: (fn) => fn(db), redis: redis as never };
  return { deps, merchants, events, redis };
}

async function regBody(env: ReturnType<typeof build>, over: Row = {}) {
  const wallet = privateKeyToAccount(generatePrivateKey());
  const nonce = await issueNonce(wallet.address, env.redis as never);
  const message = buildSignInMessage({
    address: wallet.address,
    purpose: 'register',
    nonce,
    issuedAt: new Date().toISOString(),
  });
  const kid = 'k1',
    alg = 'x25519',
    pub = 'AAAA';
  return {
    wallet: wallet.address,
    slug: 'shop-' + wallet.address.slice(2, 10).toLowerCase(),
    name: 'Shop',
    category: 'digital-goods',
    country: 'DE',
    contact_email: 'a@example.org',
    site_url: 'https://example.org',
    encryption_key: {
      kid,
      alg,
      pub,
      sig_by_wallet: await wallet.signMessage({ message: encryptionKeyMessage({ kid, alg, pub }) }),
    },
    message,
    signature: await wallet.signMessage({ message }),
    ...over,
  };
}

const servers: Server[] = [];
afterEach(async () => {
  delete process.env.INTEGRATOR_GEO_HEADERS;
  for (const s of servers.splice(0)) {
    s.closeAllConnections();
    await new Promise((r) => s.close(r));
  }
});
function serve(app: express.Express): string {
  const srv = app.listen(0);
  servers.push(srv);
  return `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
}

describe('REST POST /api/v1/shop/merchants (G1-G4)', () => {
  const post = async (env: ReturnType<typeof build>, headers: Record<string, string>) => {
    const app = express();
    app.use(express.json());
    app.use(createMerchantRouter(env.deps));
    const r = await fetch(serve(app) + '/api/v1/shop/merchants', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(await regBody(env)),
    });
    return { status: r.status, body: (await r.json()) as Row };
  };

  it('G1 header ignored when INTEGRATOR_GEO_HEADERS is unset', async () => {
    const env = build();
    const r = await post(env, { 'X-APIbase-Geo-Country': 'IR' });
    expect(r.status).toBe(201);
    expect(env.merchants[0].registration_ip_country).toBeNull();
  });

  it('G2 trusted IR -> 403 country_not_supported, one event', async () => {
    process.env.INTEGRATOR_GEO_HEADERS = 'trusted';
    const env = build();
    const r = await post(env, { 'X-APIbase-Geo-Country': 'IR' });
    expect(r.status).toBe(403);
    expect(r.body.error_code).toBe('country_not_supported');
    expect(env.events).toHaveLength(1);
    expect(env.merchants).toHaveLength(0);
  });

  it('G3 UA region 43 -> 403; UA region 65 -> ok, registration_ip_country UA', async () => {
    process.env.INTEGRATOR_GEO_HEADERS = 'trusted';
    const a = build();
    expect(
      (await post(a, { 'X-APIbase-Geo-Country': 'UA', 'X-APIbase-Geo-Region': '43' })).status,
    ).toBe(403);
    const b = build();
    expect(
      (await post(b, { 'X-APIbase-Geo-Country': 'ua', 'X-APIbase-Geo-Region': '65' })).status,
    ).toBe(201);
    expect(b.merchants[0].registration_ip_country).toBe('UA');
  });

  it('G4 malformed values -> null, never 500', async () => {
    process.env.INTEGRATOR_GEO_HEADERS = 'trusted';
    expect(geoOf({ headers: { 'x-apibase-geo-country': ['IR', 'KP'] } } as never)).toEqual({
      ip_country: null,
      ip_region: null,
    });
    for (const bad of ['iran', 'I', '']) {
      expect(geoOf({ headers: { 'x-apibase-geo-country': bad } } as never).ip_country).toBeNull();
    }
    expect(geoOf({ headers: { 'x-apibase-geo-region': 'toolong' } } as never).ip_region).toBeNull();
    const env = build();
    const r = await post(env, { 'X-APIbase-Geo-Country': 'iran' });
    expect(r.status).toBe(201);
    expect(env.merchants[0].registration_ip_country).toBeNull();
  });
});

describe('MCP shop.merchant.register (G5, G6)', () => {
  beforeAll(() => setSignaturePublicClient(undefined as never));

  async function session(env: ReturnType<typeof build>, headers: Record<string, string> = {}) {
    current = env.deps;
    const app = express();
    app.use(express.json());
    // req.ip is fixed: supertest-style peers would all be 127.0.0.1 anyway.
    app.use((req, _res, next) => {
      Object.defineProperty(req, 'ip', { value: '198.51.100.9' });
      next();
    });
    app.use(createMcpRouter({ shopDeps: env.deps }));
    const base = serve(app);
    const h = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...headers,
    };
    const rpc = async (body: unknown, extra: Record<string, string> = {}) => {
      const r = await fetch(base + '/mcp', {
        method: 'POST',
        headers: { ...h, ...extra },
        body: JSON.stringify(body),
      });
      const text = await r.text();
      const line = text.split('\n').find((l) => l.startsWith('data: '));
      return { r, json: line ? JSON.parse(line.slice(6)) : text ? JSON.parse(text) : null };
    };
    const init = await rpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 't', version: '1' },
      },
    });
    const sid = init.r.headers.get('mcp-session-id') as string;
    await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, { 'mcp-session-id': sid });
    return async (id: number) => {
      const args = await regBody(env);
      const out = await rpc(
        {
          jsonrpc: '2.0',
          id,
          method: 'tools/call',
          params: { name: 'shop.merchant.register', arguments: args },
        },
        { 'mcp-session-id': sid },
      );
      return JSON.stringify(out.json);
    };
  }

  it('G5 6th registration from one IP in an hour -> rate_limited', async () => {
    const env = build();
    const call = await session(env);
    for (let i = 0; i < 5; i++) expect(await call(10 + i)).toContain('merchant_id');
    expect(await call(99)).toContain('rate_limited');
  });

  it('G5-sse 6th registration over the legacy SSE transport -> rate_limited', async () => {
    const env = build();
    current = env.deps;
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      Object.defineProperty(req, 'ip', { value: '198.51.100.10' });
      next();
    });
    app.use(createMcpRouter({ shopDeps: env.deps }));
    const base = serve(app);
    const ctl = new AbortController();
    const stream = await fetch(base + '/sse', {
      headers: { authorization: 'Bearer test-key', accept: 'text/event-stream' },
      signal: ctl.signal,
    });
    const reader = stream.body!.getReader();
    let buf = '';
    const until = async (needle: string) => {
      while (!buf.includes(needle)) {
        const { value, done } = await reader.read();
        if (done) throw new Error('stream ended, got: ' + buf);
        buf += new TextDecoder().decode(value);
      }
    };
    await until('sessionId=');
    const endpoint = /data: (\/messages\?sessionId=[^\s]+)/.exec(buf)![1];
    const send = (body: unknown) =>
      fetch(base + endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    await send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 't', version: '1' },
      },
    });
    await until('"id":1');
    await send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    for (let i = 0; i < 6; i++) {
      await send({
        jsonrpc: '2.0',
        id: 10 + i,
        method: 'tools/call',
        params: { name: 'shop.merchant.register', arguments: await regBody(env) },
      });
      await until(`"id":${10 + i}`);
    }
    ctl.abort();
    expect(buf).toContain('rate_limited');
    expect(env.merchants).toHaveLength(5);
  });

  it('G6 trusted KP -> country_not_supported', async () => {
    process.env.INTEGRATOR_GEO_HEADERS = 'trusted';
    const env = build();
    const call = await session(env, { 'X-APIbase-Geo-Country': 'KP' });
    expect(await call(2)).toContain('country_not_supported');
    expect(env.merchants).toHaveLength(0);
  });
});
