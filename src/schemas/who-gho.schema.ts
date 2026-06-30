import { z } from 'zod';

export const whoGhoSchemas: Record<string, z.ZodSchema> = {
  'who.indicator_search': z
    .object({
      keyword: z
        .string()
        .optional()
        .describe(
          'Keyword to search indicator names (e.g. "immunization", "mortality", "tuberculosis"). Omit to list all indicators.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Maximum number of indicators to return (1–100, default 20).'),
    })
    .strip()
    .describe('Search WHO Global Health Observatory indicators by keyword.'),

  'who.indicator_data': z
    .object({
      indicator_code: z
        .string()
        .describe(
          'WHO GHO indicator code (e.g. "WHOSIS_000001" for life expectancy, "dptv" for DTP3 immunization, "MORT_100" for mortality). Use who.indicator_search to find codes.',
        ),
      country_code: z
        .string()
        .length(3)
        .optional()
        .describe('ISO 3166-1 alpha-3 country code to filter results (e.g. "USA", "FRA", "IND").'),
      year_from: z
        .number()
        .int()
        .min(1900)
        .max(2100)
        .optional()
        .describe('Start year for time series data (inclusive, e.g. 2015).'),
      year_to: z
        .number()
        .int()
        .min(1900)
        .max(2100)
        .optional()
        .describe('End year for time series data (inclusive, e.g. 2023).'),
      sex: z
        .enum(['SEX_BTSX', 'SEX_MLE', 'SEX_FMLE'])
        .optional()
        .describe(
          'Sex dimension filter: SEX_BTSX (both sexes), SEX_MLE (male), SEX_FMLE (female).',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Maximum number of data points to return (1–100, default 20).'),
    })
    .strip()
    .describe('Get data values for a specific WHO health indicator with optional filters.'),

  'who.country_health': z
    .object({
      country_code: z
        .string()
        .length(3)
        .describe(
          'ISO 3166-1 alpha-3 country code (e.g. "USA", "BRA", "KEN", "IND"). Use who.dimension_values with dimension="COUNTRY" to list all valid codes.',
        ),
      indicator_code: z
        .string()
        .optional()
        .describe(
          'WHO GHO indicator code to retrieve (default: WHOSIS_000001 for life expectancy). Use who.indicator_search to find codes.',
        ),
      year: z
        .number()
        .int()
        .min(1900)
        .max(2100)
        .optional()
        .describe(
          'Specific year to retrieve data for (e.g. 2022). Omit to get all available years.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Maximum number of records to return (1–100, default 20).'),
    })
    .strip()
    .describe('Get WHO health indicator data for a specific country.'),

  'who.dimension_values': z
    .object({
      dimension: z
        .string()
        .describe(
          'Dimension code to list values for (e.g. "COUNTRY" for country codes, "REGION" for WHO regions, "SEX" for sex categories, "AGEGROUP" for age groups).',
        ),
      search: z
        .string()
        .optional()
        .describe(
          'Filter dimension values by partial title match (e.g. "africa" to filter African countries).',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Maximum number of values to return (1–100, default 20).'),
    })
    .strip()
    .describe(
      'List valid values for a WHO GHO dimension such as countries, regions, or age groups.',
    ),
};
