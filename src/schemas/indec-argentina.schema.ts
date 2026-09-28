import { z, type ZodSchema } from 'zod';

// ---------------------------------------------------------------------------
// indec-argentina.search_series — search the Argentine gov time series catalog
// ---------------------------------------------------------------------------

const indecArgentinaSearchSeries = z
  .object({
    query: z
      .string()
      .min(1)
      .describe(
        'Keyword to search the time series catalog (e.g. "desempleo", "inflacion", "tipo de cambio"). Spanish terms work best — this is an Argentine government dataset.',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of matching series to return (1-50, default 10).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// indec-argentina.get_series — fetch time series data points
// ---------------------------------------------------------------------------

const indecArgentinaGetSeries = z
  .object({
    series_id: z
      .string()
      .min(1)
      .describe(
        'Series ID(s) to fetch, comma-separated for up to 5 series (e.g. "168.1_T_CAMBIOR_D_0_0_26"). Find IDs via search_series.',
      ),
    start_date: z
      .string()
      .optional()
      .describe('Restrict results to dates on/after this ISO date (YYYY-MM-DD).'),
    end_date: z
      .string()
      .optional()
      .describe('Restrict results to dates on/before this ISO date (YYYY-MM-DD).'),
    collapse: z
      .enum(['day', 'month', 'quarter', 'semester', 'year'])
      .optional()
      .describe('Resample the series to this frequency (default: series native frequency).'),
    collapse_aggregation: z
      .enum(['avg', 'sum', 'end_of_period', 'min', 'max'])
      .optional()
      .describe(
        'Aggregation method used when "collapse" resamples to a lower frequency (default: avg).',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Maximum number of data points to return (1-1000, default 100).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// Export map
// ---------------------------------------------------------------------------

export const indecArgentinaSchemas: Record<string, ZodSchema> = {
  'indec-argentina.search_series': indecArgentinaSearchSeries,
  'indec-argentina.get_series': indecArgentinaGetSeries,
};
