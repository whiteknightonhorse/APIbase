import { createApp } from './app';
import { config } from '../config';
import { logger } from '../config/logger';
import { shutdownHealthConnections } from '../services/health.service';
import { shutdownCacheRedis } from '../services/cache.service';
import { shutdownIdempotencyRedis } from '../services/idempotency.service';
import { shutdownRateLimitRedis } from '../services/rate-limit.service';
import { shutdownReceiptRedis } from '../services/receipt.service';

/**
 * API server entry point with graceful shutdown (§12.230).
 *
 * Shutdown sequence:
 *   1. SIGTERM received
 *   2. Stop accepting new connections (server.close)
 *   3. Drain in-flight requests
 *   4. Close Redis connections (cache, idempotency, rate-limit)
 *   5. Close PG health check connection
 *   6. Exit 0 (or force exit after 18s — 2s buffer before Docker SIGKILL at 20s)
 */

const app = createApp();

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV }, 'API server started');
});

// --- Graceful shutdown (§12.230) ---
function shutdown(signal: string): void {
  logger.info({ signal }, 'Shutdown signal received — draining connections');

  server.close(() => {
    Promise.allSettled([
      shutdownCacheRedis(),
      shutdownIdempotencyRedis(),
      shutdownRateLimitRedis(),
      shutdownReceiptRedis(),
      shutdownHealthConnections(),
    ]).then(() => {
      logger.info('All connections drained — exiting');
      process.exit(0);
    });
  });

  // Force exit after 18s (stop_grace_period is 20s, leave 2s buffer)
  setTimeout(() => {
    logger.warn('Graceful shutdown timeout — force exit');
    process.exit(1);
  }, 18_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { app, server };
