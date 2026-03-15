import { z, type ZodSchema } from 'zod';

const polymarketSearch = z
  .object({
    query: z.string().describe('Search query for prediction markets'),
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
      .optional()
      .describe('Filter by market category'),
    status: z.enum(['active', 'resolved', 'all']).optional().describe('Filter by market status'),
    sort_by: z
      .enum(['volume', 'newest', 'ending_soon', 'probability_high', 'probability_low'])
      .optional()
      .describe('Sort order for results'),
    limit: z.number().int().max(100).optional().describe('Max number of results (1-100)'),
  })
  .strip();

const polymarketMarketDetail = z
  .object({
    market_id: z.string().describe('Polymarket condition ID or slug'),
    include_orderbook: z.boolean().optional().describe('Include current order book snapshot'),
    include_history: z.boolean().optional().describe('Include recent price history'),
  })
  .strip();

const polymarketPrices = z
  .object({
    token_id: z.string().describe('Polymarket CLOB token ID'),
  })
  .strip();

const polymarketPriceHistory = z
  .object({
    market_id: z.string().describe('Polymarket condition ID'),
    interval: z.enum(['1h', '4h', '1d', '1w']).optional().describe('Price data interval for history (1h, 4h, 1d, or 1w)'),
    days: z.number().int().max(365).optional().describe('Number of days of history (1-365)'),
  })
  .strip();

const polymarketGetOrderbook = z
  .object({
    market_id: z.string().describe('Polymarket condition ID'),
    depth: z.number().int().max(50).optional().describe('Number of price levels per side (1-50)'),
  })
  .strip();

const polymarketTrending = z
  .object({
    sort_by: z.enum(['volume_24h', 'newest', 'biggest_move', 'ending_soon']).optional().describe('Sort order for trending markets'),
    category: z
      .enum(['politics', 'crypto', 'sports', 'finance', 'science', 'culture', 'geopolitics'])
      .optional()
      .describe('Filter by market category'),
    limit: z.number().int().max(50).optional().describe('Max number of results (1-50)'),
  })
  .strip();

// Phase 2 — Trading tools (UC-001 §3-§8)

const polymarketPlaceOrder = z
  .object({
    token_id: z.string().describe('Polymarket CLOB token ID to trade'),
    price: z.number().min(0.01).max(0.99).describe('Limit price between 0.01 and 0.99'),
    side: z.enum(['buy', 'sell']).describe('Order side: buy or sell'),
    size: z.number().min(1).describe('Order size in USDC units'),
    order_type: z.enum(['GTC', 'GTD', 'FOK']).optional().describe('Order type: Good-Til-Cancelled, Good-Til-Date, Fill-Or-Kill'),
    tick_size: z.string().optional().describe('Minimum price increment (e.g. 0.01, 0.001)'),
    neg_risk: z.boolean().optional().describe('Whether this is a negative risk market'),
  })
  .strip();

const polymarketCancelOrder = z
  .object({
    order_id: z.string().describe('Polymarket order ID to cancel (from open_orders response)'),
  })
  .strip();

const polymarketOpenOrders = z
  .object({
    market_id: z.string().optional().describe('Filter orders by market condition ID'),
  })
  .strip();

const polymarketTradeHistory = z
  .object({
    market_id: z.string().optional().describe('Filter trades by market condition ID'),
    limit: z.number().int().max(100).optional().describe('Max number of results (1-100)'),
  })
  .strip();

const polymarketBalance = z
  .object({
    asset_type: z.enum(['COLLATERAL', 'CONDITIONAL']).optional().describe('Asset type: COLLATERAL (USDC) or CONDITIONAL (outcome tokens)'),
  })
  .strip();

export const polymarketSchemas: Record<string, ZodSchema> = {
  'polymarket.search': polymarketSearch,
  'polymarket.market_detail': polymarketMarketDetail,
  'polymarket.prices': polymarketPrices,
  'polymarket.price_history': polymarketPriceHistory,
  'polymarket.get_orderbook': polymarketGetOrderbook,
  'polymarket.trending': polymarketTrending,
  'polymarket.place_order': polymarketPlaceOrder,
  'polymarket.cancel_order': polymarketCancelOrder,
  'polymarket.open_orders': polymarketOpenOrders,
  'polymarket.trade_history': polymarketTradeHistory,
  'polymarket.balance': polymarketBalance,
};
