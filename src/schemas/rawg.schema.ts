import { z, type ZodSchema } from 'zod';

const gameSearch = z
  .object({
    search: z
      .string()
      .optional()
      .describe('Search query for games (e.g. "The Witcher", "Red Dead Redemption")'),
    genres: z
      .string()
      .optional()
      .describe('Filter by genre IDs — comma-separated (e.g. "4" for action, "5" for RPG, "4,5" for both)'),
    platforms: z
      .string()
      .optional()
      .describe('Filter by platform IDs — comma-separated (e.g. "4" for PC, "187" for PS5, "186" for Xbox Series)'),
    dates: z
      .string()
      .optional()
      .describe('Filter by release date range YYYY-MM-DD,YYYY-MM-DD (e.g. "2024-01-01,2024-12-31")'),
    ordering: z
      .string()
      .optional()
      .describe('Sort field: name, released, added, created, updated, rating, metacritic. Prefix with "-" for descending (e.g. "-rating")'),
    metacritic: z
      .string()
      .optional()
      .describe('Filter by Metacritic score range "min,max" (e.g. "80,100" for highly rated)'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(40)
      .optional()
      .describe('Number of results per page (default 20, max 40)'),
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Page number for pagination (default 1)'),
  })
  .strip();

const gameDetails = z
  .object({
    id: z
      .union([z.number().int(), z.string()])
      .describe('RAWG game ID (numeric) or slug (e.g. "grand-theft-auto-v", 3498)'),
  })
  .strip();

const screenshots = z
  .object({
    id: z
      .union([z.number().int(), z.string()])
      .describe('RAWG game ID or slug'),
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Page number (default 1)'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(40)
      .optional()
      .describe('Results per page (default 20, max 40)'),
  })
  .strip();

const storeLinks = z
  .object({
    id: z
      .union([z.number().int(), z.string()])
      .describe('RAWG game ID or slug'),
  })
  .strip();

const gameSeries = z
  .object({
    id: z
      .union([z.number().int(), z.string()])
      .describe('RAWG game ID or slug'),
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Page number (default 1)'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(40)
      .optional()
      .describe('Results per page (default 20, max 40)'),
  })
  .strip();

export const rawgSchemas: Record<string, ZodSchema> = {
  'rawg.game_search': gameSearch,
  'rawg.game_details': gameDetails,
  'rawg.screenshots': screenshots,
  'rawg.store_links': storeLinks,
  'rawg.game_series': gameSeries,
};
