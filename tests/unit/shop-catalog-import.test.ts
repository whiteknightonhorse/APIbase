/** T-INT-32 IM1-IM7: catalog feed import (CSV, Google Merchant Center, Shopify). No real HTTP. */
import { CatalogError } from '../../src/shop/catalog.errors';
import { ShopAuthError } from '../../src/shop/auth/errors';
import {
  createImport,
  runImportJob,
  runShopCatalogImport,
} from '../../src/shop/catalog-import/import.service';
import {
  fetchFeed,
  MAX_FEED_BYTES,
  type FeedTransport,
} from '../../src/shop/catalog-import/feed-fetch';
import { parseCsv, parseGmc, parseShopify } from '../../src/shop/catalog-import/parsers';
import type { CatalogReport } from '../../src/shop/catalog.service';
import type { ShopDeps } from '../../src/shop/merchant-lifecycle.service';
import { client, dbDescribe, migrate, mkMerchant } from './helpers/shop-db';

jest.mock('../../src/config', () => ({ config: { ENCRYPTION_KEY: 'k'.repeat(40) } }));

const PUBLIC = async () => ['93.184.216.34'];
const ok =
  (body: string | Buffer, status = 200): FeedTransport =>
  async () => ({
    status,
    body: Buffer.from(body),
  });

const csvOf = (n: number, over = '') =>
  'sku,title,description,price_usd,category,stock\n' +
  Array.from({ length: n }, (_, i) => `s${i},Skates ${i},good,10.00,sporting-goods,5${over}`).join(
    '\n',
  );

const gmc = (items: string) =>
  `<?xml version="1.0"?><rss xmlns:g="http://base.google.com/ns/1.0" version="2.0"><channel>${items}</channel></rss>`;
const gItem = (id: string, price: string, extra = '') =>
  `<item><g:id>${id}</g:id><g:title><![CDATA[Skates & more]]></g:title><g:description>good</g:description>` +
  `<g:link>https://shop.example/p/${id}</g:link><g:image_link>https://shop.example/i/${id}.jpg</g:image_link>` +
  `<g:price>${price}</g:price><g:availability>in stock</g:availability><g:product_type>sporting-goods</g:product_type>${extra}</item>`;

const shopifyFixture = {
  products: [
    {
      id: 101,
      title: 'Hoodie',
      body_html: '<p>warm</p>',
      product_type: 'clothing',
      options: [{ name: 'Size' }],
      images: [{ src: 'https://cdn.example/h.jpg' }],
      variants: [
        { id: 1, sku: 'HOOD-S', title: 'S', price: '49.00', option1: 'S', available: true },
        { id: 2, sku: '', title: 'M', price: '52.00', option1: 'M', available: false },
      ],
    },
  ],
};

describe('feed parsers (no DB)', () => {
  it('CSV: RFC 4180 quoting, F-2 columns', () => {
    const p = parseCsv(
      'sku,title,price_usd,category,images\r\na,"Skates, pro ""X""",19.5,books,https://a.example/1.jpg|https://a.example/2.jpg\r\n',
    );
    expect(p.items[0]).toMatchObject({
      sku: 'a',
      title: 'Skates, pro "X"',
      price_usd: '19.5',
      images: ['https://a.example/1.jpg', 'https://a.example/2.jpg'],
    });
  });
  it('IM2: GMC price in EUR is rejected with the reason; USD maps to price_usd, availability to stock', () => {
    const p = parseGmc(gmc(gItem('g1', '12.50 USD') + gItem('g2', '12.50 EUR')));
    expect(p.items).toHaveLength(1);
    expect(p.items[0]).toMatchObject({
      sku: 'g1',
      title: 'Skates & more',
      price_usd: '12.50',
      stock: null,
    });
    expect(p.rejected).toEqual([{ sku: 'g2', reason: expect.stringContaining('EUR') }]);
  });
  it('GMC: out of stock -> 0; DOCTYPE/ENTITY refused', () => {
    const out = gItem('g3', '5 USD').replace('in stock', 'out of stock');
    expect(parseGmc(gmc(out)).items[0]).toMatchObject({ stock: 0 });
    expect(() => parseGmc('<!DOCTYPE x [<!ENTITY a "b">]>' + gmc(gItem('g', '5 USD')))).toThrow();
  });
  it('IM3: Shopify products[].variants[] -> variants and price', () => {
    const p = parseShopify([shopifyFixture]);
    expect(p.items).toHaveLength(1);
    const it = p.items[0] as { variants: Array<Record<string, unknown>>; price_usd: string };
    expect(it.price_usd).toBe('49');
    expect(it.variants.map((v) => v.sku)).toEqual(['HOOD-S', 'v2']);
    expect(it.variants[0]).toMatchObject({ price_usd: '49.00', attributes: { Size: 'S' } });
    expect(it.variants[1]).toMatchObject({ stock: 0 });
  });
});

describe('IM4/IM5 download rules (no DB)', () => {
  const db = {
    transaction: () => Promise.reject(new Error('must not be reached')),
  } as unknown as ShopDeps;
  it('IM4: http:// -> 400', async () => {
    await expect(
      createImport(
        db,
        'm',
        { source: 'gmc', url: 'http://shop.example/feed.xml' },
        { resolve: PUBLIC },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('IM4: private / loopback address -> 400', async () => {
    for (const host of ['10.0.0.5', '127.0.0.1', '169.254.169.254']) {
      await expect(
        createImport(
          db,
          'm',
          { source: 'gmc', url: `https://${host}/feed.xml` },
          { resolve: PUBLIC },
        ),
      ).rejects.toMatchObject({ status: 400 });
    }
    await expect(
      createImport(
        db,
        'm',
        { source: 'shopify', url: 'https://evil.example/' },
        { resolve: async () => ['192.168.1.9'] },
      ),
    ).rejects.toBeInstanceOf(CatalogError);
  });
  it('IM4: a redirect is refused, never followed', async () => {
    let calls = 0;
    const t: FeedTransport = async () => {
      calls++;
      return { status: 302, body: Buffer.alloc(0) };
    };
    await expect(
      fetchFeed('https://shop.example/f.xml', { resolve: PUBLIC, transport: t }),
    ).rejects.toThrow(/redirect/);
    expect(calls).toBe(1);
  });
  it('the connection is pinned to the resolved public address', async () => {
    let ip = '';
    await fetchFeed('https://shop.example/f.xml', {
      resolve: PUBLIC,
      transport: async (r) => {
        ip = r.target.ip;
        return { status: 200, body: Buffer.from('x') };
      },
    });
    expect(ip).toBe('93.184.216.34');
  });
  it('IM5: 11 MB is refused, 10 MB passes', async () => {
    await expect(
      fetchFeed('https://shop.example/f.csv', {
        resolve: PUBLIC,
        transport: ok(Buffer.alloc(11 * 1024 * 1024)),
      }),
    ).rejects.toThrow(/10 MB/);
    const edge = await fetchFeed('https://shop.example/f.csv', {
      resolve: PUBLIC,
      transport: ok(Buffer.alloc(MAX_FEED_BYTES)),
    });
    expect(edge.length).toBe(MAX_FEED_BYTES);
  });
  it('IM5: a csv body over 10 MB is refused at request time', async () => {
    await expect(
      createImport(db, 'm', { source: 'csv', body: 'a'.repeat(11 * 1024 * 1024) }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('job runner with a fake store (no DB)', () => {
  const mkDeps = () => {
    const updates: unknown[][] = [];
    const d = {
      db: {
        $executeRawUnsafe: async (_q: string, ...v: unknown[]) => {
          updates.push(v);
          return 1;
        },
      },
    } as unknown as ShopDeps;
    return { d, updates };
  };
  const job = (over: object = {}) => ({
    import_job_id: 'j1',
    merchant_id: 'm1',
    source: 'csv' as const,
    url: null,
    body: csvOf(600),
    default_category: null,
    ...over,
  });

  it('IM1: 600 CSV rows -> 2 batches (500 + 100), report upserted=600', async () => {
    const { d, updates } = mkDeps();
    const sizes: number[] = [];
    await runImportJob(d, job(), {
      upsert: async (_m, items): Promise<CatalogReport> => {
        sizes.push(items.length);
        return { upserted: items.length, flagged: [], rejected: [], errors: [] };
      },
    });
    expect(sizes).toEqual([500, 100]);
    expect(updates[0].slice(1, 3)).toEqual([600, 600]);
  });
  it('maps upsert rejections and validation errors into rejected[{sku, reason}]', async () => {
    const { d, updates } = mkDeps();
    await runImportJob(d, job({ body: csvOf(2) }), {
      upsert: async () => ({
        upserted: 0,
        flagged: [],
        rejected: [{ sku: 's0', reason: 'prohibited category', category: 'gambling', status: 422 }],
        errors: [
          {
            index: 1,
            sku: 's1',
            status: 422,
            error_code: 'validation_failed',
            message: 'bad price',
          },
        ],
      }),
    });
    expect(JSON.parse(updates[0][3] as string)).toEqual([
      { sku: 's0', reason: 'prohibited category' },
      { sku: 's1', reason: 'bad price' },
    ]);
  });
  it('IM4/IM5 in the job: a redirecting or oversized feed fails the job with the reason', async () => {
    for (const [t, re] of [
      [ok('', 302), /redirect/],
      [ok(Buffer.alloc(MAX_FEED_BYTES + 1)), /10 MB/],
    ] as const) {
      const { d, updates } = mkDeps();
      await runImportJob(d, job({ source: 'gmc', url: 'https://shop.example/f.xml', body: null }), {
        resolve: PUBLIC,
        transport: t,
      });
      expect(updates[0][1]).toMatch(re);
    }
  });
  it('a feed pointing at a private address at run time fails the job (DNS re-checked)', async () => {
    const { d, updates } = mkDeps();
    await runImportJob(d, job({ source: 'gmc', url: 'https://shop.example/f.xml', body: null }), {
      resolve: async () => ['10.1.2.3'],
      transport: ok('x'),
    });
    expect(updates[0][1]).toMatch(/non-public/);
  });
});

dbDescribe('catalog import against Postgres', () => {
  const prisma = client();
  const d: ShopDeps = {
    db: prisma as never,
    transaction: (fn) => prisma.$transaction((tx) => fn(tx as never)),
  };
  let n = 0;
  const tag = () => `${Date.now().toString(36)}i${n++}`;

  beforeAll(() => migrate());
  afterAll(() => prisma.$disconnect());

  async function shop(): Promise<string> {
    const id = await mkMerchant(prisma, tag());
    for (const doc_id of ['merchant-agreement', 'aup', 'dpa', 'refund-framework']) {
      const have = await prisma.$queryRawUnsafe<unknown[]>(
        `SELECT 1 FROM shop_legal_docs WHERE doc_id = $1`,
        doc_id,
      );
      if (have.length === 0) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO shop_legal_docs (doc_id, version, sha256, url, effective_from, body_md)
           VALUES ($1, 'int32', $2, $3, now() - interval '1 day', 'b')`,
          doc_id,
          doc_id.padEnd(64, '0'),
          `/legal/${doc_id}`,
        );
      }
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO shop_acceptances (merchant_id, doc_id, version, sha256, method, signer, signature, message)
       SELECT DISTINCT ON (doc_id) $1::uuid, doc_id, version, sha256, 'wallet_signature', 's', 'sig', 'm'
         FROM shop_legal_docs WHERE doc_id IN ('merchant-agreement','aup','dpa','refund-framework')
        ORDER BY doc_id, effective_from DESC`,
      id,
    );
    await prisma.$executeRawUnsafe(
      `UPDATE shop_merchants SET status = 'active' WHERE merchant_id = $1::uuid`,
      id,
    );
    return id;
  }
  const report = async (id: string) =>
    (
      await prisma.$queryRawUnsafe<Array<Record<string, any>>>(
        `SELECT * FROM shop_catalog_imports WHERE import_job_id = $1::uuid`,
        id,
      )
    )[0];
  const tick = (transport: FeedTransport = ok('')) =>
    runShopCatalogImport(d, { resolve: PUBLIC, transport });

  it('IM1: 600 CSV rows through the real upsert -> upserted=600', async () => {
    const m = await shop();
    const { import_job_id } = await createImport(d, m, { source: 'csv', body: csvOf(600) });
    await tick();
    const r = await report(import_job_id);
    expect(r).toMatchObject({
      status: 'done',
      total: 600,
      upserted: 600,
      rejected_count: 0,
      body: null,
    });
    const c = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
      `SELECT count(*)::int n FROM shop_products WHERE merchant_id = $1::uuid`,
      m,
    );
    expect(c[0].n).toBe(600);
  });
  it('IM2/IM3/IM6: GMC with EUR and a gambling item; Shopify creates variants', async () => {
    const m = await shop();
    const feed = gmc(
      gItem('g1', '20.00 USD') +
        gItem('g2', '20.00 EUR') +
        gItem('g3', '20.00 USD').replace('sporting-goods', 'gambling'),
    );
    const a = await createImport(
      d,
      m,
      { source: 'gmc', url: 'https://shop.example/feed.xml' },
      { resolve: PUBLIC },
    );
    await tick(ok(feed));
    const r = await report(a.import_job_id);
    expect(r).toMatchObject({ status: 'done', total: 3, upserted: 1, rejected_count: 2 });
    const skus = (r.rejected as Array<{ sku: string; reason: string }>).map((x) => x.sku).sort();
    expect(skus).toEqual(['g2', 'g3']);

    const m2 = await shop();
    const b = await createImport(
      d,
      m2,
      { source: 'shopify', url: 'https://shop.example' },
      { resolve: PUBLIC },
    );
    await tick(ok(JSON.stringify(shopifyFixture)));
    expect(await report(b.import_job_id)).toMatchObject({ status: 'done', upserted: 1 });
    const v = await prisma.$queryRawUnsafe<Array<{ sku: string }>>(
      `SELECT v.sku FROM shop_product_variants v WHERE v.merchant_id = $1::uuid ORDER BY v.sku`,
      m2,
    );
    expect(v.map((x) => x.sku)).toEqual(['HOOD-S', 'v2']);
  });
  it('IM7: a second import within 10 minutes -> 429; another merchant is unaffected', async () => {
    const m = await shop();
    await createImport(d, m, { source: 'csv', body: csvOf(1) });
    await expect(createImport(d, m, { source: 'csv', body: csvOf(1) })).rejects.toMatchObject({
      status: 429,
    });
    await expect(createImport(d, m, { source: 'csv', body: csvOf(1) })).rejects.toBeInstanceOf(
      ShopAuthError,
    );
    await expect(
      createImport(d, await shop(), { source: 'csv', body: csvOf(1) }),
    ).resolves.toBeDefined();
    await prisma.$executeRawUnsafe(
      `UPDATE shop_catalog_imports SET created_at = now() - interval '11 minutes' WHERE merchant_id = $1::uuid`,
      m,
    );
    await expect(createImport(d, m, { source: 'csv', body: csvOf(1) })).resolves.toBeDefined();
  });
});
