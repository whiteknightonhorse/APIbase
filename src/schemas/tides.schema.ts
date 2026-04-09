import { z, type ZodSchema } from 'zod';

const predictions = z
  .object({
    station: z
      .string()
      .min(1)
      .describe(
        'NOAA station ID (e.g. "8518750" for The Battery NYC, "9414290" for San Francisco, "8443970" for Boston)',
      ),
    begin_date: z
      .string()
      .regex(/^\d{8}$/, 'Must be YYYYMMDD format')
      .describe('Start date in YYYYMMDD format (e.g. "20260409")'),
    end_date: z
      .string()
      .regex(/^\d{8}$/, 'Must be YYYYMMDD format')
      .describe('End date in YYYYMMDD format (e.g. "20260410"). Max range: 31 days.'),
    interval: z
      .enum(['hilo', 'h', '6'])
      .optional()
      .describe(
        'Prediction interval: "hilo" = high/low tides only (default), "h" = hourly, "6" = every 6 minutes',
      ),
    datum: z
      .string()
      .optional()
      .describe('Vertical datum: MLLW (default), MSL, NAVD, MHHW, MHW, MLW, etc.'),
    units: z
      .enum(['english', 'metric'])
      .optional()
      .describe('Units: "english" = feet (default), "metric" = meters'),
  })
  .strip();

const waterLevels = z
  .object({
    station: z
      .string()
      .min(1)
      .describe(
        'NOAA station ID (e.g. "8518750" for The Battery NYC, "9414290" for San Francisco)',
      ),
    date: z
      .string()
      .optional()
      .describe(
        'Date filter: "latest" (default, most recent reading), "today", "recent" (last 72 hours), or YYYYMMDD for specific date',
      ),
    datum: z
      .string()
      .optional()
      .describe('Vertical datum: MLLW (default), MSL, NAVD, MHHW, MHW, MLW, etc.'),
    units: z
      .enum(['english', 'metric'])
      .optional()
      .describe('Units: "english" = feet (default), "metric" = meters'),
  })
  .strip();

export const tidesSchemas: Record<string, ZodSchema> = {
  'tides.predictions': predictions,
  'tides.water_levels': waterLevels,
};
