import { z, type ZodSchema } from 'zod';

const polymarketSearch = z
  .object({
    query: z.string(),
    category: z
      .enum([
        'politics',
        'crypto',
        'sports',
        'finance',
        'science',
        'culture',
        'geopolitics',
        'iran',
        'economics',
      ])
      .optional(),
    status: z.enum(['active', 'resolved', 'all']).optional(),
    sort_by: z
      .enum(['volume', 'newest', 'ending_soon', 'probability_high', 'probability_low'])
      .optional(),
    limit: z.number().int().max(100).optional(),
  })
  .strip();

const polymarketMarketDetail = z
  .object({
    market_id: z.string(),
    include_orderbook: z.boolean().optional(),
    include_history: z.boolean().optional(),
  })
  .strip();

const polymarketPrices = z
  .object({
    market_ids: z.array(z.string()).max(50),
  })
  .strip();

const polymarketPriceHistory = z
  .object({
    market_id: z.string(),
    interval: z.enum(['1h', '4h', '1d', '1w']).optional(),
    days: z.number().int().max(365).optional(),
  })
  .strip();

const polymarketGetOrderbook = z
  .object({
    market_id: z.string(),
    depth: z.number().int().max(50).optional(),
  })
  .strip();

const polymarketTrending = z
  .object({
    sort_by: z.enum(['volume_24h', 'newest', 'biggest_move', 'ending_soon']).optional(),
    category: z
      .enum(['politics', 'crypto', 'sports', 'finance', 'science', 'culture', 'geopolitics'])
      .optional(),
    limit: z.number().int().max(50).optional(),
  })
  .strip();

const polymarketLeaderboard = z
  .object({
    sort_by: z.enum(['profit', 'volume', 'markets_traded']).optional(),
    period: z.enum(['24h', '7d', '30d', 'all_time']).optional(),
    limit: z.number().int().max(100).optional(),
  })
  .strip();

export const polymarketSchemas: Record<string, ZodSchema> = {
  'polymarket.search': polymarketSearch,
  'polymarket.market_detail': polymarketMarketDetail,
  'polymarket.prices': polymarketPrices,
  'polymarket.price_history': polymarketPriceHistory,
  'polymarket.get_orderbook': polymarketGetOrderbook,
  'polymarket.trending': polymarketTrending,
  'polymarket.leaderboard': polymarketLeaderboard,
};
