import { z, type ZodSchema } from 'zod';

const fxRates = z
  .object({
    currencies: z
      .array(z.string().length(3))
      .optional()
      .describe(
        'ISO 4217 currency codes to fetch CAD rates for (e.g. ["USD","EUR","GBP","JPY"]). ' +
          'Omit to get all 10 default major currencies: USD, EUR, GBP, JPY, AUD, CHF, MXN, SEK, NOK, HKD.',
      ),
    recent: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe(
        'Number of most-recent observations to return (default 1 = latest rate only). ' +
          'Ignored when start_date or end_date is provided.',
      ),
    start_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe(
        'Start date for historical range in YYYY-MM-DD format (e.g. "2026-01-01"). ' +
          'Use with end_date to get a specific date range.',
      ),
    end_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe(
        'End date for historical range in YYYY-MM-DD format (e.g. "2026-06-22"). ' +
          'Use with start_date to get a specific date range.',
      ),
  })
  .strip();

const policyRate = z
  .object({
    recent: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe(
        'Number of most-recent observations to return (default 10). ' +
          'Rate changes occur on scheduled BoC announcement dates (roughly 8 times per year). ' +
          'Ignored when start_date or end_date is provided.',
      ),
    start_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe(
        'Start date for historical range in YYYY-MM-DD format (e.g. "2020-01-01"). ' +
          'Overnight rate history goes back to 1994.',
      ),
    end_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe(
        'End date for historical range in YYYY-MM-DD format (e.g. "2026-06-22"). ' +
          'Defaults to the most recent available date.',
      ),
  })
  .strip();

const inflation = z
  .object({
    recent: z
      .number()
      .int()
      .min(1)
      .max(120)
      .optional()
      .describe(
        'Number of most-recent monthly observations to return (default 12 = one year). ' +
          'CPI data is published monthly by Statistics Canada. ' +
          'Ignored when start_date or end_date is provided.',
      ),
    start_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe(
        'Start date for historical range in YYYY-MM-DD format (e.g. "2020-01-01"). ' +
          'Monthly data — use the first of the month.',
      ),
    end_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe(
        'End date for historical range in YYYY-MM-DD format (e.g. "2026-05-01"). ' +
          'Defaults to the most recent available month.',
      ),
  })
  .strip();

const series = z
  .object({
    series_codes: z
      .string()
      .describe(
        'One or more Bank of Canada Valet series codes, comma-separated (e.g. "FXCADUSD", ' +
          '"V39079,V80691311", "STATIC_TOTALCPICHANGE"). ' +
          'Browse available series at https://www.bankofcanada.ca/valet/lists/series/json. ' +
          'Key codes: FXCADUSD (CAD/USD rate), V39079 (overnight target rate), ' +
          'V80691311 (prime rate), STATIC_TOTALCPICHANGE (total CPI % change YoY), ' +
          'CPIW (CPIW % change YoY), CPI_MEDIAN (CPI-median), A.BCPI (annual commodity price index).',
      ),
    recent: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe(
        'Number of most-recent observations to return (default 10). ' +
          'Ignored when start_date or end_date is provided.',
      ),
    start_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe('Start date for historical range in YYYY-MM-DD format (e.g. "2020-01-01").'),
    end_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe('End date for historical range in YYYY-MM-DD format (e.g. "2026-06-22").'),
  })
  .strip();

export const bankofcanadaSchemas: Record<string, ZodSchema> = {
  'bankofcanada.fx_rates': fxRates,
  'bankofcanada.policy_rate': policyRate,
  'bankofcanada.inflation': inflation,
  'bankofcanada.series': series,
};
