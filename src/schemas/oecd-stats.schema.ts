import { z } from 'zod';
import type { ZodSchema } from 'zod';

const COUNTRY = z
  .string()
  .length(3)
  .describe(
    'ISO 3-letter OECD country code (e.g. USA, GBR, DEU, FRA, JPN, CAN, AUS, KOR, ITA, ESP). ' +
      'See OECD reference area codes for the full list of 38 member countries.',
  );

const START_PERIOD = z
  .string()
  .optional()
  .describe(
    'Start of the requested time range. Annual data: "YYYY" (e.g. "2018"). ' +
      'Monthly data: "YYYY-MM" (e.g. "2023-01"). Defaults to 5 years ago if omitted.',
  );

const END_PERIOD = z
  .string()
  .optional()
  .describe(
    'End of the requested time range. Annual data: "YYYY" (e.g. "2024"). ' +
      'Monthly data: "YYYY-MM" (e.g. "2024-06"). Defaults to latest available if omitted.',
  );

const MAX_SERIES = z
  .number()
  .int()
  .min(1)
  .max(100)
  .optional()
  .describe(
    'Maximum number of time series to return (1–100, default 20). Each series is a unique combination of dimensions such as sector, measure, or adjustment type.',
  );

export const oecdStatsSchemas: Record<string, ZodSchema> = {
  'oecd.economy.gdp': z
    .object({
      country: COUNTRY,
      start_period: START_PERIOD.describe(
        'Start year for annual GDP data (e.g. "2018"). Defaults to 5 years prior.',
      ),
      end_period: END_PERIOD.describe(
        'End year for annual GDP data (e.g. "2024"). Defaults to latest available.',
      ),
      max_series: MAX_SERIES,
    })
    .strip(),

  'oecd.economy.unemployment': z
    .object({
      country: COUNTRY,
      start_period: START_PERIOD.describe(
        'Start month for unemployment data in YYYY-MM format (e.g. "2023-01"). Defaults to 12 months ago.',
      ),
      end_period: END_PERIOD.describe(
        'End month for unemployment data in YYYY-MM format (e.g. "2024-06"). Defaults to latest available.',
      ),
      max_series: MAX_SERIES,
    })
    .strip(),

  'oecd.economy.inflation': z
    .object({
      country: COUNTRY,
      start_period: START_PERIOD.describe(
        'Start month for CPI data in YYYY-MM format (e.g. "2023-01"). Defaults to 12 months ago.',
      ),
      end_period: END_PERIOD.describe(
        'End month for CPI data in YYYY-MM format (e.g. "2024-06"). Defaults to latest available.',
      ),
      max_series: MAX_SERIES,
    })
    .strip(),

  'oecd.environment.emissions': z
    .object({
      country: COUNTRY,
      start_period: START_PERIOD.describe(
        'Start year for GHG emissions data (e.g. "2015"). Defaults to 10 years prior.',
      ),
      end_period: END_PERIOD.describe(
        'End year for GHG emissions data (e.g. "2022"). Defaults to latest available.',
      ),
      max_series: MAX_SERIES,
    })
    .strip(),

  'oecd.economy.trade': z
    .object({
      country: COUNTRY,
      start_period: START_PERIOD.describe(
        'Start period for Balance of Payments data (e.g. "2018" for annual, "2023-Q1" for quarterly). Defaults to 5 years prior.',
      ),
      end_period: END_PERIOD.describe(
        'End period for Balance of Payments data (e.g. "2023"). Defaults to latest available.',
      ),
      max_series: MAX_SERIES,
    })
    .strip(),
};
