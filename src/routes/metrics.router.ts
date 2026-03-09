import { Router, type Request, type Response } from 'express';
import { register } from '../services/metrics.service';

/**
 * Metrics endpoint (§12.197).
 *
 * GET /metrics — Prometheus scrape target.
 * Returns metrics in Prometheus text exposition format.
 * Exempt from auth, content-type enforcement, and rate limiting.
 */
export const metricsRouter = Router();

metricsRouter.get('/metrics', async (_req: Request, res: Response) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
