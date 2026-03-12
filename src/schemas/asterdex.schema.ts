import { z } from 'zod';

export const asterdexSchemas: Record<string, z.ZodSchema> = {
  'aster.exchange_info': z.object({}).strip(),

  'aster.market_data': z.object({
    symbol: z.string().optional().describe('Trading pair symbol (e.g. BTCUSDT). Omit for all pairs.'),
  }).strip(),

  'aster.order_book': z.object({
    symbol: z.string().describe('Trading pair symbol (e.g. BTCUSDT)'),
    limit: z.number().int().min(5).max(1000).optional().describe('Depth limit (default 20)'),
  }).strip(),

  'aster.klines': z.object({
    symbol: z.string().describe('Trading pair symbol (e.g. BTCUSDT)'),
    interval: z.enum(['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M']).optional().describe('Candlestick interval (default 1h)'),
    limit: z.number().int().min(1).max(1500).optional().describe('Number of candles (default 100)'),
    start_time: z.number().int().optional().describe('Start time in milliseconds since epoch'),
    end_time: z.number().int().optional().describe('End time in milliseconds since epoch'),
  }).strip(),
};
