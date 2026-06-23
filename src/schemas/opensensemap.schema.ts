import { z } from 'zod';
import type { ZodSchema } from 'zod';

export const opensensemapSchemas: Record<string, ZodSchema> = {
  'opensensemap.box_search': z
    .object({
      latitude: z
        .number()
        .min(-90)
        .max(90)
        .optional()
        .describe(
          'Latitude of the search center point (WGS84, e.g. 52.52 for Berlin). Required when longitude is provided.',
        ),
      longitude: z
        .number()
        .min(-180)
        .max(180)
        .optional()
        .describe(
          'Longitude of the search center point (WGS84, e.g. 13.40 for Berlin). Required when latitude is provided.',
        ),
      max_distance: z
        .number()
        .int()
        .positive()
        .optional()
        .default(5000)
        .describe(
          'Maximum search radius in meters when using lat/lng search (default 5000, i.e. 5 km).',
        ),
      name: z
        .string()
        .optional()
        .describe(
          'Filter stations by name substring (case-insensitive). Example: "berlin" returns all stations with "berlin" in their name.',
        ),
      grouptag: z
        .string()
        .optional()
        .describe(
          'Filter stations by group tag. Tags are set by station owners to identify communities or projects (e.g. "luftdaten", "sensebox", "airrohr").',
        ),
      exposure: z
        .enum(['indoor', 'outdoor', 'mobile', 'unknown'])
        .optional()
        .describe(
          'Filter stations by sensor placement: "outdoor" for weather/air-quality monitors, "indoor" for home environment sensors, "mobile" for moving sensors.',
        ),
      phenomenon: z
        .string()
        .optional()
        .describe(
          'Filter stations that measure a specific phenomenon by sensor title (e.g. "Temperatur", "PM2.5", "rel. Luftfeuchte", "Luftdruck", "UV"). Case-insensitive.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(20)
        .describe('Maximum number of stations to return (1–100, default 20).'),
    })
    .strip()
    .describe('Search parameters for OpenSenseMap station lookup'),

  'opensensemap.box_detail': z
    .object({
      box_id: z
        .string()
        .describe(
          'OpenSenseMap station (box) ID — the 24-character MongoDB ObjectId from box_search results (e.g. "578207d56fea661300861f3b").',
        ),
    })
    .strip()
    .describe('Station ID to fetch details for'),

  'opensensemap.sensors_latest': z
    .object({
      box_id: z
        .string()
        .describe(
          'OpenSenseMap station (box) ID — the 24-character MongoDB ObjectId from box_search results. Returns the latest measurement value for every sensor on this station.',
        ),
    })
    .strip()
    .describe('Station ID to fetch latest sensor readings for'),

  'opensensemap.sensor_timeseries': z
    .object({
      box_id: z
        .string()
        .describe(
          'OpenSenseMap station (box) ID — the 24-character MongoDB ObjectId from box_search or box_detail results (e.g. "578207d56fea661300861f3b").',
        ),
      sensor_id: z
        .string()
        .describe(
          'Sensor ID within the station — the 24-character MongoDB ObjectId found in sensors_latest or box_detail sensor list (e.g. "578207d56fea661300861f3d").',
        ),
      from_date: z
        .string()
        .optional()
        .describe(
          'Start of time range in ISO 8601 format (e.g. "2024-01-01T00:00:00.000Z"). Defaults to 2 days ago.',
        ),
      to_date: z
        .string()
        .optional()
        .describe(
          'End of time range in ISO 8601 format (e.g. "2024-01-02T00:00:00.000Z"). Defaults to now.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(10000)
        .optional()
        .default(100)
        .describe('Maximum number of measurements to return, newest first (1–10000, default 100).'),
    })
    .strip()
    .describe('Sensor ID and time range for time-series data retrieval'),
};
