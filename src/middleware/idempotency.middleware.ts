import type { Request, Response, NextFunction } from 'express';
import { checkIdempotency } from '../services/idempotency.service';
import { AppError, ErrorCode } from '../types/errors';
import '../types/request';

/**
 * Idempotency middleware (§12.171, §12.43 IDEMPOTENCY_CHECK stage).
 *
 * Position in pipeline: AFTER auth (needs agent_id), BEFORE rate limit.
 *
 * Reads optional Idempotency-Key header. If present:
 *   - NOT EXISTS → continue (setPending called by pipeline runner)
 *   - PENDING    → 409 Conflict, retry_after: 2
 *   - SUCCESS    → return cached response (cost=0)
 *   - FAILED     → return cached error (cost=0)
 *
 * If header absent → no idempotency, continue normally.
 */
export async function idempotencyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const idempotencyKey = req.headers['idempotency-key'];

    // No header → skip idempotency check (permitted per §12.171)
    if (!idempotencyKey) {
      next();
      return;
    }

    const key = Array.isArray(idempotencyKey) ? idempotencyKey[0] : idempotencyKey;

    // Agent must be authenticated (auth middleware runs before this)
    if (!req.agent) {
      next();
      return;
    }

    const result = await checkIdempotency(req.agent.agent_id, key);

    switch (result.action) {
      case 'proceed':
        // Store key on request for pipeline to call setPending + finalize later
        req.idempotencyKey = key;
        next();
        return;

      case 'conflict':
        throw new AppError(
          ErrorCode.CONFLICT,
          'Request in progress for this idempotency key',
          result.retryAfter,
        );

      case 'return_cached':
        req.log.info(
          { idempotency_key: key, cached_status: result.statusCode },
          'Idempotency cache hit',
        );
        res.status(result.statusCode);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(result.body);
        return;
    }
  } catch (err) {
    if (err instanceof AppError) {
      next(err);
      return;
    }
    // Redis failure → fail open for idempotency (request proceeds without protection).
    // Financial safety is guaranteed by escrow + ledger (§12.182).
    req.log.warn({ err }, 'Idempotency check failed, proceeding without protection');
    next();
  }
}
