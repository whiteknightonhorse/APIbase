import { z, type ZodSchema } from 'zod';

const apod = z
  .object({
    date: z
      .string()
      .optional()
      .describe('Date in YYYY-MM-DD format (default: today). Returns the Astronomy Picture of the Day for that date'),
    thumbs: z
      .boolean()
      .optional()
      .describe('Return thumbnail URL for video APOD entries (default false)'),
  })
  .strip();

const neoFeed = z
  .object({
    start_date: z
      .string()
      .describe('Start date in YYYY-MM-DD format for asteroid feed (max 7-day span)'),
    end_date: z
      .string()
      .optional()
      .describe('End date in YYYY-MM-DD format (default: start_date + 7 days)'),
  })
  .strip();

const donkiFlr = z
  .object({
    start_date: z
      .string()
      .optional()
      .describe('Start date in YYYY-MM-DD format (default: 30 days ago)'),
    end_date: z
      .string()
      .optional()
      .describe('End date in YYYY-MM-DD format (default: today)'),
  })
  .strip();

const epic = z
  .object({
    date: z
      .string()
      .optional()
      .describe('Date in YYYY-MM-DD format (default: most recent available). Returns DSCOVR EPIC Earth images for that date'),
  })
  .strip();

const imageSearch = z
  .object({
    q: z.string().describe('Search query for NASA images and videos (e.g. "mars rover", "apollo 11", "nebula")'),
    media_type: z
      .enum(['image', 'video', 'audio'])
      .optional()
      .describe('Filter by media type (default: all types)'),
    year_start: z
      .number()
      .int()
      .optional()
      .describe('Filter results to year >= year_start'),
    year_end: z
      .number()
      .int()
      .optional()
      .describe('Filter results to year <= year_end'),
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Page number for pagination (default 1)'),
  })
  .strip();

export const nasaSchemas: Record<string, ZodSchema> = {
  'nasa.apod': apod,
  'nasa.neo_feed': neoFeed,
  'nasa.donki_flr': donkiFlr,
  'nasa.epic': epic,
  'nasa.image_search': imageSearch,
};
