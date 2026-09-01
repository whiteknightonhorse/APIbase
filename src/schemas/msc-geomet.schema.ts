import { z, type ZodSchema } from 'zod';

const limitField = (fallback: number, max: number) =>
  z
    .number()
    .int()
    .positive()
    .optional()
    .describe(`Max records to return (1-${max}). Defaults to ${fallback}.`);

// ---------------------------------------------------------------------------
// msc-geomet.climate_stations — station catalog search
// ---------------------------------------------------------------------------

const mscGeometClimateStations = z
  .object({
    province: z
      .enum(['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'])
      .optional()
      .describe(
        'Filter to a Canadian province/territory by 2-letter code (e.g. "ON" Ontario, "BC" ' +
          'British Columbia). Omit to search all provinces.',
      ),
    bbox: z
      .string()
      .optional()
      .describe(
        'Bounding box filter as "minLon,minLat,maxLon,maxLat" in decimal degrees ' +
          '(e.g. "-80,43,-79,44" for the Toronto area).',
      ),
    limit: limitField(20, 100),
  })
  .strip();

// ---------------------------------------------------------------------------
// msc-geomet.climate_daily — daily climate observations for a station
// ---------------------------------------------------------------------------

const mscGeometClimateDaily = z
  .object({
    climate_identifier: z
      .string()
      .min(1)
      .describe(
        'Station CLIMATE_IDENTIFIER, e.g. "6158731" (Toronto Intl A). Get station IDs from ' +
          'msc-geomet.climate_stations.',
      ),
    start_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe('Start of the date range, format YYYY-MM-DD. Must be paired with end_date.'),
    end_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe('End of the date range, format YYYY-MM-DD. Must be paired with start_date.'),
    limit: limitField(30, 366),
  })
  .strip();

// ---------------------------------------------------------------------------
// msc-geomet.hydrometric_realtime — real-time river/lake level and discharge
// ---------------------------------------------------------------------------

const mscGeometHydrometricRealtime = z
  .object({
    station_number: z
      .string()
      .min(1)
      .describe(
        'Hydrometric station number, e.g. "01AD003" (St. Francis River, NB). Readings are ' +
          'reported roughly every 5 minutes for stations with real-time telemetry.',
      ),
    limit: limitField(20, 288),
  })
  .strip();

// ---------------------------------------------------------------------------
// msc-geomet.aqhi_observations — real-time Air Quality Health Index
// ---------------------------------------------------------------------------

const mscGeometAqhiObservations = z
  .object({
    location_id: z
      .string()
      .optional()
      .describe(
        'AQHI monitoring location ID, e.g. "CAPHL" (Halifax Downtown). Omit to return the ' +
          'latest observation from every monitored location across Canada.',
      ),
    limit: limitField(20, 50),
  })
  .strip();

// ---------------------------------------------------------------------------
// Export map
// ---------------------------------------------------------------------------

export const mscGeometSchemas: Record<string, ZodSchema> = {
  'msc-geomet.climate_stations': mscGeometClimateStations,
  'msc-geomet.climate_daily': mscGeometClimateDaily,
  'msc-geomet.hydrometric_realtime': mscGeometHydrometricRealtime,
  'msc-geomet.aqhi_observations': mscGeometAqhiObservations,
};
