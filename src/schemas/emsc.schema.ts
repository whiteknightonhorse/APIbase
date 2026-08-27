import { z, type ZodSchema } from 'zod';

// ---------------------------------------------------------------------------
// emsc.search_earthquakes — search EMSC-RTS real-time seismicity catalog
// ---------------------------------------------------------------------------

const emscSearchEarthquakes = z
  .object({
    starttime: z
      .string()
      .optional()
      .describe(
        'Start of the time window, ISO 8601 date or datetime (e.g. 2026-08-01 or 2026-08-01T00:00:00). Omit for no lower bound.',
      ),
    endtime: z
      .string()
      .optional()
      .describe(
        'End of the time window, ISO 8601 date or datetime (e.g. 2026-08-27T23:59:59). Omit for no upper bound.',
      ),
    minlatitude: z
      .number()
      .min(-90)
      .max(90)
      .optional()
      .describe('Minimum latitude in decimal degrees for a bounding-box search (e.g. 34.0).'),
    maxlatitude: z
      .number()
      .min(-90)
      .max(90)
      .optional()
      .describe('Maximum latitude in decimal degrees for a bounding-box search (e.g. 45.0).'),
    minlongitude: z
      .number()
      .min(-180)
      .max(180)
      .optional()
      .describe('Minimum longitude in decimal degrees for a bounding-box search (e.g. 5.0).'),
    maxlongitude: z
      .number()
      .min(-180)
      .max(180)
      .optional()
      .describe('Maximum longitude in decimal degrees for a bounding-box search (e.g. 25.0).'),
    latitude: z
      .number()
      .min(-90)
      .max(90)
      .optional()
      .describe(
        'Center latitude in decimal degrees for a point+radius search (use with longitude and maxradius).',
      ),
    longitude: z
      .number()
      .min(-180)
      .max(180)
      .optional()
      .describe(
        'Center longitude in decimal degrees for a point+radius search (use with latitude and maxradius).',
      ),
    maxradius: z
      .number()
      .positive()
      .optional()
      .describe(
        'Search radius in degrees around the latitude/longitude point (e.g. 5 for ~550km at the equator).',
      ),
    minmagnitude: z
      .number()
      .optional()
      .describe('Minimum earthquake magnitude to include (e.g. 3.0).'),
    maxmagnitude: z
      .number()
      .optional()
      .describe('Maximum earthquake magnitude to include (e.g. 7.0).'),
    mindepth: z.number().optional().describe('Minimum hypocenter depth in kilometers.'),
    maxdepth: z.number().optional().describe('Maximum hypocenter depth in kilometers.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe('Maximum number of events to return, 1-200 (default 50).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// emsc.event_detail — full detail for one EMSC event by unid/eventid
// ---------------------------------------------------------------------------

const emscEventDetail = z
  .object({
    eventid: z
      .string()
      .min(1)
      .describe(
        'EMSC event unique ID / unid (e.g. 20260827_0000123), as returned by emsc.search_earthquakes.',
      ),
    includeallmagnitudes: z
      .boolean()
      .optional()
      .describe(
        'Include all reported magnitude estimates for the event, not just the preferred one (default false).',
      ),
    includeallorigins: z
      .boolean()
      .optional()
      .describe(
        'Include all reported origin solutions for the event, not just the preferred one (default false).',
      ),
  })
  .strip();

// ---------------------------------------------------------------------------
// Export map
// ---------------------------------------------------------------------------

export const emscSchemas: Record<string, ZodSchema> = {
  'emsc.search_earthquakes': emscSearchEarthquakes,
  'emsc.event_detail': emscEventDetail,
};
