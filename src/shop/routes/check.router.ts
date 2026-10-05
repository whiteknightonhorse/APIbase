import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { runCheck, toPublicReport, type CheckDeps, type PublicCheckReport } from '../check.service';
import { defaultShopDeps } from '../merchant-lifecycle.service';
import { loadShop, StorefrontError } from '../storefront/storefront.service';

export interface CheckRouterOptions {
  deps?: CheckDeps;
  /** requests per minute per address (default 20). */
  limit?: number;
  /** how long one slug's report is reused (default 60 s): bounds quotes and webhook pings. */
  ttlMs?: number;
}

const CACHE_MAX = 1000;

/**
 * F-17: public `GET /integrator/check/:slug` -- the statuses of the connection steps and their
 * codes, nothing else (no webhook URL, email, payout address or response bodies; those need the key).
 */
export function createCheckRouter(opts: CheckRouterOptions = {}): Router {
  const router = Router();
  const deps = () => opts.deps ?? defaultShopDeps();
  const ttl = opts.ttlMs ?? 60_000;
  const cache = new Map<string, { at: number; report: PublicCheckReport }>();

  router.use(
    '/integrator/check',
    rateLimit({
      windowMs: 60_000,
      limit: opts.limit ?? 20,
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
    }),
  );

  router.get('/integrator/check/:slug', async (req: Request, res: Response) => {
    try {
      const d = deps();
      const { merchant_id, shop } = await loadShop(d.db, req.params.slug);
      const now = (d.now ?? Date.now)();
      const hit = cache.get(shop.slug);
      if (hit && now - hit.at < ttl) {
        res.set('Cache-Control', 'public, max-age=30').json(hit.report);
        return;
      }
      const report = toPublicReport(shop.slug, await runCheck(d, merchant_id), now);
      cache.delete(shop.slug);
      cache.set(shop.slug, { at: now, report });
      while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
      res.set('Cache-Control', 'public, max-age=30').json(report);
    } catch (err) {
      if (err instanceof StorefrontError) {
        res.status(err.status).json({
          error: err.code,
          error_code: err.code,
          message: err.message,
          suggested_action: 'use_different_tool',
          documentation_url: '/docs/integrator',
        });
        return;
      }
      res.status(503).json({
        error: 'unavailable',
        error_code: 'check_unavailable',
        message: 'check temporarily unavailable',
        suggested_action: 'retry_after_delay',
        documentation_url: '/docs/integrator',
      });
    }
  });

  return router;
}
