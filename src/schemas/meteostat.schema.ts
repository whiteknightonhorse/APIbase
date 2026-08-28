import { z, type ZodSchema } from 'zod';

const stationsNearby = z
  .object({
    lat: z
      .number()
      .min(-90)
      .max(90)
      .describe('Latitude of the search point (WGS84 decimal degrees).'),
    lon: z
      .number()
      .min(-180)
      .max(180)
      .describe('Longitude of the search point (WGS84 decimal degrees).'),
    radius_km: z
      .number()
      .min(1)
      .max(500)
      .optional()
      .describe('Search radius in kilometers (default 100, max 500).'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of stations to return, nearest first (default 10, max 50).'),
  })
  .strip();

const stationInfo = z
  .object({
    station_id: z
      .string()
      .min(1)
      .max(20)
      .describe(
        'Meteostat weather station ID (e.g. "10637" for Frankfurt Airport), obtained from ' +
          'meteostat.stations_nearby.',
      ),
  })
  .strip();

const dailyData = z
  .object({
    station_id: z
      .string()
      .min(1)
      .max(20)
      .describe('Meteostat weather station ID, obtained from meteostat.stations_nearby.'),
    year: z
      .number()
      .int()
      .min(1900)
      .describe('Calendar year to fetch daily observations for (e.g. 2024).'),
  })
  .strip();

const monthlyData = z
  .object({
    station_id: z
      .string()
      .min(1)
      .max(20)
      .describe(
        'Meteostat weather station ID, obtained from meteostat.stations_nearby. Returns the ' +
          'full monthly history available for the station (may span decades).',
      ),
  })
  .strip();

const hourlyData = z
  .object({
    station_id: z
      .string()
      .min(1)
      .max(20)
      .describe('Meteostat weather station ID, obtained from meteostat.stations_nearby.'),
    start_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe('Start of the date range in YYYY-MM-DD format (inclusive).'),
    end_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe(
        'End of the date range in YYYY-MM-DD format (inclusive). Must be within 7 days of ' +
          'start_date and in the same calendar year — use meteostat.daily_data for longer spans.',
      ),
  })
  .strip();

export const meteostatSchemas: Record<string, ZodSchema> = {
  'meteostat.stations_nearby': stationsNearby,
  'meteostat.station_info': stationInfo,
  'meteostat.daily_data': dailyData,
  'meteostat.monthly_data': monthlyData,
  'meteostat.hourly_data': hourlyData,
};
