import { Router, type Request, type Response, type NextFunction } from 'express';
import { getDashboardData } from '../services/dashboard.service';

/**
 * Dashboard API route.
 *
 * GET /api/v1/dashboard — public provider status dashboard data.
 * Cached 60s in Redis, no auth required.
 */
export const dashboardRouter = Router();

dashboardRouter.get('/api/v1/dashboard', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await getDashboardData();
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
});
