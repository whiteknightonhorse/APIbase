import { Router, type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { runBatch } from '../services/batch.service';
import { logger } from '../config/logger';
import type { BatchCallInput } from '../adapters/platform/types';

/**
 * Batch execution REST endpoint (F1: Batch API).
 *
 * POST /api/v1/tools/call_batch
 *
 * Accepts array of tool calls, fans out to full 13-stage pipeline per call.
 * Agent authenticates via Bearer token — forwarded to each sub-call's AUTH stage.
 * Each sub-call creates its own escrow and ledger row.
 *
 * Max 20 calls per batch, max 10 concurrent.
 */
export const batchRouter = Router();

batchRouter.post(
  '/api/v1/tools/call_batch',
  async (req: Request, res: Response, next: NextFunction) => {
    const requestId = (req.headers['x-request-id'] as string) || randomUUID();

    try {
      const { calls, max_parallel } = req.body as {
        calls?: BatchCallInput[];
        max_parallel?: number;
      };

      if (!calls || !Array.isArray(calls) || calls.length === 0) {
        res.status(400).json({
          error: 'validation_error',
          message: 'calls array is required and must not be empty',
          request_id: requestId,
        });
        return;
      }

      if (calls.length > 20) {
        res.status(400).json({
          error: 'validation_error',
          message: 'Maximum 20 calls per batch',
          request_id: requestId,
        });
        return;
      }

      // Validate each call has tool_id and params
      for (let i = 0; i < calls.length; i++) {
        const call = calls[i];
        if (!call.tool_id || typeof call.tool_id !== 'string') {
          res.status(400).json({
            error: 'validation_error',
            message: `calls[${i}].tool_id is required`,
            request_id: requestId,
          });
          return;
        }
        if (call.params === undefined || call.params === null) {
          calls[i].params = {};
        }
      }

      // Auth is forwarded to sub-pipelines — each runs full AUTH stage
      const authHeader = req.headers.authorization as string | undefined;
      const apiKeyHeader = req.headers['x-api-key'] as string | undefined;

      if (!authHeader && !apiKeyHeader) {
        res.status(401).json({
          error: 'unauthorized',
          message: 'Authorization header or X-API-Key required for batch API',
          request_id: requestId,
        });
        return;
      }

      const maxParallel = Math.min(Math.max(Number(max_parallel) || 10, 1), 10);

      logger.info({
        request_id: requestId,
        call_count: calls.length,
        max_parallel: maxParallel,
      }, 'Batch REST request received');

      const result = await runBatch({
        authHeader: authHeader || (apiKeyHeader ? `Bearer ${apiKeyHeader}` : undefined),
        parentRequestId: requestId,
        calls,
        maxParallel,
      });

      res.status(200).json({
        ...result,
        request_id: requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);
