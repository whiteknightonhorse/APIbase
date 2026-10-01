import { z, type ZodSchema } from 'zod';

const limit = z
  .number()
  .int()
  .min(1)
  .max(100)
  .optional()
  .describe('Maximum number of records to return (1-100, default 20)');

const dataset = z
  .object({
    id: z
      .string()
      .min(1)
      .describe('Dataset ID from data.gov.my catalogue (e.g. "fuelprice", "cpi_headline")'),
    source: z
      .enum(['data-catalogue', 'opendosm'])
      .optional()
      .describe('Dataset source: "data-catalogue" (default) or "opendosm" (Dept. of Statistics)'),
    filter: z
      .string()
      .optional()
      .describe('Exact-match filter in "value@column" form (e.g. "overall@division")'),
    contains: z
      .string()
      .optional()
      .describe('Partial-match filter in "value@column" form (e.g. "kuala@state")'),
    date_start: z.string().optional().describe('Start date filter, YYYY-MM-DD'),
    date_end: z.string().optional().describe('End date filter, YYYY-MM-DD'),
    sort: z
      .string()
      .optional()
      .describe('Comma-separated columns to sort by; prefix "-" for descending (e.g. "-date")'),
    limit,
  })
  .strip();

const weatherForecast = z
  .object({
    location_name: z
      .string()
      .optional()
      .describe('Location name to match (e.g. "Langkawi", "Kuala Lumpur", "Kota Kinabalu")'),
    date_start: z.string().optional().describe('Earliest forecast date, YYYY-MM-DD'),
    date_end: z.string().optional().describe('Latest forecast date, YYYY-MM-DD'),
    limit,
  })
  .strip();

const weatherWarning = z.object({ limit }).strip();

const earthquake = z.object({ limit }).strip();

const floodWarning = z
  .object({
    state: z
      .string()
      .optional()
      .describe('Malaysian state in upper case (e.g. "PAHANG", "SELANGOR")'),
    district: z.string().optional().describe('District name (e.g. "Raub", "Klang")'),
    limit,
  })
  .strip();

export const malaysiagovSchemas: Record<string, ZodSchema> = {
  'malaysiagov.dataset': dataset,
  'malaysiagov.weather_forecast': weatherForecast,
  'malaysiagov.weather_warning': weatherWarning,
  'malaysiagov.earthquake': earthquake,
  'malaysiagov.flood_warning': floodWarning,
};
