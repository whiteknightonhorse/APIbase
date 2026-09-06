import { z, type ZodSchema } from 'zod';

const list = z
  .object({
    by_city: z.string().optional().describe('Filter breweries by city name (e.g. "Portland").'),
    by_country: z
      .string()
      .optional()
      .describe('Filter breweries by country name (e.g. "United States").'),
    by_state: z
      .string()
      .optional()
      .describe('Filter by full state/province name, no abbreviations (e.g. "California").'),
    by_postal: z
      .string()
      .optional()
      .describe('Filter by postal/ZIP code — 5-digit or postal+4 (e.g. "44107" or "44107-1234").'),
    by_type: z
      .enum([
        'micro',
        'nano',
        'regional',
        'brewpub',
        'large',
        'planning',
        'bar',
        'contract',
        'proprietor',
        'closed',
      ])
      .optional()
      .describe('Filter by brewery type.'),
    by_dist: z
      .string()
      .optional()
      .describe(
        'Sort results by distance from an origin point, as "latitude,longitude" (e.g. "39.7,-104.9"). Cannot be combined with sort.',
      ),
    by_ids: z
      .string()
      .optional()
      .describe('Comma-separated list of specific brewery IDs to fetch.'),
    by_name: z.string().optional().describe('Filter breweries by name (partial match).'),
    sort: z
      .string()
      .optional()
      .describe(
        'Sort field(s) with asc/desc, e.g. "name" or "name:desc". Not usable with by_dist.',
      ),
    page: z.number().int().min(1).optional().describe('Page number for pagination (default 1).'),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe('Results per page (default 50, max 200).'),
  })
  .strip();

const search = z
  .object({
    query: z
      .string()
      .min(1)
      .describe('Search term matched against brewery names (partial, case-insensitive).'),
    page: z.number().int().min(1).optional().describe('Page number for pagination (default 1).'),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe('Results per page (default 50, max 200).'),
  })
  .strip();

const random = z
  .object({
    size: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of random breweries to return (default 1, max 50).'),
  })
  .strip();

export const openbrewerySchemas: Record<string, ZodSchema> = {
  'openbrewery.list': list,
  'openbrewery.search': search,
  'openbrewery.random': random,
};
