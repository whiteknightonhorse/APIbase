import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  getPublicCatalog,
  getToolsPaginated,
  getToolById,
} from '../services/tool-registry.service';
import { discover } from '../services/discovery.service';
import { AppError, ErrorCode } from '../types/errors';
import { TOOL_DEFINITIONS } from '../mcp/tool-definitions';

/**
 * Tool catalog routes (§6.15, §12.39, §12.114).
 *
 * GET /api/tools             — public catalog, no auth, Cache-Control: public, max-age=3600
 * GET /api/v1/tools          — full tool catalog (default 1000, cursor pagination available)
 * GET /api/v1/tools/:toolId  — single tool details, Cache-Control: public, max-age=300 (ZZ-03-03:
 *                              lowered from 3600 — this entry carries live quality.* data)
 * GET /api/v1/discover       — ranked discovery contract (ZZ-03-05), no auth, same
 *                              no-rate-limit posture as /api/tools, Cache-Control: max-age=60
 *                              (shorter than the catalog above — ranking depends on live
 *                              quality/availability, not just the static catalog).
 *
 * All three catalog entries additionally carry `quality` (ZZ-03-03: provider_status + per-tool
 * Redis quality, additive, never breaking a pre-existing consumer).
 *
 * Empty catalog → 503 (never return empty tool list silently).
 */
export const toolsRouter = Router();

// ZZ-03-01: valid ?category= values, auto-derived from TOOL_DEFINITIONS — same source of
// truth the migration backfilled tools.category from, never a hardcoded list that drifts.
const VALID_CATEGORIES = new Set(TOOL_DEFINITIONS.map((def) => def.category));

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
// Optional filters:
//   ?max_price=N        — only tools with price_usd <= N (e.g. "0.01")
//   ?tier=micro|standard|premium — bucketed price tier (tier wins over max_price)
//   ?category=<name>    — one of TOOL_DEFINITIONS[].category's 25 values (ZZ-03-01)
//   ?limit=N            — page size (1..1000, default 1000)
//   ?cursor=<b64>       — pagination cursor from previous response
toolsRouter.get('/api/v1/tools', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : null;
    const rawLimit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 2000;

    if (isNaN(rawLimit) || rawLimit < 1 || rawLimit > 2000) {
      throw new AppError(ErrorCode.BAD_REQUEST, 'limit must be between 1 and 2000');
    }

    let maxPrice: number | undefined;
    if (typeof req.query.max_price === 'string') {
      const parsed = Number(req.query.max_price);
      if (!isFinite(parsed) || parsed < 0) {
        throw new AppError(ErrorCode.BAD_REQUEST, 'max_price must be a non-negative number');
      }
      maxPrice = parsed;
    }

    let tier: 'micro' | 'standard' | 'premium' | undefined;
    if (typeof req.query.tier === 'string') {
      if (!['micro', 'standard', 'premium'].includes(req.query.tier)) {
        throw new AppError(ErrorCode.BAD_REQUEST, 'tier must be one of: micro, standard, premium');
      }
      tier = req.query.tier as 'micro' | 'standard' | 'premium';
    }

    let category: string | undefined;
    if (typeof req.query.category === 'string') {
      if (!VALID_CATEGORIES.has(req.query.category)) {
        throw new AppError(
          ErrorCode.BAD_REQUEST,
          `category must be one of: ${[...VALID_CATEGORIES].sort().join(', ')}`,
        );
      }
      category = req.query.category;
    }

    const result = await getToolsPaginated(cursor, rawLimit, { maxPrice, tier, category });

    if (result.data.length === 0 && !cursor && !maxPrice && !tier && !category) {
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
      // ZZ-03-03: this response now carries live quality.tool/quality.provider
      // data (provider_status + Redis, both far fresher than an hour) — the
      // catalog-wide 3600s max-age above would let it go stale well past
      // what a quality-aware caller expects.
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.status(200).json(tool);
    } catch (err) {
      next(err);
    }
  },
);

// --- Discovery contract (ZZ-03-05, 03-SPECIFICATION.md P-1/M-1) ---
// Query params:
//   ?intent=<text>              — free-text task description, ranked by keyword match
//   ?category=<name>            — one of TOOL_DEFINITIONS[].category's values (ZZ-03-01)
//   ?max_price_usd=N            — only tools priced at or below N
//   ?limit=N                    — max results (1..50, default 10)
//   ?include_unavailable=true   — include tools currently marked unavailable (default: excluded)
toolsRouter.get('/api/v1/discover', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const intent = typeof req.query.intent === 'string' ? req.query.intent : undefined;
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;

    let maxPriceUsd: number | undefined;
    if (typeof req.query.max_price_usd === 'string') {
      const parsed = Number(req.query.max_price_usd);
      if (!isFinite(parsed) || parsed < 0) {
        throw new AppError(ErrorCode.BAD_REQUEST, 'max_price_usd must be a non-negative number');
      }
      maxPriceUsd = parsed;
    }

    let limit: number | undefined;
    if (typeof req.query.limit === 'string') {
      const parsed = parseInt(req.query.limit, 10);
      if (isNaN(parsed) || parsed < 1 || parsed > 50) {
        throw new AppError(ErrorCode.BAD_REQUEST, 'limit must be between 1 and 50');
      }
      limit = parsed;
    }

    const includeUnavailable = req.query.include_unavailable === 'true';

    const result = await discover({
      intent,
      category,
      max_price_usd: maxPriceUsd,
      limit,
      include_unavailable: includeUnavailable,
    });

    res.setHeader('Cache-Control', 'public, max-age=60');
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});
