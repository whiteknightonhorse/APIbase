import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { ShopAuthError } from '../auth/errors';
import { reissueKeys, rotateKey } from '../auth/identity.service';
import { requireMerchantKey } from '../auth/merchant-key.service';
import {
  buildSignInMessage,
  issueNonce,
  NONCE_TTL_S,
  type SignPurpose,
} from '../auth/nonce.service';
import { currentDocs, termsStatus } from '../auth/terms.guard';
import { upsertCatalog } from '../catalog.service';
import {
  addMerchantDocument,
  confirmMerchantOrder,
  listMerchantOrders,
} from '../order-lifecycle.service';
import { runCheck } from '../check.service';
import { listEvents, setWebhook } from '../webhook/webhook.service';
import {
  acceptTerms,
  acceptTermsMessage,
  defaultShopDeps,
  deactivateMerchant,
  registerWithDocs,
  toApiError,
  type ShopDeps,
} from '../merchant-lifecycle.service';

const PURPOSES: readonly SignPurpose[] = [
  'register',
  'accept_terms',
  'rotate_key',
  'payout_change',
  'reissue',
  'owner',
];

const limiter = (windowMs: number, limit: number) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    handler: (_req, res) => {
      res.status(429).json({
        error: 'rate_limited',
        error_code: 'rate_limited',
        message: 'too many requests from this address',
        suggested_action: 'retry_after_delay',
        documentation_url: '/docs/integrator#registration--terms',
      });
    },
  });

/** §6.3 merchant routes, mounted at /api/v1/shop/... (same services and codes as the /mcp tools). */
export function createMerchantRouter(deps: ShopDeps = defaultShopDeps()): Router {
  const router = Router();
  const send = (res: Response, err: unknown) => {
    const { status, body } = toApiError(err, res.req.requestId);
    res.status(status).json(body);
  };
  const ctxOf = (req: Request) => ({ ip: req.ip, user_agent: req.get('user-agent') });

  router.get(
    '/api/v1/shop/auth/nonce',
    limiter(60_000, 30),
    async (req: Request, res: Response) => {
      try {
        const wallet = String(req.query.wallet ?? '');
        const purpose = String(req.query.purpose ?? '') as SignPurpose;
        if (!/^0x[0-9a-fA-F]{40}$/.test(wallet) || !PURPOSES.includes(purpose)) {
          res.status(422).json({
            error: 'validation_failed',
            error_code: 'validation_failed',
            message: 'wallet (EVM address) and purpose are required',
            suggested_action: 'fix_request',
            documentation_url: '/docs/integrator#registration--terms',
          });
          return;
        }
        const nonce = await issueNonce(wallet, deps.redis);
        const issued_at = new Date((deps.now ?? Date.now)()).toISOString();
        const message =
          purpose === 'accept_terms'
            ? acceptTermsMessage(await currentDocs(deps.db, (deps.now ?? Date.now)()), {
                wallet,
                nonce,
                time: issued_at,
              })
            : buildSignInMessage({ address: wallet, purpose, nonce, issuedAt: issued_at });
        res.json({ nonce, issued_at, expires_in: NONCE_TTL_S, message });
      } catch (err) {
        send(res, err);
      }
    },
  );

  router.post(
    '/api/v1/shop/merchants',
    limiter(3_600_000, 5),
    async (req: Request, res: Response) => {
      try {
        const { message, signature, ...rest } = (req.body ?? {}) as Record<string, unknown>;
        if (typeof message !== 'string' || typeof signature !== 'string') {
          throw new ShopAuthError(401, 'wallet signature required', 'sign the register message');
        }
        const r = await registerWithDocs(
          deps,
          { ...rest, signed: { message, signature } } as never,
          { ...ctxOf(req), path: '/api/v1/shop/merchants' },
        );
        res.status(201).json(r);
      } catch (err) {
        send(res, err);
      }
    },
  );

  router.post(
    '/api/v1/shop/merchants/me/acceptances',
    limiter(60_000, 10),
    async (req: Request, res: Response) => {
      try {
        res.json(await acceptTerms(deps, (req.body ?? {}) as never, ctxOf(req)));
      } catch (err) {
        send(res, err);
      }
    },
  );

  const withBanner = async (merchant_id: string, body: object) => {
    const st = await termsStatus(deps.db, merchant_id, (deps.now ?? Date.now)());
    const docs = [...st.pending, ...st.overdue].map(({ doc_id, version, sha256, url }) => ({
      doc_id,
      version,
      sha256,
      url,
    }));
    return docs.length > 0 ? { ...body, terms_update_pending: { docs } } : body;
  };

  router.post(
    '/api/v1/shop/merchants/me/keys/rotate',
    requireMerchantKey([], () => deps.db),
    async (req: Request, res: Response) => {
      try {
        const m = req.merchant;
        if (!m) throw new ShopAuthError(401, 'missing merchant key');
        const api_key = await deps.transaction((tx) =>
          rotateKey({ db: tx, redis: deps.redis, now: deps.now }, m.merchant_id, {
            key_hash: m.key_hash,
          }),
        );
        res.json(await withBanner(m.merchant_id, { api_key }));
      } catch (err) {
        send(res, err);
      }
    },
  );

  // Lost key: no Bearer. The wallet signature (purpose reissue) is the credential; revokes ALL keys.
  router.post(
    '/api/v1/shop/merchants/me/keys/reissue',
    limiter(3_600_000, 5),
    async (req: Request, res: Response) => {
      try {
        const { wallet, message, signature } = (req.body ?? {}) as Record<string, unknown>;
        if (
          typeof wallet !== 'string' ||
          !/^0x[0-9a-fA-F]{40}$/.test(wallet) ||
          typeof message !== 'string' ||
          typeof signature !== 'string'
        ) {
          throw new ShopAuthError(401, 'wallet signature required', 'sign the reissue message');
        }
        const api_key = await deps.transaction((tx) =>
          reissueKeys({ db: tx, redis: deps.redis, now: deps.now }, wallet, { message, signature }),
        );
        res.json({ api_key });
      } catch (err) {
        send(res, err);
      }
    },
  );

  router.post(
    '/api/v1/shop/merchants/me/deactivate',
    requireMerchantKey(['orders:write'], () => deps.db),
    async (req: Request, res: Response) => {
      try {
        const r = await deactivateMerchant(deps, req.merchant?.merchant_id ?? '');
        res.json(r);
      } catch (err) {
        send(res, err);
      }
    },
  );

  // §6.3: the merchant comes from the key, never from the body.
  router.put(
    '/api/v1/shop/merchants/me/catalog',
    requireMerchantKey(['catalog:write'], () => deps.db),
    async (req: Request, res: Response) => {
      try {
        const r = await upsertCatalog(deps, req.merchant?.merchant_id ?? '', req.body?.items);
        res.json(r);
      } catch (err) {
        send(res, err);
      }
    },
  );

  // §6.3 orders: the merchant is the key's, never a parameter.
  router.get(
    '/api/v1/shop/merchants/me/orders',
    requireMerchantKey(['orders:read'], () => deps.db),
    async (req: Request, res: Response) => {
      try {
        const q = req.query as Record<string, unknown>;
        res.json(await listMerchantOrders(deps, req.merchant?.merchant_id ?? '', q));
      } catch (err) {
        send(res, err);
      }
    },
  );

  router.post(
    '/api/v1/shop/merchants/me/orders/:id/confirm',
    requireMerchantKey(['orders:write'], () => deps.db),
    async (req: Request, res: Response) => {
      try {
        res.json(await confirmMerchantOrder(deps, req.merchant?.merchant_id ?? '', req.params.id));
      } catch (err) {
        send(res, err);
      }
    },
  );

  router.post(
    '/api/v1/shop/merchants/me/orders/:id/document',
    requireMerchantKey(['orders:write'], () => deps.db),
    async (req: Request, res: Response) => {
      try {
        res.json(
          await addMerchantDocument(
            deps,
            req.merchant?.merchant_id ?? '',
            req.params.id,
            req.body?.url,
          ),
        );
      } catch (err) {
        send(res, err);
      }
    },
  );

  // §6.3 webhooks: the merchant comes from the key, never from the body.
  router.put(
    '/api/v1/shop/merchants/me/webhooks',
    requireMerchantKey(['webhooks:write'], () => deps.db),
    async (req: Request, res: Response) => {
      try {
        res.json(await setWebhook(deps, req.merchant?.merchant_id ?? '', req.body ?? {}));
      } catch (err) {
        send(res, err);
      }
    },
  );

  // F-17: the full connection report (details included) for the key holder.
  router.get(
    '/api/v1/shop/merchants/me/check',
    requireMerchantKey([], () => deps.db),
    async (req: Request, res: Response) => {
      try {
        res.json(await runCheck(deps, req.merchant?.merchant_id ?? ''));
      } catch (err) {
        send(res, err);
      }
    },
  );

  router.get(
    '/api/v1/shop/merchants/me/events',
    requireMerchantKey(['orders:read'], () => deps.db),
    async (req: Request, res: Response) => {
      try {
        res.json(await listEvents(deps, req.merchant?.merchant_id ?? '', req.query));
      } catch (err) {
        send(res, err);
      }
    },
  );

  return router;
}
