import { z, type ZodSchema } from 'zod';

// ---------------------------------------------------------------------------
// ine.operations — search/list INE statistical operations
// ---------------------------------------------------------------------------

const ineOperations = z
  .object({
    query: z
      .string()
      .optional()
      .describe(
        'Filter operations by name or short code substring, case-insensitive (e.g. "IPC", "empleo", "población"). Omit to list all ~110 available operations.',
      ),
  })
  .strip();

// ---------------------------------------------------------------------------
// ine.tables — list published tables for an operation
// ---------------------------------------------------------------------------

const ineTables = z
  .object({
    operation_code: z
      .string()
      .min(1)
      .describe(
        'Short code of the statistical operation, from ine.operations (e.g. "IPC" for Consumer Price Index, "EPA" for Labour Force Survey).',
      ),
  })
  .strip();

// ---------------------------------------------------------------------------
// ine.series_metadata — get metadata for one time series
// ---------------------------------------------------------------------------

const ineSeriesMetadata = z
  .object({
    series_code: z
      .string()
      .min(1)
      .describe('INE series code (e.g. "IPC206449" for the national CPI monthly change series).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// ine.series_data — get observation values for one time series
// ---------------------------------------------------------------------------

const ineSeriesData = z
  .object({
    series_code: z
      .string()
      .min(1)
      .describe('INE series code (e.g. "IPC206449" for the national CPI monthly change series).'),
    last_n: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe(
        'Return only the most recent N observations (max 100, default 10). Ignored if start_date or end_date is set.',
      ),
    start_date: z
      .string()
      .regex(/^\d{8}$/)
      .optional()
      .describe(
        'Start of date range, format YYYYMMDD (e.g. "20200101"). Takes precedence over last_n.',
      ),
    end_date: z
      .string()
      .regex(/^\d{8}$/)
      .optional()
      .describe(
        'End of date range, format YYYYMMDD (e.g. "20231231"). Takes precedence over last_n.',
      ),
  })
  .strip();

// ---------------------------------------------------------------------------
// Export map
// ---------------------------------------------------------------------------

export const ineSchemas: Record<string, ZodSchema> = {
  'ine.operations': ineOperations,
  'ine.tables': ineTables,
  'ine.series_metadata': ineSeriesMetadata,
  'ine.series_data': ineSeriesData,
};
