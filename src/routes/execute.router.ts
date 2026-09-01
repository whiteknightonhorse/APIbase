import { Router, type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { createPipelineContext } from '../pipeline/types';
import { runPipeline } from '../pipeline/pipeline';
import { logger } from '../config/logger';
import { buildPaymentRequiredResponse } from '../middleware/x402.middleware';
import { buildMppChallengeHeader } from '../middleware/mpp.middleware';
import { finalizePipelineIdempotency } from '../services/idempotency.service';
import {
  X_REQUEST_ID,
  X_IDEMPOTENCY_KEY,
  X_PAYMENT,
  X_API_KEY,
  X_CACHE,
} from '../config/http-headers';

/**
 * REST tool execution endpoint (thin wrapper around 13-stage pipeline).
 *
 * POST /api/v1/tools/:toolId/call
 *
 * Same pipeline as MCP — auth, escrow, provider call, ledger, response.
 * Agents authenticate via Bearer token in Authorization header.
 */
export const executeRouter = Router();

executeRouter.post(
  '/api/v1/tools/:toolId/call',
  async (req: Request, res: Response, next: NextFunction) => {
    const requestId = (req.headers[X_REQUEST_ID] as string) || randomUUID();
    const toolId = req.params.toolId as string;

    logger.info({ request_id: requestId, tool_id: toolId }, 'REST execute request');

    try {
      const ctx = createPipelineContext(requestId, 'POST', req.path, req.body, {
        authorization: req.headers.authorization,
        'content-type': req.headers['content-type'],
        [X_REQUEST_ID]: requestId,
        [X_IDEMPOTENCY_KEY]: req.headers[X_IDEMPOTENCY_KEY] as string | undefined,
        [X_PAYMENT]: req.headers[X_PAYMENT] as string | undefined,
        [X_API_KEY]: req.headers[X_API_KEY] as string | undefined,
      });
      ctx.toolId = toolId;

      if (req.x402Payment?.verified) {
        ctx.x402Paid = true;
        ctx.x402Payer = req.x402Payment.payer;
        ctx.x402PaymentHeader =
          (req.headers[X_PAYMENT] as string | undefined) ??
          (req.headers['payment-signature'] as string | undefined) ??
          '';
      }

      if (req.mppPayment?.verified) {
        ctx.mppPaid = true;
        ctx.mppPayer = req.mppPayment.payer;
        ctx.mppMethod = req.mppPayment.method;
        ctx.mppPaymentHeader = req.mppPayment.header;
        // Needed by escrow-finalize's refund-owed record (F1/C-5 follow-up) —
        // without the original tx hash a human resolving the refund has to
        // re-derive it from logs before they can act.
        ctx.mppTxHash = req.mppPayment.txHash;
      }

      const result = await runPipeline(ctx);

      if (result.ok) {
        // X-Cache diagnostic (2026-06-29): lets the protocol-tester tell a legit cache-hit
        // replay (HIT, billed against the signed payment) from a real bypass (MISS).
        res.setHeader(X_CACHE, result.value.cacheHit ? 'HIT' : 'MISS');
        const successStatus = result.value.responseStatus || 200;
        await finalizePipelineIdempotency(
          result.value,
          'SUCCESS',
          successStatus,
          JSON.stringify(result.value.responseBody),
        );
        res.status(successStatus).json(result.value.responseBody);
        return;
      }

      const status = result.error.code || 500;

      if (status === 402) {
        const priceUsd = (result.error.extra?.price_usd as number) ?? 0;
        const priceVersion = (result.error.extra?.price_version as number) ?? 1;
        const body = buildPaymentRequiredResponse(toolId, priceUsd, priceVersion, requestId);

        // Dual-rail: add MPP WWW-Authenticate header alongside x402 body
        const mppHeader = await buildMppChallengeHeader(
          toolId,
          priceUsd,
          `https://${req.get('host')}${req.originalUrl}`,
        );
        if (mppHeader) {
          res.setHeader('WWW-Authenticate', mppHeader);
        }

        await finalizePipelineIdempotency(ctx, 'FAILED', 402, JSON.stringify(body));
        res.status(402).json(body);
        return;
      }

      const suggestedActions: Record<number, string> = {
        400: 'fix_request',
        401: 'fix_request',
        403: 'fix_request',
        404: 'use_different_tool',
        422: 'fix_request',
        429: 'retry_after_delay',
        500: 'contact_support',
        502: 'retry_after_delay',
        503: 'retry_after_delay',
      };
      const errorBody = {
        error: result.error.error,
        error_code: (result.error.error || '').toUpperCase(),
        message: result.error.message,
        request_id: requestId,
        suggested_action: suggestedActions[status] ?? 'contact_support',
        documentation_url: 'https://apibase.pro/frameworks#rest',
        ...(result.error.retryAfter ? { retry_after: result.error.retryAfter } : {}),
        ...(result.error.extra ?? {}),
      };
      await finalizePipelineIdempotency(ctx, 'FAILED', status, JSON.stringify(errorBody));
      res.status(status).json(errorBody);
    } catch (err) {
      next(err);
    }
  },
);
