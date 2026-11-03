import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { getReadiness } from '../services/health.service';
import { refundWalletHealth } from '../refunds/refund-health';
import { getStatusLine } from '../services/status-line.service';

/**
 * Health check routes (§12.164, §12.167).
 *
 * GET /health/live  — liveness: process alive, event loop responsive. Always 200.
 * GET /health/ready — readiness: PG + Redis + config. 200 or 503.
 * GET /health/status-line — one text line for the homepage (nginx SSI), from readiness, cached 10 s.
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

healthRouter.get('/health/status-line', async (_req: Request, res: Response) => {
  res.type('text/plain; charset=utf-8').send(await getStatusLine());
});

const refundHealthLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

/** T-0553: refund wallet addresses, balances, flags and last run. Never a key. */
healthRouter.get(
  '/health/refund-wallet',
  refundHealthLimiter,
  async (_req: Request, res: Response) => {
    try {
      res
        .set('Cache-Control', 'no-store')
        .status(200)
        .json(await refundWalletHealth());
    } catch {
      res.status(503).json({ error: 'refund_wallet_health_unavailable' });
    }
  },
);
