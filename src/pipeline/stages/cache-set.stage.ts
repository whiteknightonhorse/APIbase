import { type Stage, ok } from '../types';
import { setCache, releaseLock } from '../../services/cache.service';
import { logger } from '../../config/logger';
import { enqueuePrefetch } from '../../services/prefetch.service';

/**
 * CACHE_SET stage (§12.43 stage 12, §12.127).
 *
 * Store normalized response in Redis cache with tool-specific TTL.
 * Release single-flight lock so waiters can read the cached result.
 * Redis error here is non-fatal — log warning, continue pipeline.
 */
export const cacheSetStage: Stage = {
  name: 'CACHE_SET',

  async execute(ctx) {
    // Skip if result came from cache
    if (ctx.cacheHit) {
      return ok(ctx);
    }

    // Skip if no provider response (provider failed)
    if (!ctx.providerResponse) {
      // Release lock even if provider failed so waiters unblock
      if (ctx.isLockOwner && ctx.cacheKey) {
        try {
          await releaseLock(ctx.cacheKey);
        } catch (error) {
          logger.warn(
            { err: error, requestId: ctx.requestId },
            'Failed to release lock after provider failure',
          );
        }
      }
      return ok(ctx);
    }

    // Skip if no cache key (should not happen, but guard)
    if (!ctx.cacheKey) {
      return ok(ctx);
    }

    try {
      const serialized = JSON.stringify(ctx.providerResponse);
      const ttl = ctx.toolCacheTtl ?? 0;
      await setCache(ctx.cacheKey, serialized, ttl);
      ctx.cacheSet = true;
      logger.info({ requestId: ctx.requestId, toolId: ctx.toolId, ttl }, 'Cache set');
    } catch (error) {
      // Redis error in CACHE_SET is non-fatal (§12.127)
      logger.warn({ err: error, requestId: ctx.requestId }, 'Failed to set cache');
    }

    // Fire-and-forget: predictive pre-fetch for follow-up tools (F8)
    enqueuePrefetch(ctx);

    // Release single-flight lock
    if (ctx.isLockOwner) {
      try {
        await releaseLock(ctx.cacheKey);
      } catch (error) {
        logger.warn({ err: error, requestId: ctx.requestId }, 'Failed to release lock');
      }
    }

    return ok(ctx);
  },
};
