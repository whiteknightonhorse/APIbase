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
  priceCart,
  StorefrontError,
} from '../storefront/storefront.service';
import {
  agentJson,
  cartHtml,
  cartMarkdown,
  llmsTxt,
  productHtml,
  productMarkdown,
  shopHtml,
  shopMarkdown,
  shopsHtml,
  shopsMarkdown,
} from '../storefront/storefront.view';

export interface StorefrontRouterOptions {
  db?: ShopTx;
  /** requests per minute per address on each public prefix (§6.3: 60). */
  limit?: number;
}

const wantsMarkdown = (req: Request) => /text\/markdown/i.test(req.get('accept') ?? '');
const wantsJson = (req: Request) =>
  /application\/json/i.test(req.get('accept') ?? '') &&
  !/text\/html/i.test(req.get('accept') ?? '');

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
      sendText(
        res,
        req,
        () => shopsHtml(r),
        () => shopsMarkdown(r),
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
