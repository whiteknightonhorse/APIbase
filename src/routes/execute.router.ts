import { Router, type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { createPipelineContext } from '../pipeline/types';
import { runPipeline } from '../pipeline/pipeline';
import { logger } from '../config/logger';
import { buildPaymentRequiredResponse } from '../middleware/x402.middleware';
import { buildMppChallengeHeader } from '../middleware/mpp.middleware';

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
    const requestId = (req.headers['x-request-id'] as string) || randomUUID();
    const toolId = req.params.toolId as string;

    logger.info({ request_id: requestId, tool_id: toolId }, 'REST execute request');

    try {
      const ctx = createPipelineContext(requestId, 'POST', req.path, req.body, {
        authorization: req.headers.authorization,
        'content-type': req.headers['content-type'],
        'x-request-id': requestId,
        'x-idempotency-key': req.headers['x-idempotency-key'] as string | undefined,
        'x-payment': req.headers['x-payment'] as string | undefined,
        'x-api-key': req.headers['x-api-key'] as string | undefined,
      });
      ctx.toolId = toolId;

      if (req.x402Payment?.verified) {
        ctx.x402Paid = true;
        ctx.x402Payer = req.x402Payment.payer;
        ctx.x402PaymentHeader = (req.headers['x-payment'] as string | undefined) ?? (req.headers['payment-signature'] as string | undefined) ?? '';
      }

      if (req.mppPayment?.verified) {
        ctx.mppPaid = true;
        ctx.mppPayer = req.mppPayment.payer;
        ctx.mppMethod = req.mppPayment.method;
      }

      const result = await runPipeline(ctx);

      if (result.ok) {
        res.status(result.value.responseStatus || 200).json(result.value.responseBody);
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

        res.status(402).json(body);
        return;
      }

      res.status(status).json({
        error: result.error.error,
        message: result.error.message,
        request_id: requestId,
        ...(result.error.retryAfter ? { retry_after: result.error.retryAfter } : {}),
        ...(result.error.extra ?? {}),
      });
    } catch (err) {
      next(err);
    }
  },
);
