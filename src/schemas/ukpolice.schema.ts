import { z, type ZodSchema } from 'zod';

const crimesNear = z
  .object({
    lat: z.number().describe('Latitude (e.g. 51.5074 for central London). UK area only.'),
    lng: z.number().describe('Longitude (e.g. -0.1278 for central London).'),
    date: z
      .string()
      .optional()
      .describe(
        'Month in YYYY-MM format (e.g. "2024-06"). Defaults to latest available month if omitted.',
      ),
    category: z
      .string()
      .optional()
      .describe(
        'Crime category slug — "all-crime" (default), "burglary", "violent-crime", "drugs", "robbery", "shoplifting", "vehicle-crime", "anti-social-behaviour", etc.',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe('Max crime records to return (default 100, max 500).'),
  })
  .strip();

const forces = z
  .object({
    refresh: z
      .boolean()
      .optional()
      .describe('Set to true to bypass cache and re-fetch the list of 43 UK police forces.'),
  })
  .strip();

const outcomes = z
  .object({
    lat: z.number().describe('Latitude of the location to query (e.g. 51.5074).'),
    lng: z.number().describe('Longitude of the location to query (e.g. -0.1278).'),
    date: z
      .string()
      .optional()
      .describe('Month in YYYY-MM format. Defaults to latest available month.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe('Max outcome records to return (default 100, max 500).'),
  })
  .strip();

export const ukpoliceSchemas: Record<string, ZodSchema> = {
  'ukpolice.crimes_near': crimesNear,
  'ukpolice.forces': forces,
  'ukpolice.outcomes_at_location': outcomes,
};
