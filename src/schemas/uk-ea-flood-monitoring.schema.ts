import { z, type ZodSchema } from 'zod';

const currentWarnings = z
  .object({
    min_severity: z
      .number()
      .int()
      .min(1)
      .max(4)
      .optional()
      .describe(
        'Filter to warnings at this severity or more severe (lower number = more severe): ' +
          '1=Severe Flood Warning (danger to life), 2=Flood Warning (immediate action), ' +
          '3=Flood Alert (be prepared), 4=Warning no longer in force. Omit for all active items.',
      ),
    county: z
      .string()
      .max(100)
      .optional()
      .describe(
        'Filter by county name of the affected flood area (e.g. "Devon", "North Yorkshire").',
      ),
    lat: z
      .number()
      .min(-90)
      .max(90)
      .optional()
      .describe('Latitude for a geographic radius filter — use with `long` and `dist`.'),
    long: z
      .number()
      .min(-180)
      .max(180)
      .optional()
      .describe('Longitude for a geographic radius filter — use with `lat` and `dist`.'),
    dist: z
      .number()
      .positive()
      .optional()
      .describe('Search radius in kilometres around `lat`/`long` — use with both.'),
  })
  .strip();

const stationSearch = z
  .object({
    town: z
      .string()
      .max(100)
      .optional()
      .describe('Filter stations by nearest town (e.g. "Shrewsbury").'),
    river_name: z
      .string()
      .max(200)
      .optional()
      .describe('Filter stations by river name, partial match (e.g. "River Severn").'),
    catchment_name: z
      .string()
      .max(200)
      .optional()
      .describe('Filter stations by river catchment name (e.g. "Cotswolds").'),
    parameter: z
      .enum(['level', 'flow', 'rainfall', 'wind', 'temperature'])
      .optional()
      .describe('Filter stations by the type of measurement they record.'),
    search: z
      .string()
      .max(200)
      .optional()
      .describe('Freetext search matching the station label/name.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe('Max stations to return (default 20, max 200).'),
  })
  .strip();

const stationReadings = z
  .object({
    station_id: z
      .string()
      .min(1)
      .max(100)
      .describe(
        'Station identifier — the `station_id` (notation) returned by ' +
          'uk-ea-flood-monitoring.station_search, e.g. "1029TH".',
      ),
  })
  .strip();

export const ukEaFloodMonitoringSchemas: Record<string, ZodSchema> = {
  'uk-ea-flood-monitoring.current_warnings': currentWarnings,
  'uk-ea-flood-monitoring.station_search': stationSearch,
  'uk-ea-flood-monitoring.station_readings': stationReadings,
};
