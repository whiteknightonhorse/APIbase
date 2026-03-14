import { createApp } from './app';
import { config } from '../config';
import { logger } from '../config/logger';
import { shutdownHealthConnections } from '../services/health.service';
import { shutdownRedis } from '../services/redis.service';
import { initToolCache, stopToolCacheRefresh } from '../pipeline/stages/tool-status.stage';
import { shutdownMcpSessions } from '../mcp/server';

/**
 * API server entry point with graceful shutdown (§12.230).
 *
 * Startup sequence:
 *   1. Load tool cache (all 122 tools into memory)
 *   2. Start Express listener
 *
 * Shutdown sequence:
 *   1. SIGTERM received
 *   2. Stop accepting new connections (server.close)
 *   3. Drain in-flight requests
 *   4. Close MCP sessions, stop tool cache refresh
 *   5. Close shared Redis connection
 *   6. Close PG health check connection
 *   7. Exit 0 (or force exit after 18s — 2s buffer before Docker SIGKILL at 20s)
 */

const app = createApp();

(async () => {
  // Pre-load tool cache before accepting requests
  await initToolCache();

  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT, env: config.NODE_ENV }, 'API server started');
  });

  // --- Graceful shutdown (§12.230) ---
  function shutdown(signal: string): void {
    logger.info({ signal }, 'Shutdown signal received — draining connections');

    server.close(() => {
      Promise.allSettled([
        shutdownMcpSessions(),
        shutdownRedis(),
        shutdownHealthConnections(),
      ]).then(() => {
        stopToolCacheRefresh();
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
})();

export { app };
