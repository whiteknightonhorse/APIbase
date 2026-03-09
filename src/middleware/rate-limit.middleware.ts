import type { Request, Response, NextFunction } from 'express';
import { checkRateLimit } from '../services/rate-limit.service';
import { AppError, ErrorCode } from '../types/errors';
import '../types/request';

/**
 * Rate limit middleware — dual token bucket (§12.172, §12.43 RATE_LIMIT stage).
 *
 * - Runs AFTER auth (needs agent_id + tier) and AFTER idempotency check.
 * - Unauthorized requests never reach here (AUTH rejects first).
 * - Sets X-RateLimit-* headers on ALL responses (§12.66).
 * - 429 with Retry-After on exhaustion.
 * - Tokens are NOT refunded on downstream failure (prevents abuse).
 *
 * Requires `toolId` to be set on the request (by route/pipeline).
 */
export function createRateLimitMiddleware() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Must have agent context (auth middleware ran before)
      if (!req.agent) {
        next();
        return;
      }

      // Tool ID must be known for per-tool bucket.
      // If not set yet (e.g. health routes), skip rate limiting.
      const toolId = req.toolId;
      if (!toolId) {
        next();
        return;
      }

      const result = await checkRateLimit(req.agent.agent_id, toolId, req.agent.tier);

      // Set rate limit headers on ALL responses (§12.66)
      res.setHeader('X-RateLimit-Limit', String(result.limit));
      res.setHeader('X-RateLimit-Remaining', String(result.remaining));
      res.setHeader(
        'X-RateLimit-Reset',
        String(Math.ceil(Date.now() / 1000) + (result.retryAfterSecs || 1)),
      );

      if (!result.allowed) {
        res.setHeader('Retry-After', String(result.retryAfterSecs));
        throw new AppError(
          ErrorCode.RATE_LIMIT_EXCEEDED,
          'Too many requests',
          result.retryAfterSecs,
        );
      }

      next();
    } catch (err) {
      if (err instanceof AppError) {
        next(err);
        return;
      }
      // Redis failure in rate limiter — fail closed (§12.186)
      req.log.error({ err }, 'Rate limit check failed — rejecting request (fail closed)');
      next(new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'Rate limit service unavailable', 5));
    }
  };
}
