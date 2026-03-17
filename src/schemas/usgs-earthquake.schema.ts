import { z, type ZodSchema } from 'zod';

const search = z
  .object({
    starttime: z
      .string()
      .optional()
      .describe('Start date in ISO 8601 format, e.g. "2026-01-01" or "2026-01-01T00:00:00"'),
    endtime: z
      .string()
      .optional()
      .describe('End date in ISO 8601 format (default: now)'),
    minmagnitude: z
      .number()
      .optional()
      .describe('Minimum magnitude on Richter scale (e.g. 4.5 for significant earthquakes)'),
    maxmagnitude: z
      .number()
      .optional()
      .describe('Maximum magnitude on Richter scale'),
    latitude: z
      .number()
      .min(-90)
      .max(90)
      .optional()
      .describe('Center latitude for radius search (-90 to 90)'),
    longitude: z
      .number()
      .min(-180)
      .max(180)
      .optional()
      .describe('Center longitude for radius search (-180 to 180)'),
    maxradiuskm: z
      .number()
      .min(0)
      .max(20001.6)
      .optional()
      .describe('Search radius in kilometers from lat/lon center point (max ~20,000 km)'),
    mindepth: z
      .number()
      .optional()
      .describe('Minimum depth in kilometers (negative = above sea level)'),
    maxdepth: z
      .number()
      .optional()
      .describe('Maximum depth in kilometers (max 1000)'),
    orderby: z
      .enum(['time', 'time-asc', 'magnitude', 'magnitude-asc'])
      .optional()
      .describe('Sort order: "time" (newest first, default), "time-asc", "magnitude" (largest first), "magnitude-asc"'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe('Maximum number of results (default 20, max 200)'),
    alertlevel: z
      .enum(['green', 'yellow', 'orange', 'red'])
      .optional()
      .describe('PAGER alert level filter: green (no damage), yellow, orange, red (significant damage/casualties)'),
  })
  .strip();

const feed = z
  .object({
    magnitude: z
      .enum(['significant', '4.5', '2.5', '1.0', 'all'])
      .optional()
      .describe('Magnitude threshold: "significant", "4.5", "2.5", "1.0", or "all" (default: "4.5")'),
    timeframe: z
      .enum(['hour', 'day', 'week', 'month'])
      .optional()
      .describe('Time window: "hour", "day" (default), "week", or "month"'),
  })
  .strip();

const count = z
  .object({
    starttime: z
      .string()
      .optional()
      .describe('Start date in ISO 8601 format, e.g. "2026-01-01"'),
    endtime: z
      .string()
      .optional()
      .describe('End date in ISO 8601 format (default: now)'),
    minmagnitude: z
      .number()
      .optional()
      .describe('Minimum magnitude on Richter scale'),
    maxmagnitude: z
      .number()
      .optional()
      .describe('Maximum magnitude on Richter scale'),
    latitude: z
      .number()
      .min(-90)
      .max(90)
      .optional()
      .describe('Center latitude for radius search'),
    longitude: z
      .number()
      .min(-180)
      .max(180)
      .optional()
      .describe('Center longitude for radius search'),
    maxradiuskm: z
      .number()
      .min(0)
      .max(20001.6)
      .optional()
      .describe('Search radius in kilometers from lat/lon center'),
  })
  .strip();

export const usgsEarthquakeSchemas: Record<string, ZodSchema> = {
  'earthquake.search': search,
  'earthquake.feed': feed,
  'earthquake.count': count,
};
