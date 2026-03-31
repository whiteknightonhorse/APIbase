import { z, type ZodSchema } from 'zod';

const DOMAINS = 'Amazon marketplace: US, UK, CA, DE, FR, IT, ES, AU, IN, MX, BR, JP (default US)';

const search = z
  .object({
    query: z.string().describe('Search keywords (e.g. "wireless headphones", "raspberry pi 5")'),
    domain: z.string().optional().default('US').describe(DOMAINS),
    page: z.number().int().min(1).optional().describe('Page number for pagination'),
    sort: z
      .enum(['relevance', 'price_asc', 'price_desc', 'rating', 'reviews', 'newest'])
      .optional()
      .describe('Sort order: relevance, price_asc, price_desc, rating, reviews, newest'),
    price_min: z.number().optional().describe('Minimum price filter (in marketplace currency)'),
    price_max: z.number().optional().describe('Maximum price filter (in marketplace currency)'),
  })
  .strip();

const product = z
  .object({
    asin: z
      .string()
      .describe('Amazon ASIN product ID (e.g. "B0CRSNCJ6Y"). Get ASINs from canopy.search'),
    domain: z.string().optional().default('US').describe(DOMAINS),
  })
  .strip();

const offers = z
  .object({
    asin: z
      .string()
      .describe(
        'Amazon ASIN product ID. Returns all third-party offers with Buy Box winner, seller ratings, delivery info',
      ),
    domain: z.string().optional().default('US').describe(DOMAINS),
  })
  .strip();

const deals = z
  .object({
    domain: z.string().optional().default('US').describe(DOMAINS),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
  })
  .strip();

export const canopySchemas: Record<string, ZodSchema> = {
  'canopy.search': search,
  'canopy.product': product,
  'canopy.offers': offers,
  'canopy.deals': deals,
};
