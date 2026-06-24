import { z } from 'zod';

export const metNorwaySchemas: Record<string, z.ZodTypeAny> = {
  'metno.forecast': z
    .object({
      lat: z
        .number()
        .min(-90)
        .max(90)
        .describe('Latitude in decimal degrees (e.g. 59.91 for Oslo, -33.87 for Sydney)'),
      lon: z
        .number()
        .min(-180)
        .max(180)
        .describe('Longitude in decimal degrees (e.g. 10.75 for Oslo, 151.21 for Sydney)'),
      altitude: z
        .number()
        .int()
        .min(0)
        .max(9000)
        .optional()
        .describe('Station altitude in metres above sea level. Improves pressure correction.'),
      hours: z
        .number()
        .int()
        .min(1)
        .max(216)
        .optional()
        .describe(
          'Number of hourly forecast entries to return (1–216, default 48). Full 9-day range = 216.',
        ),
    })
    .strip(),

  'metno.nowcast': z
    .object({
      lat: z
        .number()
        .min(53)
        .max(90)
        .describe(
          'Latitude in decimal degrees. Coverage: Norway and Scandinavia (approx 53–90°N).',
        ),
      lon: z
        .number()
        .min(-20)
        .max(40)
        .describe(
          'Longitude in decimal degrees. Coverage: Norway and Scandinavia (approx −20–40°E).',
        ),
    })
    .strip(),

  'metno.alerts': z
    .object({
      lang: z
        .enum(['en', 'no'])
        .optional()
        .describe('Language for alert text. "en" = English (default), "no" = Norwegian.'),
      event_type: z
        .string()
        .optional()
        .describe(
          'Filter by event type slug (e.g. "wind", "rain", "snow", "ice", "fog", "avalanche"). Leave empty for all active alerts.',
        ),
      county: z
        .string()
        .optional()
        .describe(
          'Filter alerts by Norwegian county name substring (e.g. "Oslo", "Viken", "Troms"). Case-insensitive partial match.',
        ),
    })
    .strip(),

  'metno.sunrise': z
    .object({
      lat: z
        .number()
        .min(-90)
        .max(90)
        .describe('Latitude in decimal degrees (e.g. 59.91 for Oslo, 51.5 for London)'),
      lon: z
        .number()
        .min(-180)
        .max(180)
        .describe('Longitude in decimal degrees (e.g. 10.75 for Oslo, -0.12 for London)'),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe('Date to compute times for in ISO 8601 format YYYY-MM-DD (e.g. "2026-06-24")'),
      body: z
        .enum(['sun', 'moon'])
        .optional()
        .describe(
          'Celestial body: "sun" returns sunrise/sunset/solarnoon (default), "moon" returns moonrise/moonset/phase.',
        ),
      offset: z
        .string()
        .optional()
        .describe(
          'UTC offset for local time output in ±HH:MM format (e.g. "+02:00" for CEST). Defaults to UTC.',
        ),
    })
    .strip(),
};
