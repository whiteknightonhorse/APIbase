import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  getPublicCatalog,
  getToolsPaginated,
  getToolById,
} from '../services/tool-registry.service';
import { AppError, ErrorCode } from '../types/errors';

/**
 * Tool catalog routes (§6.15, §12.39, §12.114).
 *
 * GET /api/tools             — public catalog, no auth, Cache-Control: public, max-age=3600
 * GET /api/v1/tools          — paginated tool list (cursor, default 200, max 500)
 * GET /api/v1/tools/:toolId  — single tool details
 *
 * Empty catalog → 503 (never return empty tool list silently).
 */
export const toolsRouter = Router();

// --- Public catalog (§6.15) ---
toolsRouter.get('/api/tools', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const catalog = await getPublicCatalog();

    if (catalog.total === 0) {
      throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'No tools available');
    }

    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).json(catalog);
  } catch (err) {
    next(err);
  }
});

// --- Paginated tool list ---
toolsRouter.get('/api/v1/tools', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : null;
    const rawLimit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 200;

    if (isNaN(rawLimit) || rawLimit < 1 || rawLimit > 500) {
      throw new AppError(ErrorCode.BAD_REQUEST, 'limit must be between 1 and 500');
    }

    const result = await getToolsPaginated(cursor, rawLimit);

    if (result.data.length === 0 && !cursor) {
      throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'No tools available');
    }

    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// --- Single tool details ---
toolsRouter.get(
  '/api/v1/tools/:toolId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const toolId = req.params.toolId as string;
      const tool = await getToolById(toolId);
      if (!tool) {
        throw new AppError(ErrorCode.NOT_FOUND, `Tool not found: ${toolId}`);
      }
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.status(200).json(tool);
    } catch (err) {
      next(err);
    }
  },
);
