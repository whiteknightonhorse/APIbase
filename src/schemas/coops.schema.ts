import { z } from 'zod';

export const coopsSchemas: Record<string, z.ZodTypeAny> = {
  'coops.predictions': z
    .object({
      station_id: z
        .string()
        .describe(
          'NOAA CO-OPS station ID (4–7 digits, e.g. 8443970 for Boston MA). Find station IDs with the coops.tides.stations tool.',
        ),
      begin_date: z
        .string()
        .optional()
        .describe(
          'Start date for tide predictions in YYYY-MM-DD or YYYYMMDD format (e.g. 2025-07-04). Defaults to today. Maximum range: 366 days.',
        ),
      end_date: z
        .string()
        .optional()
        .describe(
          'End date for tide predictions in YYYY-MM-DD or YYYYMMDD format (e.g. 2025-07-11). Defaults to 7 days from today. Maximum range: 366 days.',
        ),
      datum: z
        .enum(['MLLW', 'MLW', 'MSL', 'MHW', 'MHHW', 'NAVD', 'STND'])
        .optional()
        .describe(
          'Vertical datum for water height measurements. MLLW (Mean Lower Low Water) is the chart datum used for nautical charts. MSL = Mean Sea Level. Defaults to MLLW.',
        ),
      units: z
        .enum(['english', 'metric'])
        .optional()
        .describe(
          'Unit system for water heights. english = feet, metric = meters. Defaults to english.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe(
          'Maximum number of tide predictions to return (1–500). Defaults to 100. A 7-day window typically has 28 high/low tides.',
        ),
    })
    .strip(),

  'coops.water_level': z
    .object({
      station_id: z
        .string()
        .describe(
          'NOAA CO-OPS station ID (4–7 digits, e.g. 8443970 for Boston MA). Find station IDs with the coops.tides.stations tool.',
        ),
      begin_date: z
        .string()
        .optional()
        .describe(
          'Start date for water level observations in YYYY-MM-DD or YYYYMMDD format (e.g. 2025-07-01). Defaults to yesterday. Maximum range: 31 days.',
        ),
      end_date: z
        .string()
        .optional()
        .describe(
          'End date for water level observations in YYYY-MM-DD or YYYYMMDD format (e.g. 2025-07-02). Defaults to today. Maximum range: 31 days.',
        ),
      datum: z
        .enum(['MLLW', 'MLW', 'MSL', 'MHW', 'MHHW', 'NAVD', 'STND'])
        .optional()
        .describe(
          'Vertical datum for water height measurements. MLLW is the standard chart datum. Defaults to MLLW.',
        ),
      units: z
        .enum(['english', 'metric'])
        .optional()
        .describe('Unit system: english = feet, metric = meters. Defaults to english.'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe(
          'Maximum number of 6-minute interval readings to return (1–500). Defaults to 120. One day has 240 readings.',
        ),
    })
    .strip(),

  'coops.stations': z
    .object({
      state: z
        .string()
        .length(2)
        .optional()
        .describe(
          'Filter stations by US state abbreviation (e.g. CA, NY, FL, TX). Must be exactly 2 uppercase letters. Omit for all states.',
        ),
      tidal_only: z
        .boolean()
        .optional()
        .describe(
          'When true (default), return only tidal stations. Set to false to include Great Lakes and non-tidal stations.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe('Maximum number of stations to return (1–200). Defaults to 50.'),
    })
    .strip(),

  'coops.conditions': z
    .object({
      station_id: z
        .string()
        .describe(
          'NOAA CO-OPS station ID (4–7 digits, e.g. 8443970 for Boston MA). Find station IDs with the coops.tides.stations tool.',
        ),
      product: z
        .enum(['air_temperature', 'water_temperature', 'air_pressure', 'humidity', 'wind'])
        .optional()
        .describe(
          'Meteorological product to retrieve. air_temperature = air temp in °F (or °C), water_temperature = sea surface temp, air_pressure = barometric pressure in mb, humidity = relative humidity %, wind = wind speed/direction. Not all stations have all sensors. Defaults to air_temperature.',
        ),
      begin_date: z
        .string()
        .optional()
        .describe(
          'Start date for observations in YYYY-MM-DD or YYYYMMDD format (e.g. 2025-07-01). Defaults to yesterday. Maximum range: 31 days.',
        ),
      end_date: z
        .string()
        .optional()
        .describe(
          'End date for observations in YYYY-MM-DD or YYYYMMDD format (e.g. 2025-07-02). Defaults to today. Maximum range: 31 days.',
        ),
      units: z
        .enum(['english', 'metric'])
        .optional()
        .describe(
          'Unit system: english = °F / knots / feet, metric = °C / m/s / meters. Defaults to english.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe(
          'Maximum number of recent readings to return (1–500). Readings are at 6-minute intervals. Defaults to 60 (last 6 hours).',
        ),
    })
    .strip(),
};
