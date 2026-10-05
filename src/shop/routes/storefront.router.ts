import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { X_ROBOTS_TAG } from '../../config/http-headers';
import { defaultShopDeps } from '../merchant-lifecycle.service';
import type { ShopTx } from '../db';
import {
  getProductCard,
  listProducts,
  listShops,
  loadShop,
  MCP_URL,
  priceCart,
  PUBLIC_BASE,
  REST_BASE,
  StorefrontError,
  type CartLine,
  type PublicProduct,
  type PublicProductCard,
  type PublicShop,
} from '../storefront/storefront.service';

export interface StorefrontRouterOptions {
  db?: ShopTx;
  /** requests per minute per address on each public prefix (§6.3: 60). */
  limit?: number;
}

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** JSON for an inline <script type="application/ld+json">: `<` can never close the tag. */
const ldJson = (o: unknown) => JSON.stringify(o).replace(/</g, '\\u003c');

const STYLE =
  'body{background:#0b0e11;color:#d7dde4;font:15px/1.6 ui-monospace,Menlo,Consolas,monospace;margin:0}' +
  'main{max-width:820px;margin:0 auto;padding:24px 16px}a{color:#4cc2ff}h1,h2{color:#fff}' +
  'table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #222;padding:4px 8px;text-align:left}' +
  'code{background:#1a2027;padding:1px 4px}.warn{color:#ffb454}.muted{color:#9aa5b1}';

function page(title: string, body: string, opts: { noindex?: boolean; ld?: unknown[] } = {}) {
  return (
    '<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    (opts.noindex ? '<meta name="robots" content="noindex, follow">' : '') +
    `<title>${esc(title)} — APIbase</title><style>${STYLE}</style>` +
    (opts.ld ?? [])
      .map((o) => `<script type="application/ld+json">${ldJson(o)}</script>`)
      .join('') +
    `</head><body><main><nav><a href="/">APIbase.pro</a> | <a href="/catalog">Catalog</a> | <a href="/shops">Shops</a></nav>${body}</main></body></html>\n`
  );
}

const wantsMarkdown = (req: Request) => /text\/markdown/i.test(req.get('accept') ?? '');
const wantsJson = (req: Request) =>
  /application\/json/i.test(req.get('accept') ?? '') &&
  !/text\/html/i.test(req.get('accept') ?? '');

const kv = (o: Record<string, unknown>): Array<[string, string]> =>
  Object.entries(o).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]);

const shopUrl = (slug: string) => `${PUBLIC_BASE}/m/${slug}`;
const productUrl = (slug: string, sku: string) => `${shopUrl(slug)}/p/${encodeURIComponent(sku)}`;

const offerLd = (slug: string, p: PublicProduct) => ({
  '@type': 'Offer',
  url: productUrl(slug, p.sku),
  sku: p.sku,
  name: p.title,
  price: p.price_usd,
  priceCurrency: 'USD',
  availability:
    p.availability === 'in_stock' ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
  potentialAction: { '@type': 'BuyAction', target: MCP_URL },
});

const domainNote = (s: PublicShop) => (s.domain_verified ? 'domain_verified' : 'unverified_domain');

function shopMarkdown(s: PublicShop, products: PublicProduct[]): string {
  return [
    `# ${s.name}`,
    '',
    `- category: ${s.category}`,
    `- site: ${s.site_url}`,
    `- domain: ${domainNote(s)}`,
    `- storefront (MCP): ${MCP_URL}`,
    ...kv(s.reputation).map(([k, v]) => `- reputation.${k}: ${v}`),
    ...kv(s.policy).map(([k, v]) => `- policy.${k}: ${v}`),
    '',
    '## Products',
    '',
    ...products.map(
      (p) => `- [${p.title}](${productUrl(s.slug, p.sku)}) — $${p.price_usd} (${p.availability})`,
    ),
    '',
  ].join('\n');
}

function shopHtml(s: PublicShop, products: PublicProduct[]): string {
  const rows = products
    .map(
      (p) =>
        `<tr><td><a href="/m/${esc(s.slug)}/p/${encodeURIComponent(p.sku)}">${esc(p.title)}</a></td>` +
        `<td>$${esc(p.price_usd)}</td><td>${esc(p.availability)}</td></tr>`,
    )
    .join('');
  const ld = [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: s.name,
      url: shopUrl(s.slug),
      sameAs: [s.site_url],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: products.map((p) => offerLd(s.slug, p)),
    },
  ];
  const body =
    `<h1>${esc(s.name)}</h1><p class="muted">${esc(s.category)} · <a href="${esc(s.site_url)}" rel="nofollow noopener">${esc(s.site_url)}</a></p>` +
    (s.domain_verified
      ? '<p>domain_verified</p>'
      : '<p class="warn">unverified_domain — the merchant has not yet proven control of this site</p>') +
    `<h2>Buy with an AI agent</h2><p>Storefront: <code>${esc(MCP_URL)}</code></p>` +
    `<h2>Policy</h2><ul>${kv(s.policy)
      .map(([k, v]) => `<li>${esc(k)}: ${esc(v)}</li>`)
      .join('')}</ul>` +
    `<h2>Reputation</h2><ul>${kv(s.reputation)
      .map(([k, v]) => `<li>${esc(k)}: ${esc(v)}</li>`)
      .join('')}</ul>` +
    `<h2>Products</h2><table><tr><th>Product</th><th>Price</th><th>Stock</th></tr>${rows}</table>`;
  return page(s.name, body, { ld });
}

function productMarkdown(s: PublicShop, p: PublicProductCard): string {
  return [
    `# ${p.title}`,
    '',
    `Sold by [${s.name}](${shopUrl(s.slug)}) — $${p.price_usd} USD, ${p.availability}`,
    '',
    p.description,
    '',
    `Buy with an AI agent: ${MCP_URL} (shop.quote.create, merchant "${s.slug}", sku "${p.sku}")`,
    '',
  ].join('\n');
}

function productHtml(s: PublicShop, p: PublicProductCard): string {
  const ld = [
    {
      '@context': 'https://schema.org',
      '@type': 'Product',
      sku: p.sku,
      name: p.title,
      description: p.description,
      category: p.category ?? undefined,
      image: p.images.length ? p.images : undefined,
      offers: offerLd(s.slug, p),
    },
  ];
  const body =
    `<h1>${esc(p.title)}</h1><p>Sold by <a href="/m/${esc(s.slug)}">${esc(s.name)}</a></p>` +
    `<p><strong>$${esc(p.price_usd)} USD</strong> · ${esc(p.availability)}${p.tax_included ? ' · tax included' : ''}</p>` +
    `<p>${esc(p.description)}</p>` +
    `<p>Returns: ${p.refund_policy.returns_accepted ? `accepted${p.refund_policy.refund_window_days ? ` within ${p.refund_policy.refund_window_days} days` : ''}` : 'not accepted'}</p>` +
    `<p>Your AI agent can buy this at <code>${esc(MCP_URL)}</code>.</p>`;
  return page(p.title, body, { noindex: true, ld });
}

function cartText(s: PublicShop, lines: CartLine[], total: string): string {
  return `Your agent can create a quote: call shop.quote.create at ${MCP_URL} with merchant "${s.slug}" and items ${JSON.stringify(lines.map((l) => ({ sku: l.sku, qty: l.qty })))} (total $${total} USD at current prices)`;
}

function cartMarkdown(s: PublicShop, lines: CartLine[], total: string): string {
  return [
    `# Cart — ${s.name}`,
    '',
    ...lines.map(
      (l) => `- ${l.qty} × ${l.title} (${l.sku}) @ $${l.unit_price_usd} = $${l.line_total_usd}`,
    ),
    '',
    `Total: $${total} USD`,
    '',
    cartText(s, lines, total),
    '',
  ].join('\n');
}

function cartHtml(s: PublicShop, lines: CartLine[], total: string): string {
  const rows = lines
    .map(
      (l) =>
        `<tr><td>${esc(l.title)} <span class="muted">(${esc(l.sku)})</span></td><td>${l.qty}</td><td>$${esc(l.unit_price_usd)}</td><td>$${esc(l.line_total_usd)}</td></tr>`,
    )
    .join('');
  return page(
    `Cart — ${s.name}`,
    `<h1>Cart — <a href="/m/${esc(s.slug)}">${esc(s.name)}</a></h1><table><tr><th>Item</th><th>Qty</th><th>Price</th><th>Sum</th></tr>${rows}</table>` +
      `<p><strong>Total: $${esc(total)} USD</strong></p><p>${esc(cartText(s, lines, total))}</p><p class="muted">No payment is taken in the browser.</p>`,
    { noindex: true },
  );
}

const agentJson = (s: PublicShop, sample: PublicProduct[]) => ({
  slug: s.slug,
  name: s.name,
  category: s.category,
  mcp_url: MCP_URL,
  rest_base: REST_BASE,
  payment: { rails: ['x402', 'mpp'] },
  policy: s.policy,
  products_sample: sample.slice(0, 3),
});

const llmsTxt = (s: PublicShop, sample: PublicProduct[]) =>
  [
    `# ${s.name}`,
    '',
    `> ${s.category} shop on APIbase.`,
    '',
    `AI agents can buy here: connect to ${MCP_URL} (MCP) and call shop.catalog.search / shop.quote.create with merchant "${s.slug}".`,
    `Machine-readable: ${shopUrl(s.slug)}/agent.json`,
    '',
    ...sample.map((p) => `- ${p.title} (${p.sku}) — $${p.price_usd}`),
    '',
  ].join('\n');

const errBody = (e: StorefrontError) => ({
  error: e.code,
  error_code: e.code,
  message: e.message,
  suggested_action: e.status === 400 ? 'fix_request' : 'use_different_tool',
  documentation_url: '/docs/integrator',
});

/** §6.3 public storefront: /shops, /m/:slug…, and the REST twin under /api/v1/shop/shops. */
export function createStorefrontRouter(opts: StorefrontRouterOptions = {}): Router {
  const db = () => opts.db ?? defaultShopDeps().db;
  const router = Router();
  const limiter = () =>
    rateLimit({
      windowMs: 60_000,
      limit: opts.limit ?? 60,
      standardHeaders: true,
      legacyHeaders: false,
      validate: false,
      handler: (_req, res) => {
        res.status(429).json({
          error: 'rate_limited',
          error_code: 'rate_limited',
          message: 'too many requests from this address',
          suggested_action: 'retry_after_delay',
          documentation_url: '/docs/integrator',
        });
      },
    });
  router.use('/m', limiter());
  router.use('/shops', limiter());
  router.use('/api/v1/shop/shops', limiter());

  const guard =
    (fn: (req: Request, res: Response) => Promise<void>) => async (req: Request, res: Response) => {
      try {
        await fn(req, res);
      } catch (e) {
        if (e instanceof StorefrontError) {
          res.status(e.status).json(errBody(e));
          return;
        }
        res.status(503).json({
          error: 'unavailable',
          error_code: 'storefront_unavailable',
          message: 'storefront temporarily unavailable',
          suggested_action: 'retry_after_delay',
          documentation_url: '/docs/integrator',
        });
      }
    };

  const sendText = (res: Response, req: Request, html: () => string, md: () => string) => {
    res.set('Vary', 'Accept');
    if (wantsMarkdown(req)) res.type('text/markdown; charset=utf-8').send(md());
    else res.type('html').send(html());
  };

  // ---- JSON: /api/v1/shop/shops[/:slug[/products]] and /shops/:slug[/products] ----
  const jsonIndex = guard(async (req, res) => {
    res.json(await listShops(db(), Number(req.query.page)));
  });
  const jsonShop = guard(async (req, res) => {
    res.json((await loadShop(db(), req.params.slug)).shop);
  });
  const jsonProducts = guard(async (req, res) => {
    const { merchant_id } = await loadShop(db(), req.params.slug);
    res.json({ products: await listProducts(db(), merchant_id) });
  });
  router.get('/api/v1/shop/shops', jsonIndex);
  router.get('/api/v1/shop/shops/:slug', jsonShop);
  router.get('/api/v1/shop/shops/:slug/products', jsonProducts);
  router.get('/shops/:slug', jsonShop);
  router.get('/shops/:slug/products', jsonProducts);

  // ---- /shops index (HTML / markdown / JSON) ----
  router.get(
    '/shops',
    guard(async (req, res) => {
      const r = await listShops(db(), Number(req.query.page));
      if (wantsJson(req)) {
        res.json(r);
        return;
      }
      const pages = Math.max(1, Math.ceil(r.total / r.page_size));
      const nav =
        (r.page > 1 ? `<a href="/shops?page=${r.page - 1}">prev</a> ` : '') +
        (r.page < pages ? `<a href="/shops?page=${r.page + 1}">next</a>` : '');
      sendText(
        res,
        req,
        () =>
          page(
            'Shops',
            `<h1>Shops</h1><p class="muted">${r.total} shops · page ${r.page}/${pages}</p><ul>` +
              r.shops
                .map(
                  (s) =>
                    `<li><a href="/m/${esc(s.slug)}">${esc(s.name)}</a> <span class="muted">${esc(s.category)}</span></li>`,
                )
                .join('') +
              `</ul><p>${nav}</p>`,
          ),
        () =>
          `# Shops\n\n${r.shops.map((s) => `- [${s.name}](${shopUrl(s.slug)}) — ${s.category}`).join('\n')}\n\npage ${r.page}/${pages}\n`,
      );
    }),
  );

  // ---- /m/:slug… ----
  router.get(
    '/m/:slug',
    guard(async (req, res) => {
      const { merchant_id, shop } = await loadShop(db(), req.params.slug);
      const products = await listProducts(db(), merchant_id);
      sendText(
        res,
        req,
        () => shopHtml(shop, products),
        () => shopMarkdown(shop, products),
      );
    }),
  );
  router.get(
    '/m/:slug/p/:sku',
    guard(async (req, res) => {
      const { merchant_id, shop } = await loadShop(db(), req.params.slug);
      const p = await getProductCard(db(), merchant_id, String(req.params.sku));
      sendText(
        res,
        req,
        () => productHtml(shop, p),
        () => productMarkdown(shop, p),
      );
    }),
  );
  router.get(
    '/m/:slug/cart',
    guard(async (req, res) => {
      const { merchant_id, shop } = await loadShop(db(), req.params.slug);
      const { lines, total_usd } = await priceCart(db(), merchant_id, req.query.items);
      res.set(X_ROBOTS_TAG, 'noindex');
      sendText(
        res,
        req,
        () => cartHtml(shop, lines, total_usd),
        () => cartMarkdown(shop, lines, total_usd),
      );
    }),
  );
  router.get(
    '/m/:slug/agent.json',
    guard(async (req, res) => {
      const { merchant_id, shop } = await loadShop(db(), req.params.slug);
      res.json(agentJson(shop, await listProducts(db(), merchant_id, 3)));
    }),
  );
  router.get(
    '/m/:slug/llms.txt',
    guard(async (req, res) => {
      const { merchant_id, shop } = await loadShop(db(), req.params.slug);
      res
        .type('text/plain; charset=utf-8')
        .send(llmsTxt(shop, await listProducts(db(), merchant_id, 3)));
    }),
  );

  return router;
}
