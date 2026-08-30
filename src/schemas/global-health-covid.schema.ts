import { z, type ZodSchema } from 'zod';

const locationSearch = z
  .object({
    query: z
      .string()
      .min(1)
      .max(80)
      .optional()
      .describe(
        'Free-text match against country, subregion, or locality name (e.g. "California", ' +
          '"Germany"). Case-insensitive substring match. Omit to browse by country_code/aggregation_level only.',
      ),
    country_code: z
      .string()
      .length(2)
      .optional()
      .describe('Filter to a single 2-letter ISO country code (e.g. "US", "DE").'),
    aggregation_level: z
      .enum(['0', '1', '2', '3'])
      .optional()
      .describe(
        'Filter by administrative level: "0"=country, "1"=state/province, "2"=county, "3"=locality/city.',
      ),
  })
  .strip();

const latestSnapshot = z
  .object({
    location_key: z
      .string()
      .min(2)
      .max(20)
      .describe(
        'Location key from the dataset, e.g. "US" (country), "US_CA" (state), or a deeper key ' +
          'discovered via global-health-covid.location_search.',
      ),
    dataset: z
      .enum(['epidemiology', 'hospitalizations', 'vaccinations'])
      .describe(
        'Which dataset to fetch the latest known snapshot from: "epidemiology" (cases/deaths/tests), ' +
          '"hospitalizations" (hospital/ICU/ventilator patient counts), or "vaccinations" (vaccination totals).',
      ),
  })
  .strip();

const locationHistory = z
  .object({
    location_key: z
      .string()
      .min(2)
      .max(20)
      .describe(
        'Location key from the dataset, e.g. "US" (country), "US_CA" (state), or a deeper key ' +
          'discovered via global-health-covid.location_search.',
      ),
    start_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe(
        'Filter history to dates on/after this ISO date, format "YYYY-MM-DD". Omit for full history.',
      ),
    end_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe(
        'Filter history to dates on/before this ISO date, format "YYYY-MM-DD". Omit for full history.',
      ),
  })
  .strip();

export const globalHealthCovidSchemas: Record<string, ZodSchema> = {
  'global-health-covid.location_search': locationSearch,
  'global-health-covid.latest_snapshot': latestSnapshot,
  'global-health-covid.location_history': locationHistory,
};
