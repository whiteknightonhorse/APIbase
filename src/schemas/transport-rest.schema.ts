import { z, type ZodSchema } from 'zod';

const locationSearch = z
  .object({
    query: z
      .string()
      .min(2)
      .max(120)
      .describe(
        'Search text for a stop/station, address, or point of interest (e.g. "Alexanderplatz" or ' +
          '"Unter den Linden 1, Berlin"). Returns matching location IDs to use in other tools.',
      ),
    results: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of matching locations to return (default 10, max 50).'),
    include_poi: z
      .boolean()
      .optional()
      .describe(
        'Include points of interest (landmarks, venues) in results, not just stops. Default false.',
      ),
    include_addresses: z
      .boolean()
      .optional()
      .describe('Include street addresses in results, not just stops. Default false.'),
  })
  .strip();

const nearbyStops = z
  .object({
    latitude: z.number().min(-90).max(90).describe('Latitude of the search point (WGS84).'),
    longitude: z.number().min(-180).max(180).describe('Longitude of the search point (WGS84).'),
    results: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of nearby stops to return (default 8, max 50).'),
    max_distance_meters: z
      .number()
      .int()
      .min(1)
      .max(20000)
      .optional()
      .describe('Maximum walking distance in meters from the search point. Omit for no limit.'),
  })
  .strip();

const stopDepartures = z
  .object({
    stop_id: z
      .string()
      .min(1)
      .max(30)
      .describe(
        'Stop/station ID to fetch departures for, obtained from transport-rest.location_search or ' +
          'transport-rest.nearby_stops (e.g. "900100003").',
      ),
    duration_minutes: z
      .number()
      .int()
      .min(1)
      .max(180)
      .optional()
      .describe('Time window in minutes to look ahead for departures (default 60, max 180).'),
    results: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of departures to return (default 20, max 100).'),
    when: z
      .string()
      .optional()
      .describe(
        'ISO 8601 date-time to fetch departures for instead of now (e.g. "2026-09-01T08:00:00+02:00").',
      ),
  })
  .strip();

const journeySearch = z
  .object({
    from_stop_id: z
      .string()
      .min(1)
      .max(30)
      .describe(
        'Origin stop/station ID, obtained from transport-rest.location_search or transport-rest.nearby_stops.',
      ),
    to_stop_id: z
      .string()
      .min(1)
      .max(30)
      .describe(
        'Destination stop/station ID, obtained from transport-rest.location_search or transport-rest.nearby_stops.',
      ),
    departure: z
      .string()
      .optional()
      .describe(
        'ISO 8601 date-time to depart at or after (e.g. "2026-09-01T08:00:00+02:00"). Mutually exclusive ' +
          'with arrival; defaults to now if neither is set.',
      ),
    arrival: z
      .string()
      .optional()
      .describe('ISO 8601 date-time to arrive at or before. Mutually exclusive with departure.'),
    results: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .describe('Maximum number of journey options to return (default 3, max 10).'),
  })
  .strip();

export const transportRestSchemas: Record<string, ZodSchema> = {
  'transport-rest.location_search': locationSearch,
  'transport-rest.nearby_stops': nearbyStops,
  'transport-rest.stop_departures': stopDepartures,
  'transport-rest.journey_search': journeySearch,
};
