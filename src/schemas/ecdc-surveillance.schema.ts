import { z, type ZodSchema } from 'zod';

const casesDeaths = z
  .object({
    country: z
      .string()
      .min(2)
      .max(60)
      .describe(
        'Country name or ISO3 country code to filter by (e.g. "Austria" or "AUT"). Required — the ' +
          'upstream dataset has no server-side query, so this narrows the full historical dump.',
      ),
    indicator: z
      .enum(['cases', 'deaths'])
      .optional()
      .describe('Filter to only "cases" or only "deaths" rows. Omit to return both.'),
    year_week: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional()
      .describe(
        'Filter to a single ISO week, format "YYYY-WW" (e.g. "2022-15"). Omit to return all weeks.',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe('Maximum number of records to return (default 100, max 500).'),
  })
  .strip();

const testingRate = z
  .object({
    country: z
      .string()
      .min(2)
      .max(60)
      .describe(
        'Country name or ISO2 country code to filter by (e.g. "Austria" or "AT"). Required — the ' +
          'upstream dataset has no server-side query, so this narrows the full historical dump.',
      ),
    year_week: z
      .string()
      .regex(/^\d{4}-W\d{2}$/)
      .optional()
      .describe(
        'Filter to a single ISO week, format "YYYY-Www" (e.g. "2021-W48"). Omit to return all weeks.',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe('Maximum number of records to return (default 100, max 500).'),
  })
  .strip();

const hospitalIcu = z
  .object({
    country: z
      .string()
      .min(2)
      .max(60)
      .describe(
        'Country name to filter by (e.g. "Germany"). Required — the upstream dataset has no ' +
          'server-side query, so this narrows the full historical dump.',
      ),
    indicator: z
      .enum([
        'Daily hospital occupancy',
        'Daily ICU occupancy',
        'Weekly new hospital admissions per 100k',
        'Weekly new ICU admissions per 100k',
      ])
      .optional()
      .describe('Filter to a single indicator series. Omit to return all four indicators.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe('Maximum number of records to return (default 100, max 500).'),
  })
  .strip();

export const ecdcSurveillanceSchemas: Record<string, ZodSchema> = {
  'ecdc-surveillance.cases_deaths': casesDeaths,
  'ecdc-surveillance.testing_rate': testingRate,
  'ecdc-surveillance.hospital_icu': hospitalIcu,
};
