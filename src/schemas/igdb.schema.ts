import { z, type ZodSchema } from 'zod';

const gameSearch = z
  .object({
    query: z
      .string()
      .describe('Search query for games (e.g. "Cyberpunk 2077", "The Legend of Zelda", "Elden Ring")'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of results to return (default 10, max 50)'),
  })
  .strip();

const gameDetails = z
  .object({
    id: z
      .number()
      .int()
      .describe('IGDB game ID (numeric, e.g. 1877 for Cyberpunk 2077)'),
  })
  .strip();

const companyInfo = z
  .object({
    id: z
      .number()
      .int()
      .optional()
      .describe('IGDB company ID (numeric, e.g. 70 for Nintendo). Use either id or query.'),
    query: z
      .string()
      .optional()
      .describe('Search query for company name (e.g. "Valve", "CD Projekt"). Use either id or query.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of results when searching by query (default 10, max 50)'),
  })
  .strip();

const platformInfo = z
  .object({
    id: z
      .number()
      .int()
      .optional()
      .describe('IGDB platform ID (numeric, e.g. 48 for PlayStation 4, 6 for PC). Use either id or query.'),
    query: z
      .string()
      .optional()
      .describe('Search query for platform name (e.g. "PlayStation", "Nintendo Switch"). Use either id or query.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of results when searching by query (default 10, max 50)'),
  })
  .strip();

const gameMedia = z
  .object({
    id: z
      .number()
      .int()
      .describe('IGDB game ID (numeric, e.g. 1877 for Cyberpunk 2077)'),
  })
  .strip();

export const igdbSchemas: Record<string, ZodSchema> = {
  'igdb.game_search': gameSearch,
  'igdb.game_details': gameDetails,
  'igdb.company_info': companyInfo,
  'igdb.platform_info': platformInfo,
  'igdb.game_media': gameMedia,
};
