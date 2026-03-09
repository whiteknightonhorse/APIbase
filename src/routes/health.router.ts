import { Router, type Request, type Response } from 'express';
import { getReadiness } from '../services/health.service';

/**
 * Health check routes (§12.164, §12.167).
 *
 * GET /health/live  — liveness: process alive, event loop responsive. Always 200.
 * GET /health/ready — readiness: PG + Redis + config. 200 or 503.
 *
 * These routes are exempt from Nginx rate limiting (§12.239).
 */
export const healthRouter = Router();

healthRouter.get('/health/live', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'alive' });
});

healthRouter.get('/health/ready', async (_req: Request, res: Response) => {
  const result = await getReadiness();
  res.status(result.status === 'ready' ? 200 : 503).json(result);
});
