import { z, type ZodSchema } from 'zod';

const quote = z
  .object({
    symbol: z.string().min(1).max(10).describe('Stock ticker symbol (e.g. "AAPL", "GOOGL", "TSLA", "MSFT")'),
  })
  .strip();

const companyProfile = z
  .object({
    symbol: z.string().min(1).max(10).describe('Stock ticker symbol (e.g. "AAPL")'),
  })
  .strip();

const companyNews = z
  .object({
    symbol: z.string().min(1).max(10).describe('Stock ticker symbol (e.g. "AAPL")'),
    from: z.string().optional().describe('Start date in YYYY-MM-DD format (default: 7 days ago)'),
    to: z.string().optional().describe('End date in YYYY-MM-DD format (default: today)'),
  })
  .strip();

const candles = z
  .object({
    symbol: z.string().min(1).max(10).describe('Stock ticker symbol (e.g. "AAPL")'),
    resolution: z
      .enum(['1', '5', '15', '30', '60', 'D', 'W', 'M'])
      .optional()
      .describe('Candle resolution: "1","5","15","30","60" (minutes), "D" (day), "W" (week), "M" (month). Default: "D"'),
    from: z.number().int().optional().describe('Start timestamp (Unix seconds). Default: 30 days ago'),
    to: z.number().int().optional().describe('End timestamp (Unix seconds). Default: now'),
  })
  .strip();

const marketNews = z
  .object({
    category: z
      .enum(['general', 'forex', 'crypto', 'merger'])
      .optional()
      .describe('News category: "general" (default), "forex", "crypto", "merger"'),
  })
  .strip();

export const finnhubSchemas: Record<string, ZodSchema> = {
  'finnhub.quote': quote,
  'finnhub.company_profile': companyProfile,
  'finnhub.company_news': companyNews,
  'finnhub.candles': candles,
  'finnhub.market_news': marketNews,
};
