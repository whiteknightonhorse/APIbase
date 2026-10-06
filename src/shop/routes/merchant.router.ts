import { Router, type Request, type Response } from 'express';
import rateLimit, { type Options } from 'express-rate-limit';
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
import { createImport, getImport } from '../catalog-import/import.service';
import {
  addMerchantDocument,
  confirmMerchantOrder,
  shipMerchantOrder,
  listMerchantOrders,
} from '../order-lifecycle.service';
import { runCheck } from '../check.service';
import { patchProvek, ProvekInputError } from '../provek/provek.service';
import { getMerchantStats } from '../stats.service';
import { merchantRefund } from '../refund.service';
import { listFeeInvoices, markFeeInvoicePaid } from '../fee-invoice.service';
import { merchantEnvelopes } from '../pii/pii.service';
import { listEvents, setWebhook } from '../webhook/webhook.service';
import {
  confirmMerchantSettled,
  listSettleQueue,
  patchStreamSettings,
} from '../stream-merchant.service';
import { listMerchantSubscriptions, merchantCancelSubscription } from '../subscription.service';
import {
  deleteRenewerKey,
  listRenewQueue,
  putRenewerKey,
  recordRenewal,
} from '../subscription-keychain.service';
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

export const PROBE_LIMIT_PER_MIN = 100;

const limiter = (windowMs: number, limit: number, extra: Partial<Options> = {}) =>
  rateLimit({
    windowMs,
    limit,
    ...extra,
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
  // CodeQL js/missing-rate-limiting: requireMerchantKey() does a key lookup BEFORE its per-key
  // limiter can run, so every key-guarded route carries this per-address limiter in its own
  // handler chain. Only failed (4xx/5xx) responses count: legitimate traffic keeps the per-key
  // budget of merchant-key.service, while key probing from one address is capped.
  const probeLimiter = limiter(60_000, PROBE_LIMIT_PER_MIN, { skipSuccessfulRequests: true });
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
    probeLimiter,
    requireMerchantKey([], () => deps.db),
    async (req: Request, res: Response) => {
      try {
        const m = req.merchant;
        if (!m) throw new ShopAuthError(401, 'missing merchant key');
        const api_key = await deps.transaction((tx) =>
          rotateKey(
            { db: tx, redis: deps.redis, now: deps.now },
            m.merchant_id,
            { key_hash: m.key_hash },
            (req.body as { encryption_key?: never } | undefined)?.encryption_key,
          ),
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
    probeLimiter,
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
    probeLimiter,
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

  // A3-9: the optional Provek declaration; the merchant comes from the key, never from the body.
  router.patch(
    '/api/v1/shop/merchants/me/provek',
    probeLimiter,
    requireMerchantKey(['catalog:write'], () => deps.db),
    async (req: Request, res: Response) => {
      try {
        res.json(await patchProvek(deps, req.merchant?.merchant_id ?? '', req.body));
      } catch (err) {
        if (err instanceof ProvekInputError) {
          res.status(422).json({
            error: 'validation_failed',
            error_code: 'validation_failed',
            message: err.message,
            suggested_action: 'fix_request',
            documentation_url: '/docs/integrator#provek-declaration-optional',
          });
          return;
        }
        send(res, err);
      }
    },
  );

  // T-INT-46 (UC-7 variant b): the merchant settles its own stream channels; the merchant is the key's.
  router.patch(
    '/api/v1/shop/merchants/me/stream-settings',
    probeLimiter,
    requireMerchantKey(['catalog:write'], () => deps.db),
    async (req: Request, res: Response) => {
      try {
        res.json(await patchStreamSettings(deps, req.merchant?.merchant_id ?? '', req.body));
      } catch (err) {
        send(res, err);
      }
    },
  );
  router.get(
    '/api/v1/shop/merchants/me/streams/settle-queue',
    probeLimiter,
    requireMerchantKey(['orders:read'], () => deps.db),
    async (req: Request, res: Response) => {
      try {
        res.json(await listSettleQueue(deps, req.merchant?.merchant_id ?? ''));
      } catch (err) {
        send(res, err);
      }
    },
  );
  router.post(
    '/api/v1/shop/merchants/me/streams/:channel_id/settled',
    probeLimiter,
    requireMerchantKey(['orders:write'], () => deps.db),
    async (req: Request, res: Response) => {
      try {
        res.json(
          await confirmMerchantSettled(
            deps,
            req.merchant?.merchant_id ?? '',
            req.params.channel_id,
            req.body ?? {},
          ),
        );
      } catch (err) {
        send(res, err);
      }
    },
  );

  // F-2 / UC-11: feed import is a worker job; the merchant comes from the key. One import per 10 minutes.
  router.post(
    '/api/v1/shop/merchants/me/catalog/import',
    probeLimiter,
    requireMerchantKey(['catalog:write'], () => deps.db),
    async (req: Request, res: Response) => {
      try {
        res.status(202).json(await createImport(deps, req.merchant?.merchant_id ?? '', req.body));
      } catch (err) {
        send(res, err);
      }
    },
  );
  router.get(
    '/api/v1/shop/merchants/me/catalog/import/:id',
    probeLimiter,
    requireMerchantKey(['catalog:write'], () => deps.db),
    async (req: Request, res: Response) => {
      try {
        res.json(await getImport(deps, req.merchant?.merchant_id ?? '', String(req.params.id)));
      } catch (err) {
        send(res, err);
      }
    },
  );

  // §6.3 orders: the merchant is the key's, never a parameter.
  router.get(
    '/api/v1/shop/merchants/me/orders',
    probeLimiter,
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

  // T-INT-21 (spec 10.2 item 3): the buyer-data envelopes of one order, exactly as stored. The first
  // read (or the first 2xx order.paid delivery) starts the 7-day passport clock.
  router.get(
    '/api/v1/shop/merchants/me/orders/:id/pii',
    limiter(60_000, 60),
    requireMerchantKey(['orders:read'], () => deps.db),
    async (req: Request, res: Response) => {
      try {
        res.json(
          await merchantEnvelopes(deps, req.merchant?.merchant_id ?? '', String(req.params.id)),
        );
      } catch (err) {
        send(res, err);
      }
    },
  );

  router.post(
    '/api/v1/shop/merchants/me/orders/:id/confirm',
    probeLimiter,
    requireMerchantKey(['orders:write'], () => deps.db),
    async (req: Request, res: Response) => {
      try {
        res.json(
          await confirmMerchantOrder(deps, req.merchant?.merchant_id ?? '', String(req.params.id)),
        );
      } catch (err) {
        send(res, err);
      }
    },
  );

  router.post(
    '/api/v1/shop/merchants/me/orders/:id/ship',
    probeLimiter,
    requireMerchantKey(['orders:write'], () => deps.db),
    async (req: Request, res: Response) => {
      try {
        res.json(
          await shipMerchantOrder(
            deps,
            req.merchant?.merchant_id ?? '',
            req.params.id,
            (req.body ?? {}) as Record<string, unknown>,
          ),
        );
      } catch (err) {
        send(res, err);
      }
    },
  );

  router.post(
    '/api/v1/shop/merchants/me/orders/:id/document',
    probeLimiter,
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

  // §6.3 refunds: the merchant comes from the key; the chain is only read (F-10).
  router.post(
    '/api/v1/shop/merchants/me/refunds',
    probeLimiter,
    requireMerchantKey(['refunds:write'], () => deps.db),
    async (req: Request, res: Response) => {
      try {
        res.json(await merchantRefund(deps, req.merchant?.merchant_id ?? '', req.body ?? {}));
      } catch (err) {
        send(res, err);
      }
    },
  );

  // §6.3 family /merchants/me/*: Base fee invoices (§7.1). The chain is only read; the merchant comes from the key.
  router.get(
    '/api/v1/shop/merchants/me/fee-invoices',
    probeLimiter,
    requireMerchantKey(['stats:read'], () => deps.db),
    async (req: Request, res: Response) => {
      try {
        res.json(await listFeeInvoices(deps, req.merchant?.merchant_id ?? ''));
      } catch (err) {
        send(res, err);
      }
    },
  );
  router.post(
    '/api/v1/shop/merchants/me/fee-invoices/:id/paid',
    probeLimiter,
    requireMerchantKey(['refunds:write'], () => deps.db),
    async (req: Request, res: Response) => {
      try {
        res.json(
          await markFeeInvoicePaid(
            deps,
            req.merchant?.merchant_id ?? '',
            req.params.id,
            req.body ?? {},
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
    probeLimiter,
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
    probeLimiter,
    requireMerchantKey([], () => deps.db),
    async (req: Request, res: Response) => {
      try {
        res.json(await runCheck(deps, req.merchant?.merchant_id ?? ''));
      } catch (err) {
        send(res, err);
      }
    },
  );

  // F-12: the key holder's own aggregates; `format=csv` is one row per paid order (tx_hash, no full wallet).
  router.get(
    '/api/v1/shop/merchants/me/stats',
    probeLimiter,
    requireMerchantKey(['stats:read'], () => deps.db),
    async (req: Request, res: Response) => {
      try {
        const r = await getMerchantStats(deps, req.merchant?.merchant_id ?? '', req.query);
        if ('csv' in r) {
          res
            .type('text/csv; charset=utf-8')
            .set('Content-Disposition', 'attachment; filename="orders.csv"')
            .send(r.csv);
          return;
        }
        res.json(r);
      } catch (err) {
        send(res, err);
      }
    },
  );

  // T-INT-41 (UC-9): the merchant's own subscriptions; another shop's are invisible (404 on cancel).
  router.get(
    '/api/v1/shop/merchants/me/subscriptions',
    probeLimiter,
    requireMerchantKey(['orders:read'], () => deps.db),
    async (req: Request, res: Response) => {
      try {
        res.json(await listMerchantSubscriptions(deps, req.merchant?.merchant_id ?? '', req.query));
      } catch (err) {
        send(res, err);
      }
    },
  );

  // T-INT-49 (UC-9 on Tempo): the merchant renews with its OWN access key (packages/merchant-renewer).
  // The server only ever sees the key's ADDRESS; it queues work and verifies the result on-chain.
  router.put(
    '/api/v1/shop/merchants/me/renewer-key',
    probeLimiter,
    requireMerchantKey(['catalog:write'], () => deps.db),
    async (req: Request, res: Response) => {
      try {
        res.json(await putRenewerKey(deps, req.merchant?.merchant_id ?? '', req.body));
      } catch (err) {
        send(res, err);
      }
    },
  );
  router.delete(
    '/api/v1/shop/merchants/me/renewer-key',
    probeLimiter,
    requireMerchantKey(['catalog:write'], () => deps.db),
    async (req: Request, res: Response) => {
      try {
        res.json(await deleteRenewerKey(deps, req.merchant?.merchant_id ?? ''));
      } catch (err) {
        send(res, err);
      }
    },
  );
  router.get(
    '/api/v1/shop/merchants/me/subscriptions/renew-queue',
    probeLimiter,
    requireMerchantKey(['orders:read'], () => deps.db),
    async (req: Request, res: Response) => {
      try {
        res.json(await listRenewQueue(deps, req.merchant?.merchant_id ?? ''));
      } catch (err) {
        send(res, err);
      }
    },
  );
  router.post(
    '/api/v1/shop/merchants/me/subscriptions/:id/renewed',
    probeLimiter,
    requireMerchantKey(['orders:write'], () => deps.db),
    async (req: Request, res: Response) => {
      try {
        res.json(
          await recordRenewal(
            deps,
            req.merchant?.merchant_id ?? '',
            String(req.params.id),
            req.body ?? {},
          ),
        );
      } catch (err) {
        send(res, err);
      }
    },
  );

  router.post(
    '/api/v1/shop/merchants/me/subscriptions/:id/cancel',
    probeLimiter,
    requireMerchantKey(['orders:write'], () => deps.db),
    async (req: Request, res: Response) => {
      try {
        res.json(
          await merchantCancelSubscription(
            deps,
            req.merchant?.merchant_id ?? '',
            String(req.params.id),
            (req.body as Record<string, unknown> | undefined)?.reason,
          ),
        );
      } catch (err) {
        send(res, err);
      }
    },
  );

  router.get(
    '/api/v1/shop/merchants/me/events',
    probeLimiter,
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
