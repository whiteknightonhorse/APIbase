import { timingSafeEqual } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { X_ORCHESTRA_KEY } from '../../config/http-headers';
import { defaultShopDeps, type ShopDeps } from '../merchant-lifecycle.service';
import { LlmReviewError, listPending, recordResult } from '../moderation/llm-review.service';

export interface ModerationInternalOptions {
  deps?: ShopDeps;
  /** service key; default is the ORCHESTRA_INTERNAL_KEY variable. Unset = the routes answer 503. */
  key?: () => string | undefined;
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * F-13 layer 3 service routes for the nightly orchestra (T-INT-33). Not for merchants or agents:
 * every call needs the service key in `x-orchestra-key`; with no key configured the routes are closed.
 */
export function createModerationInternalRouter(opts: ModerationInternalOptions = {}): Router {
  const router = Router();
  const deps = () => opts.deps ?? defaultShopDeps();
  const key = opts.key ?? (() => process.env.ORCHESTRA_INTERNAL_KEY);

  router.use(
    '/api/v1/shop/internal',
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: true,
      legacyHeaders: false,
      validate: false,
      handler: (_req, res) => {
        res.status(429).json({ error: 'rate_limited', message: 'too many requests' });
      },
    }),
    (req: Request, res: Response, next: NextFunction) => {
      const want = key();
      if (!want || want.length < 16) {
        res
          .status(503)
          .json({ error: 'unavailable', message: 'internal routes are not configured' });
        return;
      }
      const got = req.header(X_ORCHESTRA_KEY);
      if (!got || !same(got, want)) {
        res.status(401).json({ error: 'unauthorized', message: 'service key required' });
        return;
      }
      next();
    },
  );

  const fail = (res: Response, err: unknown) => {
    if (err instanceof LlmReviewError) {
      res.status(err.status).json({ error: err.code, message: err.message });
      return;
    }
    res.status(503).json({ error: 'unavailable', message: 'moderation review unavailable' });
  };

  router.get('/api/v1/shop/internal/moderation/pending', async (_req, res) => {
    try {
      res.set('Cache-Control', 'no-store').json({ merchants: await listPending(deps().db) });
    } catch (err) {
      fail(res, err);
    }
  });

  router.post('/api/v1/shop/internal/moderation/result', async (req, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const out = await deps().transaction((tx) => recordResult(tx, body));
      res.set('Cache-Control', 'no-store').json({ recorded: true, ...out });
    } catch (err) {
      fail(res, err);
    }
  });

  return router;
}
