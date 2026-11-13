import { Router, type Request, type Response } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { X_IDEMPOTENCY_KEY, X_PAYER_ADDRESS, X_PAYER_SIGNATURE } from '../../config/http-headers';
import { idempotencyStage } from '../../pipeline/stages/idempotency.stage';
import type { PipelineContext } from '../../pipeline/types';
import { clearIdempotency, finalizeIdempotency } from '../../services/idempotency.service';
import {
  defaultVerifier,
  PAYER_ADDR_RE,
  PAYER_SIG_RE,
  signedWithinMinute,
  type SignatureVerifier,
} from '../../services/payer-signature';
import { resolveBuyer } from '../buyer';
import { defaultShopDeps, toApiError, type ShopDeps } from '../merchant-lifecycle.service';
import { resolveX402PaymentHeader } from '../../config/http-headers';
import { openDispute } from '../dispute.service';
import { getOrderView } from '../order-payment.service';
import { cancelOrder, getQuote, merchantIdBySlug } from '../quote.service';
import { clientFromUserAgent, createQuoteRecorded } from '../quote-outcomes.service';
import { cancelSubscription, getSubscription } from '../subscription.service';
import { confirmPull } from '../subscription-keychain.service';
import { preauthorizeSubscription } from '../subscription-preauth.service';
import { limiter, PROBE_LIMIT_PER_MIN } from './address-limiter';

/** T-0770: what the paying wallet signs to read its order (bound to the order id). */
export function orderMessage(orderId: string, minute: number): string {
  return `apibase-order:${orderId}:${minute}`;
}

/**
 * T-0770: the identity proven by X-Payer-Address + X-Payer-Signature on GET /orders/:id.
 * null = neither header present (today's behaviour); 'invalid' = present but not a valid
 * signature of orderMessage(orderId, current or previous minute) by that address.
 */
export async function signedOrderIdentity(
  addrHeader: unknown,
  sigHeader: unknown,
  orderId: string,
  verify: SignatureVerifier,
  nowMs: number,
): Promise<string | null | 'invalid'> {
  if (addrHeader === undefined && sigHeader === undefined) return null;
  if (typeof addrHeader !== 'string' || typeof sigHeader !== 'string') return 'invalid';
  const address = addrHeader.toLowerCase();
  if (!PAYER_ADDR_RE.test(address) || !PAYER_SIG_RE.test(sigHeader)) return 'invalid';
  const ok = await signedWithinMinute(
    verify,
    address,
    sigHeader,
    (m) => orderMessage(orderId, m),
    nowMs,
  );
  return ok ? `wallet:${createHash('sha256').update(address).digest('hex')}` : 'invalid';
}

/** §6.3 buyer routes (quotes, cancel), mounted at /api/v1/shop/*. Same services as the /mcp tools. */
export function createOrderRouter(
  deps: ShopDeps = defaultShopDeps(),
  sig: { verify?: SignatureVerifier; now?: () => number } = {},
): Router {
  const router = Router();
  const verify = sig.verify ?? defaultVerifier;
  const now = sig.now ?? Date.now;
  // CodeQL js/missing-rate-limiting (CODEQL-OPEN-ALERTS-1006 rule 2): every route resolves the buyer
  // (DB/auth lookup), so each carries this per-address limiter literally in its own handler chain.
  // Only failed responses count; legitimate traffic is not throttled.
  const probeLimiter = limiter(60_000, PROBE_LIMIT_PER_MIN, { skipSuccessfulRequests: true });
  const bearer = (req: Request) => /^Bearer (\S+)$/.exec(req.headers.authorization ?? '')?.[1];
  const buyerOf = (req: Request) => resolveBuyer({ apiKey: bearer(req), ip: req.ip });
  // Retry-After for a 429 and, since T-0525, for the 409 payment_in_flight (body.retry_after seconds).
  const setRetryAfter = (res: Response, status: number, body: unknown) => {
    const ra = (body as { retry_after?: unknown } | null)?.retry_after;
    if ((status === 429 || status === 409) && typeof ra === 'number' && Number.isFinite(ra)) {
      res.setHeader('Retry-After', String(Math.ceil(ra)));
    }
  };
  const send = (res: Response, err: unknown) => {
    const { status, body } = toApiError(err, res.req.requestId);
    setRetryAfter(res, status, body);
    res.status(status).json(body);
  };

  router.post('/api/v1/shop/quotes', probeLimiter, async (req: Request, res: Response) => {
    let held: { agent: string; key: string; exec: string } | undefined;
    // T-0771: a body without merchant or items is a 422 naming the gaps, before any buyer lookup
    // or idempotency key. A body that is not valid JSON is still answered by the body parser.
    const raw: unknown = req.body;
    const b = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const missing: string[] = [];
    if (typeof (b as { merchant?: unknown }).merchant !== 'string') missing.push('merchant');
    const items = (b as { items?: unknown }).items;
    if (!Array.isArray(items) || items.length === 0) missing.push('items');
    if (missing.length > 0) {
      res.status(422).json({
        error: 'validation_failed',
        error_code: 'validation_failed',
        message: `missing required fields: ${missing.join(', ')}`,
        missing,
        suggested_action: 'fix_request',
        documentation_url: '/integrator/docs#quotes',
        request_id: req.requestId,
      });
      return;
    }
    try {
      const buyer = await buyerOf(req);
      // Idempotency is the pipeline's own stage; the buyer identity plays the agent id.
      const ctx: PipelineContext = {
        requestId: req.requestId,
        method: 'POST',
        path: req.path,
        body: req.body,
        headers: { [X_IDEMPOTENCY_KEY]: req.get(X_IDEMPOTENCY_KEY) },
        agentId: buyer.identity,
      };
      const idem = await idempotencyStage.execute(ctx);
      if (!idem.ok) {
        const e = idem.error;
        if (e.error === 'idempotency_hit') {
          res.status(e.code).type('application/json').send(e.message);
        } else {
          res.status(e.code).json({ error: e.error, error_code: e.error, message: e.message });
        }
        return;
      }
      if (ctx.idempotencyKey) {
        held = {
          agent: buyer.identity,
          key: ctx.idempotencyKey,
          exec: ctx.executionId ?? randomUUID(),
        };
      }
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const { merchant, ...input } = body;
        const quote = await createQuoteRecorded(
          deps,
          await merchantIdBySlug(deps.db, merchant),
          buyer,
          input,
          clientFromUserAgent(req.get('user-agent')),
        );
        if (held) {
          await finalizeIdempotency(
            held.agent,
            held.key,
            held.exec,
            'SUCCESS',
            201,
            JSON.stringify(quote),
          );
          held = undefined;
        }
        res.status(201).json(quote);
      } finally {
        if (held) await clearIdempotency(held.agent, held.key);
      }
    } catch (err) {
      send(res, err);
    }
  });

  router.get('/api/v1/shop/quotes/:id', probeLimiter, async (req: Request, res: Response) => {
    try {
      res.json(await getQuote(deps, String(req.params.id), await buyerOf(req)));
    } catch (err) {
      send(res, err);
    }
  });

  // §6.3: POST pays (x402 header, or an MPP credential already settled by mppMiddleware);
  // GET and a call without payment answer the challenge: accepts[] + pay.mpp.url + the ONE stored
  // WWW-Authenticate: Payment challenge of the quote (§8.1 item 7a).
  const payRoute = async (req: Request, res: Response) => {
    try {
      // Lazy: the escrow stage pulls the x402 SDK, which the quote routes do not need.
      const { payQuote } = await import('../pay.service');
      const { encodePaymentRequiredHeader } = await import('@x402/core/http');
      const body = (req.body ?? {}) as Record<string, unknown>;
      req.pipelineStarted = true;
      const r = await payQuote(deps, {
        quote_id: String(req.params.id),
        x402PaymentHeader: resolveX402PaymentHeader(req.headers) || undefined,
        buyer: await buyerOf(req),
        requestId: req.requestId,
        host: req.get('host') ?? '',
        waive_withdrawal:
          typeof body.waive_withdrawal === 'boolean' ? body.waive_withdrawal : undefined,
        buyer_company: typeof body.buyer_company === 'string' ? body.buyer_company : undefined,
        pii: body.pii,
        buyer_agent: { user_agent: req.get('user-agent')?.slice(0, 200) },
        mpp: req.method === 'POST' ? req.mppPayment : undefined,
      });
      if (r.status === 402 && Array.isArray(r.body.accepts)) {
        res.setHeader('PAYMENT-REQUIRED', encodePaymentRequiredHeader(r.body as never));
        if ((r.body.pay as { mpp?: unknown } | undefined)?.mpp) {
          const mw = await import('../../middleware/mpp.middleware');
          const base = `https://${req.get('host') ?? ''}/api/v1/shop/quotes/${String(req.params.id)}/pay`;
          // T-0431: ?intent=subscription answers with the subscription challenge instead.
          const challenge = mw.isSubscriptionIntent(req.query['intent'])
            ? await mw
                .quoteMppSubscriptionChallengeHeader(
                  String(req.params.id),
                  `${base}?intent=subscription`,
                )
                .catch(() => null)
            : await mw.quoteMppChallengeHeader(String(req.params.id), base).catch(() => null);
          if (challenge) res.setHeader('WWW-Authenticate', challenge);
        }
      }
      setRetryAfter(res, r.status, r.body);
      res.status(r.status).json(r.body);
    } catch (err) {
      send(res, err);
    }
  };
  router.post('/api/v1/shop/quotes/:id/pay', probeLimiter, payRoute);
  router.get('/api/v1/shop/quotes/:id/pay', probeLimiter, payRoute);

  // T-0770: read-only; a signature by the paying wallet stands in for a lost buyer_token here only.
  router.get('/api/v1/shop/orders/:id', probeLimiter, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const orderId = String(req.params.id);
      const signed = await signedOrderIdentity(
        req.headers[X_PAYER_ADDRESS],
        req.headers[X_PAYER_SIGNATURE],
        orderId,
        verify,
        now(),
      );
      if (signed === 'invalid') {
        res.status(401).json({
          error: 'order_signature_invalid',
          error_code: 'order_signature_invalid',
          message:
            'X-Payer-Address and X-Payer-Signature must both be present: personal_sign of apibase-order:<order_id>:<unix minute> (current or previous minute)',
          ...(req.requestId ? { request_id: req.requestId } : {}),
          suggested_action: 'fix_request',
        });
        return;
      }
      const identity = signed ?? (await buyerOf(req)).identity;
      res.json(await getOrderView(deps.db, orderId, identity));
    } catch (err) {
      send(res, err);
    }
  });

  router.post(
    '/api/v1/shop/orders/:id/cancel',
    probeLimiter,
    async (req: Request, res: Response) => {
      try {
        res.json(
          await cancelOrder(deps, await buyerOf(req), String(req.params.id), req.body?.reason),
        );
      } catch (err) {
        send(res, err);
      }
    },
  );

  // §6.3: only the payer; another identity's order is 404.
  router.post(
    '/api/v1/shop/orders/:id/disputes',
    probeLimiter,
    async (req: Request, res: Response) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        res.status(201).json(
          await openDispute(deps, await buyerOf(req), {
            order_id: String(req.params.id),
            reason_code: body.reason_code,
            note: body.note,
          }),
        );
      } catch (err) {
        send(res, err);
      }
    },
  );

  // T-INT-41 (UC-9): the payer's subscription; renewal is the agent paying the `renew` quote.
  router.get(
    '/api/v1/shop/subscriptions/:id',
    probeLimiter,
    async (req: Request, res: Response) => {
      try {
        res.json(await getSubscription(deps, await buyerOf(req), String(req.params.id)));
      } catch (err) {
        send(res, err);
      }
    },
  );

  // T-INT-47 (UC-9 on Base): the payer stores 1..12 pre-signed authorizations for future periods.
  router.post(
    '/api/v1/shop/subscriptions/:id/preauthorize',
    probeLimiter,
    async (req: Request, res: Response) => {
      try {
        res
          .status(201)
          .json(
            await preauthorizeSubscription(
              deps,
              await buyerOf(req),
              String(req.params.id),
              (req.body ?? {}) as { authorizations?: unknown },
            ),
          );
      } catch (err) {
        send(res, err);
      }
    },
  );

  // T-INT-49 (UC-9 on Tempo): the payer says it authorized the merchant's renewal key.
  router.post(
    '/api/v1/shop/subscriptions/:id/confirm-pull',
    probeLimiter,
    async (req: Request, res: Response) => {
      try {
        res.json(
          await confirmPull(
            deps,
            await buyerOf(req),
            String(req.params.id),
            (req.body ?? {}) as { tx_hash?: unknown },
          ),
        );
      } catch (err) {
        send(res, err);
      }
    },
  );

  router.post(
    '/api/v1/shop/subscriptions/:id/cancel',
    probeLimiter,
    async (req: Request, res: Response) => {
      try {
        res.json(
          await cancelSubscription(
            deps,
            await buyerOf(req),
            String(req.params.id),
            (req.body as Record<string, unknown> | undefined)?.reason,
          ),
        );
      } catch (err) {
        send(res, err);
      }
    },
  );

  return router;
}
