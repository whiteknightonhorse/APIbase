import { Router, type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { createPipelineContext } from '../pipeline/types';
import { runPipeline } from '../pipeline/pipeline';
import { logger } from '../config/logger';

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
      });
      ctx.toolId = toolId;

      const result = await runPipeline(ctx);

      if (result.ok) {
        res.status(result.value.responseStatus || 200).json(result.value.responseBody);
        return;
      }

      const status = result.error.code || 500;
      res.status(status).json({
        error: result.error.error,
        message: result.error.message,
        request_id: requestId,
        ...(result.error.retryAfter ? { retry_after: result.error.retryAfter } : {}),
      });
    } catch (err) {
      next(err);
    }
  },
);
