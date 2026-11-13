import { Router, type Request, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getPublicCatalog,
  getToolsPaginated,
  getPublicCatalogPage,
  getToolById,
  DEFAULT_TOOLS_LIMIT,
  MAX_TOOLS_LIMIT,
} from '../services/tool-registry.service';
import { discover, categorySummary } from '../services/discovery.service';
import { AppError, ErrorCode } from '../types/errors';
import { TOOL_DEFINITIONS } from '../mcp/tool-definitions';
import { getManifest } from '../mcp/tool-fingerprint';
import { toCompact } from '../services/tool-compact';

/**
 * Tool catalog routes (§6.15, §12.39, §12.114).
 *
 * GET /api/tools             — public catalog, no auth, Cache-Control: public, max-age=3600;
 *                              ?limit, ?cursor, ?category, ?view=full|compact (T-0836) page it
 * GET /api/v1/tools          — tool catalog (default DEFAULT_TOOLS_LIMIT rows, cursor pagination,
 *                              ?view=full|compact)
 * GET /api/v1/tools/:toolId  — single tool details, Cache-Control: public, max-age=300 (ZZ-03-03:
 *                              lowered from 3600 — this entry carries live quality.* data)
 * GET /api/v1/discover       — ranked discovery contract (ZZ-03-05), no auth,
 *                              no rate limiter (in-memory ranking), Cache-Control: max-age=60
 *                              (shorter than the catalog above — ranking depends on live
 *                              quality/availability, not just the static catalog).
 *
 * GET /api/v1/categories    — categories with tool counts and price range (T-0835), no auth,
 *                              in-memory only, Cache-Control: max-age=60; same object as the
 *                              MCP tool apibase.categories.
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

/**
 * T-0836: the four list parameters shared by both routes. Values are read as `unknown` and
 * checked with typeof first (a repeated query key arrives as an array). `present` is true when
 * any of limit, cursor, category or view was sent: only then does the response carry `truncated`.
 */
function parseListParams(query: Request['query']): {
  present: boolean;
  limit: number | undefined;
  cursor: string | null;
  category: string | undefined;
  view: 'full' | 'compact';
} {
  const q: Record<string, unknown> = query;
  const present = ['limit', 'cursor', 'category', 'view'].some((k) => q[k] !== undefined);

  let limit: number | undefined;
  if (q.limit !== undefined) {
    const parsed = typeof q.limit === 'string' ? parseInt(q.limit, 10) : NaN;
    if (isNaN(parsed) || parsed < 1 || parsed > MAX_TOOLS_LIMIT) {
      throw new AppError(ErrorCode.BAD_REQUEST, `limit must be between 1 and ${MAX_TOOLS_LIMIT}`);
    }
    limit = parsed;
  }

  let view: 'full' | 'compact' = 'full';
  if (q.view !== undefined) {
    if (q.view !== 'full' && q.view !== 'compact') {
      throw new AppError(ErrorCode.BAD_REQUEST, 'view must be one of: full, compact');
    }
    view = q.view;
  }

  let category: string | undefined;
  if (q.category !== undefined) {
    if (typeof q.category !== 'string' || !VALID_CATEGORIES.has(q.category)) {
      throw new AppError(
        ErrorCode.BAD_REQUEST,
        `category must be one of: ${[...VALID_CATEGORIES].sort().join(', ')}`,
      );
    }
    category = q.category;
  }

  if (q.cursor !== undefined && typeof q.cursor !== 'string') {
    throw new AppError(ErrorCode.BAD_REQUEST, 'cursor must be a single string');
  }
  const cursor = typeof q.cursor === 'string' ? q.cursor : null;
  return { present, limit, cursor, category, view };
}

// T-0836: both list routes reach the DB (getToolsPaginated, getPublicCatalogPage), so each lists
// this limiter literally in its handler array (CodeQL js/missing-rate-limiting). The ceiling is
// per address and far above any agent that pages through the catalog.
const TOOL_LIST_LIMIT_PER_MIN = 120;
const toolListLimiter = rateLimit({
  windowMs: 60_000,
  limit: TOOL_LIST_LIMIT_PER_MIN,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  message: { error: 'rate_limited', message: 'too many requests from this address' },
});

// --- Public catalog (§6.15) ---
toolsRouter.get(
  '/api/tools',
  toolListLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const params = parseListParams(req.query);
      if (params.present) {
        const page = await getPublicCatalogPage(
          params.cursor,
          params.limit ?? DEFAULT_TOOLS_LIMIT,
          { category: params.category },
          params.view === 'compact' ? (entries) => entries.map(toCompact) : undefined,
        );
        if (page.tools.length === 0 && !params.cursor && !params.category) {
          throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'No tools available');
        }
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.status(200).json(page);
        return;
      }

      const catalog = await getPublicCatalog();

      if (catalog.total === 0) {
        throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'No tools available');
      }

      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.status(200).json(catalog);
    } catch (err) {
      next(err);
    }
  },
);

// --- Paginated tool list ---
// Optional filters:
//   ?max_price=N        — only tools with price_usd <= N (e.g. "0.01")
//   ?tier=micro|standard|premium — bucketed price tier (tier wins over max_price)
//   ?category=<name>    — a category present in TOOL_DEFINITIONS (ZZ-03-01); one with no active tool
//                         is valid and returns zero rows
//   ?limit=N            — page size (1..MAX_TOOLS_LIMIT, default DEFAULT_TOOLS_LIMIT)
//   ?cursor=<b64>       — pagination cursor from previous response
//   ?view=full|compact  — compact items: id, name, category, price_usd, summary (T-0836)
toolsRouter.get(
  '/api/v1/tools',
  toolListLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const params = parseListParams(req.query);
      const { cursor, category } = params;
      const rawLimit = params.limit ?? DEFAULT_TOOLS_LIMIT;

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
          throw new AppError(
            ErrorCode.BAD_REQUEST,
            'tier must be one of: micro, standard, premium',
          );
        }
        tier = req.query.tier as 'micro' | 'standard' | 'premium';
      }

      const result = await getToolsPaginated(cursor, rawLimit, { maxPrice, tier, category });

      if (result.data.length === 0 && !cursor && !maxPrice && !tier && !category) {
        throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'No tools available');
      }

      res.setHeader('Cache-Control', 'public, max-age=3600');
      if (!params.present) {
        res.status(200).json(result);
        return;
      }
      res.status(200).json({
        ...result,
        data: params.view === 'compact' ? result.data.map(toCompact) : result.data,
        truncated: result.pagination.has_more,
      });
    } catch (err) {
      next(err);
    }
  },
);

// --- Definition manifest (T-0500) ---
// Registered above /:toolId so it is not swallowed by the param route. Pure in-memory: the
// handler touches no DB, fs or auth, so CodeQL rule 2 (rate limiter) does not apply.
toolsRouter.get('/api/v1/tools/manifest', (req: Request, res: Response) => {
  const manifest = getManifest();
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.setHeader('ETag', `"${manifest.manifest_sha256}"`);
  if (req.fresh) {
    res.status(304).end();
    return;
  }
  res.status(200).json(manifest);
});

// --- Single tool details ---
toolsRouter.get(
  '/api/v1/tools/:toolId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const toolId: unknown = req.params.toolId;
      // shop.* branch: in-memory map only, touches no DB, fs or auth (CodeQL rule 2 not engaged).
      if (typeof toolId === 'string' && toolId.startsWith('shop.')) {
        // Lazy: the shop fingerprint module pulls the shop services (config, DB clients).
        /* eslint-disable @typescript-eslint/no-require-imports */
        const { getShopToolDefinitions } =
          require('../shop/tool-fingerprint') as typeof import('../shop/tool-fingerprint');
        /* eslint-enable @typescript-eslint/no-require-imports */
        const shop = getShopToolDefinitions().get(toolId);
        if (shop) {
          res.setHeader('Cache-Control', 'public, max-age=300');
          res.status(200).json({
            id: shop.id,
            name: shop.name,
            description: shop.description,
            input_schema: shop.input_schema,
            definition_sha256: shop.definition_sha256,
          });
          return;
        }
      }
      const tool = await getToolById(toolId as string);
      if (!tool) {
        throw new AppError(ErrorCode.NOT_FOUND, `Tool not found: ${String(toolId)}`);
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

// --- Categories (T-0835) ---
// Same function as the MCP tool apibase.categories; reads only the in-memory tool cache joined
// with TOOL_DEFINITIONS (no query of its own), no rate limiter, like /api/v1/discover.
toolsRouter.get('/api/v1/categories', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const summary = await categorySummary();
    if (summary.total_tools === 0) {
      throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'No tools available');
    }
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.status(200).json(summary);
  } catch (err) {
    next(err);
  }
});

// --- Discovery contract (ZZ-03-05, 03-SPECIFICATION.md P-1/M-1) ---
// Query params:
//   ?intent=<text>              — free-text task description, ranked by keyword match
//   ?category=<name>            — one of TOOL_DEFINITIONS[].category's values (ZZ-03-01)
//   ?max_price_usd=N            — only tools priced at or below N
//   ?limit=N                    — max results (1..50, default 10)
//   ?kind=merchant              — shops only (needs intent; 'tool' = default behaviour)
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
      kind: req.query.kind,
    });

    res.setHeader('Cache-Control', 'public, max-age=60');
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});
