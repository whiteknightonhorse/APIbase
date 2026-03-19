import { z, type ZodSchema } from 'zod';

const latest = z
  .object({
    q: z.string().optional().describe('Search keywords in article title and content (e.g. "AI agents", "climate change")'),
    country: z.string().optional().describe('Country code filter, comma-separated (e.g. "us", "gb,de,fr"). 200+ countries supported.'),
    category: z
      .string()
      .optional()
      .describe('Category filter, comma-separated: business, entertainment, environment, food, health, politics, science, sports, technology, top, tourism, world'),
    language: z.string().optional().describe('Language code filter (e.g. "en", "de", "fr", "es"). 70+ languages supported.'),
    domain: z.string().optional().describe('Filter by source domain (e.g. "bbc.co.uk", "nytimes.com")'),
    timeframe: z.string().optional().describe('Recency filter in hours (e.g. "24" for last 24 hours, "1" for last hour)'),
    size: z.number().int().min(1).max(50).optional().describe('Number of articles to return (default 10, max 50)'),
  })
  .strip();

const crypto = z
  .object({
    q: z.string().optional().describe('Search keywords in crypto news (e.g. "Bitcoin ETF", "DeFi")'),
    language: z.string().optional().describe('Language code (e.g. "en")'),
    coin: z.string().optional().describe('Specific coin filter (e.g. "Bitcoin", "Ethereum", "Solana")'),
    size: z.number().int().min(1).max(50).optional().describe('Number of articles (default 10, max 50)'),
  })
  .strip();

const sources = z
  .object({
    country: z.string().optional().describe('Country code to filter sources (e.g. "us", "gb")'),
    language: z.string().optional().describe('Language code to filter sources (e.g. "en")'),
    category: z.string().optional().describe('Category to filter sources (e.g. "technology", "business")'),
  })
  .strip();

export const newsdataSchemas: Record<string, ZodSchema> = {
  'news.latest': latest,
  'news.crypto': crypto,
  'news.sources': sources,
};
