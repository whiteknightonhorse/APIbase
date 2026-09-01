import { z, type ZodSchema } from 'zod';

const stationSearch = z
  .object({
    river_name: z
      .string()
      .max(200)
      .optional()
      .describe('Filter stations by river name, partial match (e.g. "River Thames").'),
    search: z
      .string()
      .max(200)
      .optional()
      .describe('Freetext search matching the station label/name (e.g. "Farmoor").'),
    observed_property: z
      .enum(['waterFlow', 'waterLevel', 'rainfall', 'temperature', 'groundwaterLevel'])
      .optional()
      .describe(
        'Filter stations by what they measure: waterFlow (river flow m3/s), waterLevel (river ' +
          'level), rainfall, temperature, or groundwaterLevel (borehole).',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe('Max stations to return (default 20, max 200).'),
  })
  .strip();

const stationMeasures = z
  .object({
    station_id: z
      .string()
      .min(1)
      .max(100)
      .describe(
        'Station identifier — the `station_id` (notation/GUID) returned by ' +
          'ea-hydrology.station_search, e.g. "052d0819-2a32-47df-9b99-c243c9c8235b".',
      ),
    parameter: z
      .enum(['flow', 'level', 'rainfall', 'TEMPERATURE'])
      .optional()
      .describe(
        'Filter measures by parameter type. Note: TEMPERATURE must be uppercase, the others ' +
          'lowercase — confirmed upstream data quirk, not a typo.',
      ),
  })
  .strip();

const readingsLatest = z
  .object({
    measure_id: z
      .string()
      .min(1)
      .max(300)
      .describe(
        'Measure identifier — the `measure_id` (notation) returned by ' +
          'ea-hydrology.station_measures, e.g. ' +
          '"052d0819-2a32-47df-9b99-c243c9c8235b-flow-i-900-m3s-qualified".',
      ),
  })
  .strip();

const readingsRange = z
  .object({
    measure_id: z
      .string()
      .min(1)
      .max(300)
      .describe('Measure identifier returned by ea-hydrology.station_measures.'),
    min_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe('Start date (inclusive), format YYYY-MM-DD.'),
    max_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe('End date (inclusive), format YYYY-MM-DD.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(2000)
      .optional()
      .describe('Max readings to return (default 500, max 2000).'),
  })
  .strip();

export const eaHydrologySchemas: Record<string, ZodSchema> = {
  'ea-hydrology.station_search': stationSearch,
  'ea-hydrology.station_measures': stationMeasures,
  'ea-hydrology.readings_latest': readingsLatest,
  'ea-hydrology.readings_range': readingsRange,
};
