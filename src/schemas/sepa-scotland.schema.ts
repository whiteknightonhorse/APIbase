import { z, type ZodSchema } from 'zod';

const stationsSearch = z
  .object({
    query: z
      .string()
      .optional()
      .describe(
        'Substring to match against rainfall gauge station names (e.g. "Glasgow"). Omit to list all ~280 stations.',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of stations to return (1-50, default 20)'),
  })
  .strip();

const stationCurrent = z
  .object({
    station_no: z
      .string()
      .min(1)
      .describe(
        'SEPA rainfall gauge station number (e.g. "15018"). Obtain from sepa-scotland.stations_search.',
      ),
  })
  .strip();

const rainfallHistory = z
  .object({
    station_no: z
      .string()
      .min(1)
      .describe(
        'SEPA rainfall gauge station number (e.g. "15018"). Obtain from sepa-scotland.stations_search.',
      ),
    period: z
      .enum(['hourly', 'daily', 'monthly'])
      .optional()
      .describe(
        'Aggregation period: "hourly" (last 7 days), "daily" (last month), or "monthly" (multi-year history). Default "daily".',
      ),
  })
  .strip();

export const sepaScotlandSchemas: Record<string, ZodSchema> = {
  'sepa-scotland.stations_search': stationsSearch,
  'sepa-scotland.station_current': stationCurrent,
  'sepa-scotland.rainfall_history': rainfallHistory,
};
