import { z, type ZodSchema } from 'zod';

// ---------------------------------------------------------------------------
// bundesbank-timeseries.dataflows — list/search Bundesbank economic dataflows
// ---------------------------------------------------------------------------

const bundesbankDataflows = z
  .object({
    query: z
      .string()
      .optional()
      .describe(
        'Filter dataflows by name or id substring, case-insensitive (e.g. "exchange rate", "interest", "BBEX3"). Omit to list all ~94 available dataflows.',
      ),
  })
  .strip();

// ---------------------------------------------------------------------------
// bundesbank-timeseries.structure — dimensions + valid codes for a dataflow
// ---------------------------------------------------------------------------

const bundesbankStructure = z
  .object({
    dataflow_id: z
      .string()
      .min(1)
      .regex(/^[A-Za-z0-9_]+$/, 'dataflow_id must contain only letters, digits, and underscores')
      .describe(
        'Bundesbank dataflow id, from bundesbank-timeseries.dataflows (e.g. "BBEX3" for exchange rates, "BBIN1" for central bank rates). Returns the dimension list (e.g. FREQ, CURRENCY) in SDMX key position order, with each dimension\'s valid codes (capped to 200 per dimension, with a total_codes count) — needed to build the "key" for bundesbank-timeseries.data.',
      ),
  })
  .strip();

// ---------------------------------------------------------------------------
// bundesbank-timeseries.data — observation values for a dataflow
// ---------------------------------------------------------------------------

const bundesbankData = z
  .object({
    dataflow_id: z
      .string()
      .min(1)
      .regex(/^[A-Za-z0-9_]+$/, 'dataflow_id must contain only letters, digits, and underscores')
      .describe(
        'Bundesbank dataflow id, from bundesbank-timeseries.dataflows (e.g. "BBEX3" for exchange rates).',
      ),
    key: z
      .string()
      .min(1)
      .regex(
        /^[A-Za-z0-9_+.-]+$/,
        'key must be a dot-separated SDMX series key with no empty segments',
      )
      .describe(
        'REQUIRED fully dot-specified SDMX series key in dimension position order, from bundesbank-timeseries.structure (e.g. "D.USD.EUR.BB.AC.000" for the daily EUR/USD reference rate on the BBEX3 dataflow: FREQ=D, CURRENCY=USD, PARTNER_CURRENCY=EUR, SERIES_TYPE=BB, RATE_TYPE=AC, SUFFIX=000). Every position must be filled — an unscoped/wildcard key would match every series in the dataflow and is rejected.',
      ),
    start_period: z
      .string()
      .optional()
      .describe(
        'Start of period range, e.g. "2020" (annual) or "2020-01-01" (daily). Takes precedence over last_n_observations when set.',
      ),
    end_period: z
      .string()
      .optional()
      .describe(
        'End of period range, e.g. "2024" (annual) or "2024-12-31" (daily). Takes precedence over last_n_observations when set.',
      ),
    last_n_observations: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe(
        'Return only the most recent N observations (max 100, default 30). Ignored if start_period or end_period is set.',
      ),
  })
  .strip();

// ---------------------------------------------------------------------------
// Export map
// ---------------------------------------------------------------------------

export const bundesbankTimeseriesSchemas: Record<string, ZodSchema> = {
  'bundesbank-timeseries.dataflows': bundesbankDataflows,
  'bundesbank-timeseries.structure': bundesbankStructure,
  'bundesbank-timeseries.data': bundesbankData,
};
