import { z } from 'zod';

export const statcanSchemas: Record<string, z.ZodTypeAny> = {
  'statcan.catalogue_search': z
    .object({
      query: z
        .string()
        .optional()
        .describe(
          'Keyword to search in English table titles (e.g. "labour force", "inflation", "housing"). Case-insensitive.',
        ),
      subject_code: z
        .string()
        .optional()
        .describe(
          'Statistics Canada subject code to filter by (e.g. "14" for Labour, "16" for Prices, "36" for National Accounts). Two-digit string.',
        ),
      archived: z
        .union([z.boolean(), z.enum(['all', 'true', 'false'])])
        .optional()
        .describe(
          'Filter archived tables: false (default) = active only, true = archived only, "all" = both active and archived.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Maximum number of tables to return (1–100). Defaults to 20.'),
    })
    .strip(),

  'statcan.table_metadata': z
    .object({
      product_id: z
        .number()
        .int()
        .positive()
        .describe(
          'Statistics Canada table product ID (8-digit number, e.g. 35100003 for Youth Justice Survey). Visible in table URLs on www150.statcan.gc.ca.',
        ),
    })
    .strip(),

  'statcan.series_info': z
    .object({
      vector_id: z
        .number()
        .int()
        .positive()
        .describe(
          'Statistics Canada vector ID identifying a specific time series within a table (e.g. 32164132). Obtain from table_metadata dimensions or published dataset documentation.',
        ),
    })
    .strip(),

  'statcan.series_data': z
    .object({
      vector_id: z
        .number()
        .int()
        .positive()
        .describe(
          'Statistics Canada vector ID for the time series to retrieve data for (e.g. 32164132). Obtain from table_metadata or series_info.',
        ),
      latest_n: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe(
          'Number of most-recent data points to return (1–100). Defaults to 10. Annual tables: 10 = last 10 years; monthly: 10 = last 10 months.',
        ),
    })
    .strip(),

  'statcan.table_data': z
    .object({
      product_id: z
        .number()
        .int()
        .positive()
        .describe(
          'Statistics Canada table product ID (8-digit number, e.g. 35100003). Identifies the parent table from which the series is drawn.',
        ),
      coordinate: z
        .string()
        .describe(
          'Dot-separated dimension coordinate identifying one series within the table (e.g. "1.12.0.0.0.0.0.0.0.0"). Obtain from table_metadata dimensions or series_info.',
        ),
      latest_n: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Number of most-recent data points to return (1–100). Defaults to 10.'),
    })
    .strip(),
};
