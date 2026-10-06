/**
 * T-INT-16 (no database): storefront tools/list (SF1, SF2), LRU (SF8), 404/410 on /mcp/m/:slug
 * (SF9), definition hash in the server-card (SF10), probe coverage metric (SF12), and the /mcp
 * tool count growing by exactly the shop.* tools. The DB-backed rest is shop-storefront-check.test.ts.
 */
import express from 'express';
import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { register } from '../../src/services/metrics.service';
import {
  clearStorefrontCache,
  createMerchantMcpServer,
  loadStorefront,
  storefrontCacheHas,
  storefrontCacheSize,
  STOREFRONT_LRU_MAX,
  STOREFRONT_TOOL_NAMES,
  type StorefrontMerchant,
} from '../../src/shop/merchant-mcp-server';
import {
  hashDefinitions,
  shopToolDefinitions,
  SHOP_TOOLS_VERSION,
} from '../../src/shop/tool-definitions';
import { runShopStorefrontProbe } from '../../src/jobs/shop-storefront-probe.job';
import { createMcpRouter, createMcpServer } from '../../src/mcp/server';
import { CATALOG_TOOL_NAMES } from '../../src/shop/tools/catalog.tools';
import { MERCHANT_TOOL_NAMES } from '../../src/shop/tools/merchant.tools';
import { ORDER_TOOL_NAMES } from '../../src/shop/tools/order.tools';
import { registerTools } from '../../src/mcp/tool-adapter';

jest.mock('../../src/config/index', () => ({
  config: { ENCRYPTION_KEY: 'k'.repeat(40), X402_NETWORK: 'base' },
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// server.ts -> tool-adapter -> the whole 13-stage pipeline (ESM-only deps Jest cannot parse): the
// pipeline is never run here, only the tool registrations are looked at.
jest.mock('../../src/pipeline/pipeline', () => ({ runPipeline: jest.fn() }));
jest.mock('../../src/pipeline/stages/tool-status.stage', () => ({
  getActiveToolIds: () => new Set<string>(),
}));

type Shop = { merchant_id: string; slug: string; name: string; status: string };

/** Answers exactly the three queries loadStorefront makes. */
function fakeDb(shops: Map<string, Shop>) {
  let shopQueries = 0;
  const db = {
    $executeRawUnsafe: jest.fn(async () => 1),
    $queryRawUnsafe: jest.fn(async (sql: string, ...v: unknown[]) => {
      if (sql.includes('FROM shop_merchants WHERE slug')) {
        shopQueries++;
        const s = shops.get(String(v[0]));
        return s
          ? [
              {
                ...s,
                category: 'sporting-goods',
                site_url: 'https://x.example',
                domain_verified: false,
                status_reason: null,
                reputation: {},
                policy: {},
              },
            ]
          : [];
      }
      if (sql.includes('bool_and')) return [{ days: 14, returns: true }];
      if (sql.includes("limits->>'quote_ttl_s'")) return [{ ttl_s: null }];
      return [];
    }),
  };
  return { db: db as never, shopQueries: () => shopQueries };
}

const merchant = (slug: string, name = 'Skate Hut'): StorefrontMerchant => ({
  merchant_id: `id-${slug}`,
  slug,
  name,
  category: 'sporting-goods',
  refund_window_days: 14,
  returns_accepted: true,
  quote_ttl_min: 15,
});

async function listOf(server: McpServer): Promise<string[]> {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const c = new Client({ name: 't', version: '1' });
  await Promise.all([server.connect(a), c.connect(b)]);
  return (await c.listTools()).tools.map((t) => t.name);
}

describe('merchant storefront MCP server (INT-16)', () => {
  beforeEach(() => clearStorefrontCache());

  it('SF1: tools/list of a storefront is exactly the six buyer tools (snapshot)', async () => {
    const names = await listOf(createMerchantMcpServer(merchant('skate-hut')));
    expect(names.sort()).toMatchInlineSnapshot(`
      [
        "shop.catalog.get",
        "shop.catalog.search",
        "shop.order.cancel",
        "shop.order.get",
        "shop.order.pay",
        "shop.order.quote",
      ]
    `);
    expect([...STOREFRONT_TOOL_NAMES].sort()).toEqual(names);
  });

  it('SF2: no apibase.discover, no shop.merchant.*, no platform tools, no merchant argument', async () => {
    const server = createMerchantMcpServer(merchant('skate-hut'));
    const [a, b] = InMemoryTransport.createLinkedPair();
    const c = new Client({ name: 't', version: '1' });
    await Promise.all([server.connect(a), c.connect(b)]);
    const { tools } = await c.listTools();
    const names = tools.map((t) => t.name);
    expect(names).not.toContain('apibase.discover');
    expect(names.filter((n) => n.startsWith('shop.merchant.'))).toEqual([]);
    expect(names.filter((n) => !n.startsWith('shop.'))).toEqual([]);
    for (const t of tools) {
      expect(Object.keys((t.inputSchema.properties ?? {}) as object)).not.toContain('merchant');
      expect(t.inputSchema.required ?? []).not.toContain('merchant');
    }
    expect(c.getServerVersion()?.name).toBe('Skate Hut via APIbase');
  });

  it('SF8: LRU of 1000: the 1001st merchant evicts the first, a repeat load rebuilds it', async () => {
    const shops = new Map<string, Shop>();
    for (let i = 0; i <= STOREFRONT_LRU_MAX; i++) {
      const slug = `shop-${String(i).padStart(4, '0')}`;
      shops.set(slug, { merchant_id: `id-${i}`, slug, name: `Shop ${i}`, status: 'active' });
    }
    const { db, shopQueries } = fakeDb(shops);
    for (const slug of shops.keys()) await loadStorefront(db, slug);
    expect(storefrontCacheSize()).toBe(STOREFRONT_LRU_MAX);
    expect(storefrontCacheHas('shop-0000')).toBe(false);
    expect(storefrontCacheHas('shop-1000')).toBe(true);
    const before = shopQueries();
    await loadStorefront(db, 'shop-1000'); // still cached
    expect(shopQueries()).toBe(before);
    await loadStorefront(db, 'shop-0000'); // evicted: rebuilt from the database
    expect(shopQueries()).toBe(before + 1);
    expect(storefrontCacheHas('shop-0000')).toBe(true);
    expect(storefrontCacheSize()).toBe(STOREFRONT_LRU_MAX);
  });

  it('SF8b: a cold storefront builds in under 5 ms once the module is warm', () => {
    createMerchantMcpServer(merchant('warm'));
    const runs = Array.from({ length: 5 }, () => {
      const t = process.hrtime.bigint();
      createMerchantMcpServer(merchant('cold'));
      return Number(process.hrtime.bigint() - t) / 1e6;
    });
    expect(Math.min(...runs)).toBeLessThan(5);
  });

  describe('SF9: /mcp/m/:slug', () => {
    let srv: Server;
    let base = '';
    const shops = new Map<string, Shop>([
      ['live-shop', { merchant_id: 'id-1', slug: 'live-shop', name: 'Live', status: 'active' }],
      [
        'gone-shop',
        { merchant_id: 'id-2', slug: 'gone-shop', name: 'Gone', status: 'deactivated' },
      ],
      ['susp-shop', { merchant_id: 'id-3', slug: 'susp-shop', name: 'Susp', status: 'suspended' }],
      ['pend-shop', { merchant_id: 'id-4', slug: 'pend-shop', name: 'Pend', status: 'pending' }],
    ]);
    beforeAll(async () => {
      const app = express();
      app.use(express.json());
      app.use(createMcpRouter({ shopDeps: { db: fakeDb(shops).db } as never }));
      srv = await new Promise<Server>((r) => {
        const s = app.listen(0, '127.0.0.1', () => r(s));
      });
      base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    });
    afterAll(async () => {
      srv.closeAllConnections();
      await new Promise((r) => srv.close(r));
    });
    const init = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 't', version: '1' },
      },
    };
    const post = (slug: string, headers: Record<string, string> = {}, body: unknown = init) =>
      fetch(`${base}/mcp/m/${slug}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          ...headers,
        },
        body: JSON.stringify(body),
      });

    it('unknown slug -> 404; deactivated/suspended -> 410 merchant_unavailable; pending -> 404', async () => {
      expect((await post('no-such-shop')).status).toBe(404);
      expect((await post('pend-shop')).status).toBe(404);
      for (const slug of ['gone-shop', 'susp-shop']) {
        clearStorefrontCache();
        const r = await post(slug);
        expect(r.status).toBe(410);
        expect((await r.json()).error).toBe('merchant_unavailable');
        for (const method of ['GET', 'DELETE']) {
          expect((await fetch(`${base}/mcp/m/${slug}`, { method })).status).toBe(410);
        }
      }
    });

    it('active slug: initialize opens a session that works on its own slug only', async () => {
      const r = await post('live-shop');
      expect(r.status).toBe(200);
      const sid = r.headers.get('mcp-session-id')!;
      expect(sid).toBeTruthy();
      const text = await r.text();
      expect(text).toContain('Live via APIbase');
      const list = await post(
        'live-shop',
        { 'mcp-session-id': sid },
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
        },
      );
      expect(list.status).toBe(200);
      expect((await list.text()).match(/"name":"shop\./g)).toHaveLength(6);
      // the same session on /mcp/m/<another shop> is not found
      shops.set('other-shop', {
        merchant_id: 'id-5',
        slug: 'other-shop',
        name: 'O',
        status: 'active',
      });
      expect((await post('other-shop', { 'mcp-session-id': sid })).status).toBe(404);
      const del = await fetch(`${base}/mcp/m/live-shop`, {
        method: 'DELETE',
        headers: { 'mcp-session-id': sid },
      });
      expect(del.status).toBe(200);
      expect((await post('live-shop', { 'mcp-session-id': sid })).status).toBe(404);
    });
  });

  it('SF10: the shop.* definition hash is in the server-card and moves with any definition change', async () => {
    const card = JSON.parse(
      readFileSync(join(__dirname, '../../static/.well-known/mcp/server-card.json'), 'utf8'),
    ) as { shop_tools: { version: string; count: number; sha256: string } };
    const defs = await shopToolDefinitions();
    expect(card.shop_tools).toEqual({
      version: SHOP_TOOLS_VERSION,
      count: defs.length,
      sha256: hashDefinitions(defs),
    });
    const changed = JSON.parse(JSON.stringify(defs)) as Array<Record<string, unknown>>;
    const quote = changed.find((d) => d.name === 'shop.order.quote')!;
    quote.description = `${String(quote.description)} (edited)`;
    expect(hashDefinitions(changed)).not.toBe(card.shop_tools.sha256);
    // key order does not matter (canonical JSON)
    const reordered = defs.map((d) => Object.fromEntries(Object.entries(d).reverse()));
    expect(hashDefinitions(reordered)).toBe(card.shop_tools.sha256);
  });

  it('SF12: the probe sets storefront_probe_coverage = probed / active', async () => {
    const executed: unknown[][] = [];
    const db = {
      $queryRawUnsafe: async (sql: string) =>
        sql.includes('count(*)') ? [{ n: 4 }] : [{ slug: 'aaa-shop' }, { slug: 'bbb-shop' }],
      $executeRawUnsafe: async (_s: string, ...v: unknown[]) => void executed.push(v),
    };
    const r = await runShopStorefrontProbe({
      db: db as never,
      selfTest: async () => {
        throw new Error('down');
      },
    });
    expect(r).toMatchObject({ active: 4, probed: 2, failed: 2, coverage: 0.5 });
    expect(executed).toEqual([
      ['storefront_probe_failed', '/mcp/m/aaa-shop'],
      ['storefront_probe_failed', '/mcp/m/bbb-shop'],
    ]);
    const metrics = await register.metrics();
    expect(metrics).toMatch(/^storefront_probe_coverage 0\.5$/m);
  });

  it('/mcp: the tool count grows by exactly the shop.* tools, once', async () => {
    const full = await listOf(createMcpServer('', 'req', {} as never));
    const shopNames = full.filter((n) => n.startsWith('shop.'));
    const expected = [...MERCHANT_TOOL_NAMES, ...CATALOG_TOOL_NAMES, ...ORDER_TOOL_NAMES];
    expect(shopNames.sort()).toEqual([...expected].sort());
    expect(new Set(full).size).toBe(full.length);
    // everything else is what registerTools alone gives: /mcp is otherwise unchanged
    const base = new McpServer({ name: 'b', version: '0' });
    registerTools(base, '', 'req', {} as never);
    const baseNames = await listOf(base);
    expect(full.filter((n) => !n.startsWith('shop.')).sort()).toEqual(baseNames.sort());
    expect(shopNames).toHaveLength(18);
  });
});
