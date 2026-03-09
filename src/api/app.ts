import express from 'express';
import { requestIdMiddleware } from '../middleware/request-id.middleware';
import { metricsMiddleware } from '../middleware/metrics.middleware';
import { contentTypeMiddleware } from '../middleware/content-type.middleware';
import { errorHandlerMiddleware } from '../middleware/error-handler.middleware';
import { healthRouter } from '../routes/health.router';
import { metricsRouter } from '../routes/metrics.router';
import { toolsRouter } from '../routes/tools.router';
import { agentsRouter } from '../routes/agents.router';
import { AppError, ErrorCode } from '../types/errors';
import { createMcpRouter } from '../mcp/server';
import { x402Middleware } from '../middleware/x402.middleware';
import { x402Router } from '../routes/x402.router';
import { onboardRouter } from '../routes/onboard.router';

/**
 * Express application configuration (§6.1, §12.243).
 *
 * Middleware order:
 *   1. X-Request-ID generation/propagation
 *   2. Metrics instrumentation (§12.197)
 *   3. Operational routes (health, metrics — exempt from content-type enforcement)
 *   4. JSON body parser
 *   5. Content-Type enforcement (JSON-only)
 *   6. API routes
 *   7. 404 catch-all
 *   8. Error handler (must be last)
 */
export function createApp(): express.Express {
  const app = express();

  // Disable X-Powered-By header (security)
  app.disable('x-powered-by');

  // Trust proxy (behind nginx)
  app.set('trust proxy', 1);

  // --- Pre-route middleware ---
  app.use(requestIdMiddleware);
  app.use(metricsMiddleware);

  // --- Operational routes (exempt from content-type enforcement) ---
  app.use(healthRouter);
  app.use(metricsRouter);
  app.use(x402Router);

  // --- Body parsing ---
  app.use(express.json({ limit: '1mb' }));

  // --- MCP endpoint (before content-type enforcement — SSE GET has no Content-Type) ---
  app.use(createMcpRouter());

  // --- Smart Onboarding Form (§6.12, §AP-10 — before content-type enforcement) ---
  app.use(onboardRouter);

  // --- x402 payment verification (before pipeline, §8.6) ---
  app.use(x402Middleware);

  // --- Content-type enforcement (JSON-only for API routes) ---
  app.use(contentTypeMiddleware);

  // --- API routes ---
  app.use(agentsRouter);
  app.use(toolsRouter);

  // --- 404 catch-all (must be after all routes) ---
  app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
    next(new AppError(ErrorCode.NOT_FOUND, `Not found: ${req.method} ${req.path}`));
  });

  // --- Error handler (must be last) ---
  app.use(errorHandlerMiddleware);

  return app;
}
