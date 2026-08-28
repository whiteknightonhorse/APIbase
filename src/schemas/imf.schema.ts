import { z, type ZodSchema } from 'zod';

// ---------------------------------------------------------------------------
// IMF DataMapper API schemas (UC-434)
// ---------------------------------------------------------------------------

const imfIndicatorParams = z
  .object({
    country: z
      .string()
      .length(3)
      .optional()
      .describe(
        'ISO 3166-1 alpha-3 country code to filter (e.g. "USA", "DEU", "JPN", "CHN"). Omit to ' +
          'return all 190+ countries plus IMF regional/income-group aggregates.',
      ),
    countries: z
      .array(z.string().length(3))
      .max(20)
      .optional()
      .describe(
        'List of ISO 3166-1 alpha-3 country codes to filter (e.g. ["USA","DEU","JPN"]), max 20. ' +
          'Use instead of "country" to fetch multiple countries in one call.',
      ),
    start_year: z
      .number()
      .int()
      .min(1980)
      .max(2035)
      .optional()
      .describe(
        'Earliest year to include in the returned time series (e.g. 2015). Omit for full history.',
      ),
    end_year: z
      .number()
      .int()
      .min(1980)
      .max(2035)
      .optional()
      .describe(
        'Latest year to include, including IMF WEO forward projections (e.g. 2029). Omit for full history.',
      ),
  })
  .strip();

export const imfSchemas: Record<string, ZodSchema> = {
  'imf.gdp_growth': imfIndicatorParams,
  'imf.inflation': imfIndicatorParams,
  'imf.fiscal_balance': imfIndicatorParams,
  'imf.current_account': imfIndicatorParams,
};
