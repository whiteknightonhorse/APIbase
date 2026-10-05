import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { X_IDEMPOTENCY_KEY } from '../../config/http-headers';
import { idempotencyStage } from '../../pipeline/stages/idempotency.stage';
import type { PipelineContext } from '../../pipeline/types';
import { clearIdempotency, finalizeIdempotency } from '../../services/idempotency.service';
import { resolveBuyer } from '../buyer';
import { defaultShopDeps, toApiError, type ShopDeps } from '../merchant-lifecycle.service';
import { cancelOrder, createQuote, getQuote, merchantIdBySlug } from '../quote.service';

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

  router.post('/api/v1/shop/orders/:id/cancel', async (req: Request, res: Response) => {
    try {
      res.json(
        await cancelOrder(deps, await buyerOf(req), String(req.params.id), req.body?.reason),
      );
    } catch (err) {
      send(res, err);
    }
  });

  return router;
}
