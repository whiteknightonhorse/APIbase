/** T-0319: sitemap-shops-index.xml and shards are rendered by the app from shop_merchants. Mocked DB. */
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createStorefrontRouter } from '../../src/shop/routes/storefront.router';
import { resetSitemapCache } from '../../src/shop/storefront/storefront.service';
import { logger } from '../../src/config/logger';

jest.mock('../../src/config/index', () => ({
  config: { ENCRYPTION_KEY: 'k'.repeat(40), X402_NETWORK: 'base' },
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

interface Row {
  slug: string;
  status: string;
  created_at: Date;
  domain_verified: boolean;
}

/** Interprets only the two sitemap queries; honours the status filter exactly when the SQL has it. */
function fakeDb(rows: Row[]) {
  return {
    $queryRawUnsafe: jest.fn(async (sql: string, ...args: unknown[]) => {
      const byStatus = /status = 'active'/.test(sql)
        ? rows.filter((r) => r.status === 'active')
        : rows;
      const pool = /AND domain_verified/.test(sql)
        ? byStatus.filter((r) => r.domain_verified)
        : byStatus;
      if (/count\(\*\)/.test(sql)) {
        const last = pool.reduce<Date | null>(
          (m, r) => (m === null || r.created_at > m ? r.created_at : m),
          null,
        );
        return [{ n: pool.length, last }];
      }
      const [limit, offset] = args as [number, number];
      return [...pool]
        .sort((a, b) => a.slug.localeCompare(b.slug))
        .slice(offset, offset + limit)
        .map((r) => ({ slug: r.slug }));
    }),
  };
}

const mk = (slug: string, status = 'active', domain_verified = true): Row => ({
  slug,
  status,
  domain_verified,
  created_at: new Date('2026-10-01T12:00:00Z'),
});

describe('shop sitemap (T-0319)', () => {
  let server: Server | undefined;
  let base = '';

  const start = async (rows: Row[]) => {
    resetSitemapCache();
    const app = express();
    app.use(createStorefrontRouter({ db: fakeDb(rows) as never, limit: 1000 }));
    await new Promise<void>((r) => {
      server = app.listen(0, '127.0.0.1', () => r());
    });
    base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
  };
  afterEach(async () => {
    await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
    server = undefined;
  });

  it('S1 index lists one shard for 2 active shops, two for 10 001', async () => {
    await start([mk('shop-a'), mk('shop-b')]);
    const one = await (await fetch(`${base}/sitemap-shops-index.xml`)).text();
    expect(one.match(/<sitemap>/g)).toHaveLength(1);
    expect(one).toContain('<loc>https://apibase.pro/sitemap-shops-1.xml</loc>');
    expect(one).toContain('<lastmod>2026-10-01</lastmod>');
    await server!.close();
    await start(Array.from({ length: 10001 }, (_, i) => mk(`shop-${String(i).padStart(5, '0')}`)));
    const two = await (await fetch(`${base}/sitemap-shops-index.xml`)).text();
    expect(two.match(/<sitemap>/g)).toHaveLength(2);
    const s2 = await (await fetch(`${base}/sitemap-shops-2.xml`)).text();
    expect(s2.match(/<loc>/g)).toHaveLength(1);
  });

  it('S1b zero active shops -> index without <sitemap>', async () => {
    await start([mk('shop-x', 'suspended')]);
    const xml = await (await fetch(`${base}/sitemap-shops-index.xml`)).text();
    expect(xml).toContain('<sitemapindex');
    expect(xml).not.toContain('<sitemap>');
  });

  it('S2 shard 1 holds exactly the active /m/<slug> URLs', async () => {
    await start([mk('shop-a'), mk('shop-b')]);
    const xml = await (await fetch(`${base}/sitemap-shops-1.xml`)).text();
    expect([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])).toEqual([
      'https://apibase.pro/m/shop-a',
      'https://apibase.pro/m/shop-b',
    ]);
    expect(xml).not.toMatch(/\/p\/|\/cart|\/owner/);
  });

  it('S3 shard 0, shard past the end and non-numeric shard are 404', async () => {
    await start([mk('shop-a'), mk('shop-b')]);
    for (const p of ['/sitemap-shops-0.xml', '/sitemap-shops-2.xml', '/sitemap-shops-x.xml']) {
      expect([p, (await fetch(`${base}${p}`)).status]).toEqual([p, 404]);
    }
  });

  it('S3b T-0536 an unverified-domain shop is absent from the index and the shard', async () => {
    await start([mk('shop-a'), mk('shop-unv', 'active', false)]);
    const idx = await (await fetch(`${base}/sitemap-shops-index.xml`)).text();
    expect(idx.match(/<sitemap>/g)).toHaveLength(1);
    const xml = await (await fetch(`${base}/sitemap-shops-1.xml`)).text();
    expect(xml).toContain('/m/shop-a<');
    expect(xml).not.toContain('shop-unv');
  });

  it('S4 suspended and deactivated sellers are absent', async () => {
    await start([mk('shop-a'), mk('shop-sus', 'suspended'), mk('shop-off', 'deactivated')]);
    const xml = await (await fetch(`${base}/sitemap-shops-1.xml`)).text();
    expect(xml).toContain('/m/shop-a<');
    expect(xml).not.toContain('shop-sus');
    expect(xml).not.toContain('shop-off');
    const idx = await (await fetch(`${base}/sitemap-shops-index.xml`)).text();
    expect(idx.match(/<sitemap>/g)).toHaveLength(1);
  });

  it('S5 headers', async () => {
    await start([mk('shop-a')]);
    for (const p of ['/sitemap-shops-index.xml', '/sitemap-shops-1.xml']) {
      const r = await fetch(`${base}${p}`);
      expect(r.headers.get('content-type')).toMatch(/^application\/xml/);
      expect(r.headers.get('cache-control')).toBe('public, max-age=600');
    }
  });

  it('S6 unexpected DB error -> 503 storefront_unavailable and the cause is logged', async () => {
    resetSitemapCache();
    (logger.error as jest.Mock).mockClear();
    const db = {
      $queryRawUnsafe: jest.fn(async () => {
        throw new Error('column "x" does not exist');
      }),
    };
    const app = express();
    app.use(createStorefrontRouter({ db: db as never, limit: 1000 }));
    await new Promise<void>((r) => {
      server = app.listen(0, '127.0.0.1', () => r());
    });
    base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
    const r = await fetch(`${base}/sitemap-shops-index.xml`);
    expect(r.status).toBe(503);
    expect((await r.json()).error_code).toBe('storefront_unavailable');
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(JSON.stringify((logger.error as jest.Mock).mock.calls[0])).toContain('does not exist');
  });
});
