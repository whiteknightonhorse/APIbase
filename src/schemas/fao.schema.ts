import { z } from 'zod';

const countryCodeField = z
  .string()
  .min(2)
  .max(3)
  .describe(
    'Country code: ISO 3166-1 alpha-2 (e.g. "IN", "US", "ET"), alpha-3 (e.g. "IND"), or ISO numeric (e.g. "356")',
  );

const startYearField = z
  .number()
  .int()
  .min(1961)
  .max(2030)
  .optional()
  .describe('Start year for the time series (default: 2015, earliest available: 1961)');

const endYearField = z
  .number()
  .int()
  .min(1961)
  .max(2030)
  .optional()
  .describe('End year for the time series (default: latest available)');

export const faoSchemas: Record<string, z.ZodSchema> = {
  'faostat.food_security': z
    .object({
      country_code: countryCodeField,
      start_year: startYearField,
      end_year: endYearField,
    })
    .strip()
    .describe('Query undernourishment prevalence and count for a country (SDG 2.1.1)'),

  'faostat.food_insecurity': z
    .object({
      country_code: countryCodeField,
      start_year: startYearField,
      end_year: endYearField,
    })
    .strip()
    .describe('Query food insecurity prevalence based on FIES scale for a country (SDG 2.1.2)'),

  'faostat.water_stress': z
    .object({
      country_code: countryCodeField,
      start_year: startYearField,
      end_year: endYearField,
    })
    .strip()
    .describe('Query freshwater withdrawal as % of available resources for a country (SDG 6.4.2)'),

  'faostat.forest_area': z
    .object({
      country_code: countryCodeField,
      start_year: startYearField,
      end_year: endYearField,
    })
    .strip()
    .describe('Query forest area as % of total land and in hectares for a country (SDG 15.1.1)'),

  'faostat.food_loss': z
    .object({
      year: z
        .number()
        .int()
        .min(2000)
        .max(2030)
        .optional()
        .describe(
          'Specific year to filter food loss data (e.g. 2022). Omit for full available range.',
        ),
      start_year: startYearField,
      end_year: endYearField,
    })
    .strip()
    .describe(
      'Query global/regional food loss index and percentage by food group (SDG 12.3.1). Returns data for 36 world regions.',
    ),
};
