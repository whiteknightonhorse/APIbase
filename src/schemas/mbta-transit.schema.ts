import { z, type ZodSchema } from 'zod';

const routes = z
  .object({
    type: z
      .enum(['0', '1', '2', '3', '4'])
      .optional()
      .describe(
        'Filter by route type: 0=Light Rail, 1=Heavy Rail/Subway, 2=Commuter Rail, 3=Bus, 4=Ferry. Omit for all types.',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of routes to return (default 50, max 100)'),
    sort: z
      .enum(['long_name', '-long_name', 'sort_order', '-sort_order', 'type', '-type'])
      .optional()
      .describe(
        'Sort order: "sort_order" (default MBTA order), "long_name" alphabetical, prefix "-" for descending',
      ),
  })
  .strip();

const stops = z
  .object({
    route: z
      .string()
      .optional()
      .describe(
        'Filter stops by route ID (e.g. "Red" for Red Line, "1" for Route 1 bus, "CR-Fairmount" for commuter rail). Use mbta-transit.routes to get route IDs.',
      ),
    latitude: z
      .number()
      .min(-90)
      .max(90)
      .optional()
      .describe(
        'Center latitude for proximity search. Must be paired with longitude and radius (e.g. 42.3601 for Boston)',
      ),
    longitude: z
      .number()
      .min(-180)
      .max(180)
      .optional()
      .describe(
        'Center longitude for proximity search. Must be paired with latitude and radius (e.g. -71.0589 for Boston)',
      ),
    radius: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe(
        'Search radius in degrees around lat/lon (approx 0.01° ≈ 1 km). Use with latitude+longitude.',
      ),
    location_type: z
      .enum(['0', '1', '2'])
      .optional()
      .describe(
        'Filter by location type: 0=individual stop/platform, 1=station (parent), 2=station entrance/exit',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of stops to return (default 25, max 100)'),
  })
  .strip();

const alerts = z
  .object({
    route: z
      .string()
      .optional()
      .describe(
        'Filter alerts by route ID (e.g. "Red", "Green-B", "1", "CR-Providence"). Use mbta-transit.routes to get IDs.',
      ),
    stop: z
      .string()
      .optional()
      .describe(
        'Filter alerts by stop ID (e.g. "place-sstat" for South Station). Use mbta-transit.stops to get IDs.',
      ),
    severity: z
      .number()
      .int()
      .min(0)
      .max(10)
      .optional()
      .describe(
        'Minimum severity level 0–10: 0–3=informational, 4–6=minor disruption, 7–8=moderate, 9–10=major/shutdown. Omit for all.',
      ),
    lifecycle: z
      .enum(['NEW', 'ONGOING', 'ONGOING_UPCOMING', 'UPCOMING'])
      .optional()
      .describe(
        'Filter by alert lifecycle: "ONGOING" (active now), "UPCOMING" (future planned), "NEW" (just created)',
      ),
    effect: z
      .enum([
        'ACCESS_ISSUE',
        'ADDITIONAL_SERVICE',
        'CANCELLATION',
        'DELAY',
        'DETOUR',
        'DOCK_CLOSURE',
        'DOCK_ISSUE',
        'EXTRA_SERVICE',
        'FACILITY_ISSUE',
        'MODIFIED_SERVICE',
        'NO_SERVICE',
        'OTHER_EFFECT',
        'PARKING_CLOSURE',
        'PARKING_ISSUE',
        'POLICY_CHANGE',
        'SCHEDULE_CHANGE',
        'SERVICE_CHANGE',
        'SHUTTLE',
        'SNOW_ROUTE',
        'STATION_CLOSURE',
        'STATION_ISSUE',
        'STOP_CLOSURE',
        'STOP_MOVE',
        'STOP_SHOVELING',
        'SUMMARY',
        'SUSPENSION',
        'TRACK_CHANGE',
      ])
      .optional()
      .describe(
        'Filter by disruption effect type: "DELAY", "CANCELLATION", "SUSPENSION", "SHUTTLE", "DETOUR", "STATION_CLOSURE", etc.',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of alerts to return (default 20, max 50)'),
  })
  .strip();

const predictions = z
  .object({
    stop: z
      .string()
      .optional()
      .describe(
        'Stop or station ID for arrival/departure predictions (e.g. "place-sstat" for South Station, "place-pktrm" for Park Street). Use mbta-transit.stops to find stop IDs.',
      ),
    route: z
      .string()
      .optional()
      .describe(
        'Route ID to get predictions for (e.g. "Red", "Green-B", "1"). At least one of stop or route is required.',
      ),
    direction_id: z
      .number()
      .int()
      .min(0)
      .max(1)
      .optional()
      .describe(
        'Filter by direction: 0=outbound (away from downtown/terminus), 1=inbound (toward downtown/terminus). See mbta-transit.routes for direction names.',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe(
        'Maximum number of predictions to return (default 10, max 50). Each prediction is one scheduled stop for one vehicle.',
      ),
  })
  .strip();

export const mbtaTransitSchemas: Record<string, ZodSchema> = {
  'mbta-transit.routes': routes,
  'mbta-transit.stops': stops,
  'mbta-transit.alerts': alerts,
  'mbta-transit.predictions': predictions,
};
