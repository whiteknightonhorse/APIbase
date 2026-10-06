import { Router, type Request, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { getFleetSea } from '../services/fleet-sea.service';

/**
 * GET /api/v1/fleet/sea — public, read-only neutral fleet view (T-INT-29, spec §13.3/§8.6).
 * Served from the Redis aggregate written by scripts/sea-fleet-export.py. nginx: rides the
 * existing `location /api/` prefix block.
 */
const fleetSeaLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store').status(429).json({
      error: 'rate_limited',
      error_description: 'Too many requests — rate limit exceeded',
    });
  },
});

export const fleetSeaRouter = Router();

fleetSeaRouter.get(
  '/api/v1/fleet/sea',
  fleetSeaLimiter,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await getFleetSea();
      res.setHeader('Cache-Control', 'public, max-age=10, s-maxage=10');
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  },
);
