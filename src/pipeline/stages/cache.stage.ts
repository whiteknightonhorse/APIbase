import { type Stage, type PipelineError, ok, err } from '../types';
import {
  generateCacheKey,
  getCache,
  acquireLock,
  waitForResult,
} from '../../services/cache.service';
import { logger } from '../../config/logger';

/**
 * CACHE_OR_SINGLE_FLIGHT stage (§12.43 stage 6, §12.144, §12.150).
 *
 * 1. Generate cache key from toolId + params (no agent_id — shared).
 * 2. Check Redis cache. Hit → skip to RESPONSE.
 * 3. Cache miss → acquire single-flight lock.
 *    - Lock owner: proceed through RATE_LIMIT → ESCROW → PROVIDER_CALL.
 *    - Waiter: poll until result appears or timeout, then return cached.
 *    - Timeout: promote waiter to lock owner (proceed as fresh request).
 * 4. Redis failure → fail closed (503) (§12.186).
 */
export const cacheStage: Stage = {
  name: 'CACHE_OR_SINGLE_FLIGHT',

  async execute(ctx) {
    if (!ctx.toolId) {
      return ok(ctx);
    }

    const params = ctx.body;
    const cacheKey = generateCacheKey(ctx.toolId, params);
    ctx.cacheKey = cacheKey;

    try {
      // Check cache
      const cached = await getCache(cacheKey);
      if (cached !== null) {
        ctx.cacheHit = true;
        ctx.providerResponse = JSON.parse(cached);
        ctx.isLockOwner = false;
        logger.info({ requestId: ctx.requestId, toolId: ctx.toolId }, 'Cache hit');
        return ok(ctx);
      }

      // Cache miss — try to acquire single-flight lock
      const acquired = await acquireLock(cacheKey);
      if (acquired) {
        ctx.isLockOwner = true;
        ctx.cacheHit = false;
        logger.info({ requestId: ctx.requestId, toolId: ctx.toolId }, 'Cache miss, lock acquired');
        return ok(ctx);
      }

      // Another request holds the lock — wait for result
      ctx.isLockOwner = false;
      logger.info(
        { requestId: ctx.requestId, toolId: ctx.toolId },
        'Waiting for single-flight result',
      );

      const result = await waitForResult(cacheKey, 25_000, 500);
      if (result !== null) {
        ctx.cacheHit = true;
        ctx.providerResponse = JSON.parse(result);
        logger.info(
          { requestId: ctx.requestId, toolId: ctx.toolId },
          'Single-flight wait resolved',
        );
        return ok(ctx);
      }

      // Timeout — promote to lock owner, proceed as fresh request
      ctx.isLockOwner = true;
      ctx.cacheHit = false;
      logger.warn(
        { requestId: ctx.requestId, toolId: ctx.toolId },
        'Single-flight wait timeout, proceeding as owner',
      );
      return ok(ctx);
    } catch (error) {
      // Redis failure → fail closed (§12.186)
      logger.error({ err: error, requestId: ctx.requestId }, 'Cache stage Redis failure');
      return err<PipelineError>({
        code: 503,
        error: 'service_unavailable',
        message: 'Cache service unavailable',
        retryAfter: 5,
      });
    }
  },
};
