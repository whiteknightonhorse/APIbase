import { z } from 'zod';

export const brightskySchemas: Record<string, z.ZodTypeAny> = {
  'brightsky.current': z
    .object({
      latitude: z
        .number()
        .min(47)
        .max(56)
        .describe('Latitude of the location in Germany (e.g. 52.52 for Berlin, range 47–56)'),
      longitude: z
        .number()
        .min(5)
        .max(16)
        .describe('Longitude of the location in Germany (e.g. 13.40 for Berlin, range 5–16)'),
      units: z
        .enum(['dwd', 'si'])
        .optional()
        .describe(
          'Unit system: "dwd" (default) uses km/h wind and °C temperature; "si" uses m/s wind',
        ),
    })
    .strip(),

  'brightsky.observations': z
    .object({
      latitude: z
        .number()
        .min(47)
        .max(56)
        .describe('Latitude of the location in Germany (e.g. 52.52 for Berlin, range 47–56)'),
      longitude: z
        .number()
        .min(5)
        .max(16)
        .describe('Longitude of the location in Germany (e.g. 13.40 for Berlin, range 5–16)'),
      date: z
        .string()
        .describe(
          'Start date/time for observations in ISO 8601 format (e.g. "2026-07-01" or "2026-07-01T08:00:00"). ' +
            'Returns historical data when date is in the past; returns DWD forecast when date is in the future.',
        ),
      last_date: z
        .string()
        .optional()
        .describe(
          'End date/time for observations in ISO 8601 format. ' +
            'When omitted, returns data for the 24-hour period starting at "date". ' +
            'Maximum range is 10 days.',
        ),
      units: z
        .enum(['dwd', 'si'])
        .optional()
        .describe(
          'Unit system: "dwd" (default) uses km/h wind and °C temperature; "si" uses m/s wind',
        ),
    })
    .strip(),

  'brightsky.alerts': z
    .object({
      latitude: z
        .number()
        .min(47)
        .max(56)
        .describe('Latitude of the location in Germany (e.g. 52.52 for Berlin, range 47–56)'),
      longitude: z
        .number()
        .min(5)
        .max(16)
        .describe('Longitude of the location in Germany (e.g. 13.40 for Berlin, range 5–16)'),
    })
    .strip(),

  'brightsky.stations': z
    .object({
      latitude: z
        .number()
        .min(47)
        .max(56)
        .describe('Latitude of the location in Germany (e.g. 52.52 for Berlin, range 47–56)'),
      longitude: z
        .number()
        .min(5)
        .max(16)
        .describe('Longitude of the location in Germany (e.g. 13.40 for Berlin, range 5–16)'),
      max_dist: z
        .number()
        .positive()
        .optional()
        .describe(
          'Maximum distance in metres from the given coordinates to include stations. ' +
            'When omitted, all DWD stations are returned sorted by proximity.',
        ),
    })
    .strip(),
};
