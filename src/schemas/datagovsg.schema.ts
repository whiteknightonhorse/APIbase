import { z, type ZodSchema } from 'zod';

const datedQuery = z
  .object({
    date: z
      .string()
      .optional()
      .describe(
        'Optional ISO 8601 date (YYYY-MM-DD) or datetime to query historical data. If omitted, returns the latest snapshot.',
      ),
  })
  .strip();

const noParams = z
  .object({
    refresh: z
      .boolean()
      .optional()
      .describe('Set to true to bypass cache and re-fetch the latest snapshot.'),
  })
  .strip();

export const datagovsgSchemas: Record<string, ZodSchema> = {
  'sg.weather_forecast': datedQuery,
  'sg.air_quality': datedQuery,
  'sg.rainfall': datedQuery,
  'sg.taxi_availability': noParams,
};
