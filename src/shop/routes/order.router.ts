import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { X_IDEMPOTENCY_KEY } from '../../config/http-headers';
import { idempotencyStage } from '../../pipeline/stages/idempotency.stage';
import type { PipelineContext } from '../../pipeline/types';
import { clearIdempotency, finalizeIdempotency } from '../../services/idempotency.service';
import { resolveBuyer } from '../buyer';
import { defaultShopDeps, toApiError, type ShopDeps } from '../merchant-lifecycle.service';
import { resolveX402PaymentHeader } from '../../config/http-headers';
import { openDispute } from '../dispute.service';
import { getOrderView } from '../order-payment.service';
import { cancelOrder, createQuote, getQuote, merchantIdBySlug } from '../quote.service';
import { cancelSubscription, getSubscription } from '../subscription.service';
import { preauthorizeSubscription } from '../subscription-preauth.service';

/** §6.3 buyer routes (quotes, cancel), mounted at /api/v1/shop/*. Same services as the /mcp tools. */
export function createOrderRouter(deps: ShopDeps = defaultShopDeps()): Router {
  const router = Router();
  const bearer = (req: Request) => /^Bearer (\S+)$/.exec(req.headers.authorization ?? '')?.[1];
  const buyerOf = (req: Request) => resolveBuyer({ apiKey: bearer(req), ip: req.ip });
  const send = (res: Response, err: unknown) => {
    const { status, body } = toApiError(err, res.req.requestId);
    res.status(status).json(body);
  };

  router.post('/api/v1/shop/quotes', async (req: Request, res: Response) => {
    let held: { agent: string; key: string; exec: string } | undefined;
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
        const quote = await createQuote(
          deps,
          await merchantIdBySlug(deps.db, merchant),
          buyer,
          input,
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

  router.get('/api/v1/shop/quotes/:id', async (req: Request, res: Response) => {
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
          const { quoteMppChallengeHeader } = await import('../../middleware/mpp.middleware');
          const url = `https://${req.get('host') ?? ''}/api/v1/shop/quotes/${String(req.params.id)}/pay`;
          const challenge = await quoteMppChallengeHeader(String(req.params.id), url).catch(
            () => null,
          );
          if (challenge) res.setHeader('WWW-Authenticate', challenge);
        }
      }
      res.status(r.status).json(r.body);
    } catch (err) {
      send(res, err);
    }
  };
  router.post('/api/v1/shop/quotes/:id/pay', payRoute);
  router.get('/api/v1/shop/quotes/:id/pay', payRoute);

  router.get('/api/v1/shop/orders/:id', async (req: Request, res: Response) => {
    try {
      const buyer = await buyerOf(req);
      res.json(await getOrderView(deps.db, String(req.params.id), buyer.identity));
    } catch (err) {
      send(res, err);
    }
  });

  router.post('/api/v1/shop/orders/:id/cancel', async (req: Request, res: Response) => {
    try {
      res.json(
        await cancelOrder(deps, await buyerOf(req), String(req.params.id), req.body?.reason),
      );
    } catch (err) {
      send(res, err);
    }
  });

  // §6.3: only the payer; another identity's order is 404.
  router.post('/api/v1/shop/orders/:id/disputes', async (req: Request, res: Response) => {
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
  });

  // T-INT-41 (UC-9): the payer's subscription; renewal is the agent paying the `renew` quote.
  router.get('/api/v1/shop/subscriptions/:id', async (req: Request, res: Response) => {
    try {
      res.json(await getSubscription(deps, await buyerOf(req), String(req.params.id)));
    } catch (err) {
      send(res, err);
    }
  });

  // T-INT-47 (UC-9 on Base): the payer stores 1..12 pre-signed authorizations for future periods.
  router.post(
    '/api/v1/shop/subscriptions/:id/preauthorize',
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

  router.post('/api/v1/shop/subscriptions/:id/cancel', async (req: Request, res: Response) => {
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
  });

  return router;
}
