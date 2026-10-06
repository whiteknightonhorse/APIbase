import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { X_OWNER_MESSAGE, X_OWNER_SIGNATURE } from '../../config/http-headers';
import { defaultShopDeps, type ShopDeps } from '../merchant-lifecycle.service';
import {
  authenticateOwner,
  loadOwnerView,
  OWNER_COOKIE,
  OWNER_TOKEN_TTL_S,
  OwnerError,
} from '../owner.service';
import { ownerHtml } from '../storefront/owner.view';

const DOCS = '/docs/integrator#owner-view';

const cookieOf = (req: Request, name: string): string | undefined => {
  for (const part of (req.get('cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return undefined;
};

/**
 * F-1 (Q-O2): `/m/:slug/owner`, read only. Credentials: the owner cookie, or the headers
 * `X-Owner-Message` (base64 of the signed sign-in message, purpose owner) + `X-Owner-Signature`.
 */
export function createOwnerRouter(deps: ShopDeps = defaultShopDeps()): Router {
  const router = Router();
  router.get(
    '/m/:slug/owner',
    rateLimit({
      windowMs: 60_000,
      limit: 30,
      standardHeaders: true,
      legacyHeaders: false,
      validate: false,
      handler: (_req, res) => {
        res.status(429).json({ error: 'rate_limited', error_code: 'rate_limited' });
      },
    }),
    async (req: Request, res: Response) => {
      res.set('Cache-Control', 'no-store');
      try {
        const b64 = req.get(X_OWNER_MESSAGE);
        const { merchant, token } = await authenticateOwner(deps, req.params.slug, {
          token: cookieOf(req, OWNER_COOKIE),
          message: b64 ? Buffer.from(b64, 'base64').toString('utf8') : undefined,
          signature: req.get(X_OWNER_SIGNATURE) ?? undefined,
        });
        const view = await loadOwnerView(deps, merchant);
        if (token) {
          res.append(
            'Set-Cookie',
            `${OWNER_COOKIE}=${token}; Max-Age=${OWNER_TOKEN_TTL_S}; Path=/m/${merchant.slug}/owner; HttpOnly; Secure; SameSite=Strict`,
          );
        }
        res.type('html').send(ownerHtml(view));
      } catch (err) {
        if (err instanceof OwnerError) {
          res.status(err.status).json({
            error: err.status === 404 ? 'not_found' : 'owner_auth_required',
            error_code: err.status === 404 ? 'not_found' : 'owner_auth_required',
            message: err.message,
            suggested_action:
              err.status === 503
                ? 'retry_after_delay'
                : 'GET /api/v1/shop/auth/nonce?purpose=owner, sign the message, send X-Owner-Message (base64) and X-Owner-Signature',
            documentation_url: DOCS,
          });
          return;
        }
        res.status(503).json({ error: 'unavailable', error_code: 'owner_unavailable' });
      }
    },
  );
  return router;
}
