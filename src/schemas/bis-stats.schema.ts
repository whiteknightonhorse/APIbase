import { z } from 'zod';
import type { ZodSchema } from 'zod';

const COUNTRY = z
  .string()
  .length(2)
  .describe(
    'ISO 2-letter BIS reference-area code (e.g. US, XM for euro area, JP, GB, CN, DE, FR, BR, IN, CA, AU, CH). ' +
      'See the BIS reference area codelist for the full list of covered economies.',
  );

const START_PERIOD = z
  .string()
  .optional()
  .describe(
    'Start of the requested time range, e.g. "2020-01" for monthly data or "2020-Q1" for quarterly data. ' +
      'Defaults to the last 24 observations if both start_period and end_period are omitted.',
  );

const END_PERIOD = z
  .string()
  .optional()
  .describe(
    'End of the requested time range, e.g. "2024-06" for monthly data or "2024-Q2" for quarterly data. ' +
      'Defaults to the latest available observation if omitted.',
  );

const MAX_SERIES = z
  .number()
  .int()
  .min(1)
  .max(100)
  .optional()
  .describe(
    'Maximum number of time series to return (1–100, default 20). Each series is a unique combination of dimensions such as rate type or unit of measure.',
  );

export const bisStatsSchemas: Record<string, ZodSchema> = {
  'bis-stats.policy_rates': z
    .object({
      country: COUNTRY,
      start_period: START_PERIOD,
      end_period: END_PERIOD,
      max_series: MAX_SERIES,
    })
    .strip(),

  'bis-stats.exchange_rates': z
    .object({
      country: COUNTRY,
      eer_type: z
        .enum(['N', 'R'])
        .optional()
        .describe('Exchange rate type: "N" = nominal (default), "R" = real (inflation-adjusted).'),
      basket: z
        .enum(['N', 'B'])
        .optional()
        .describe(
          'Currency basket: "N" = narrow (27 economies, default), "B" = broad (64 economies).',
        ),
      start_period: START_PERIOD,
      end_period: END_PERIOD,
      max_series: MAX_SERIES,
    })
    .strip(),

  'bis-stats.property_prices': z
    .object({
      country: COUNTRY,
      value_type: z
        .enum(['N', 'R'])
        .optional()
        .describe('Price value type: "N" = nominal (default), "R" = real (inflation-adjusted).'),
      start_period: START_PERIOD,
      end_period: END_PERIOD,
      max_series: MAX_SERIES,
    })
    .strip(),
};
