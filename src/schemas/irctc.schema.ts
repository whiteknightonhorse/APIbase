import { z } from 'zod';
import type { ZodSchema } from 'zod';

/**
 * IRCTC Indian Railways schemas (UC-426).
 * Three tools: train_search, train_status, station_search.
 */
export const irctcSchemas: Record<string, ZodSchema> = {
  'irctc.train_search': z
    .object({
      from_station_code: z
        .string()
        .describe(
          'Origin station code (3-5 uppercase letters). Examples: NDLS (New Delhi), CSMT (Mumbai CST), HWH (Howrah Kolkata), MAS (Chennai Central), SBC (Bengaluru).',
        ),
      to_station_code: z
        .string()
        .describe(
          'Destination station code (3-5 uppercase letters, same format as from_station_code). Use irctc.station_search to discover codes by name.',
        ),
      date_of_journey: z
        .string()
        .describe(
          'Journey date in YYYY-MM-DD format. Must be within the next 120 days from today. Example: 2026-05-15.',
        ),
    })
    .strip(),

  'irctc.train_status': z
    .object({
      train_number: z
        .string()
        .describe(
          "5-digit Indian Railways train number. Examples: '12951' (Mumbai Rajdhani Express), '12303' (Poorva Express), '22691' (Rajdhani Express Bangalore).",
        ),
      start_day: z
        .number()
        .int()
        .min(0)
        .max(4)
        .optional()
        .default(0)
        .describe(
          'Day offset for the train journey start relative to today (0=today, 1=yesterday, 2=two days ago, up to 4). Use non-zero for multi-day trains that departed before today.',
        ),
    })
    .strip(),

  'irctc.station_search': z
    .object({
      query: z
        .string()
        .describe(
          'Station name fragment or partial station code to search for. Case-insensitive. Examples: "Mumbai" returns CSMT/BCT/LTT/etc., "delhi" returns NDLS/DLI/NZM, "HWH" returns Howrah. Returns up to 20 matches.',
        ),
    })
    .strip(),
};
