import { z } from 'zod';

export const openskySchemas: Record<string, z.ZodSchema> = {
  'opensky.states_bbox': z
    .object({
      lamin: z
        .number()
        .min(-90)
        .max(90)
        .describe('Minimum latitude of the bounding box in decimal degrees (e.g. 47.0)'),
      lomin: z
        .number()
        .min(-180)
        .max(180)
        .describe('Minimum longitude of the bounding box in decimal degrees (e.g. 5.0)'),
      lamax: z
        .number()
        .min(-90)
        .max(90)
        .describe('Maximum latitude of the bounding box in decimal degrees (e.g. 55.0)'),
      lomax: z
        .number()
        .min(-180)
        .max(180)
        .describe('Maximum longitude of the bounding box in decimal degrees (e.g. 15.0)'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .describe('Maximum number of aircraft to return (default 100, max 1000)'),
    })
    .strip(),

  'opensky.aircraft_state': z
    .object({
      icao24: z
        .string()
        .regex(/^[0-9a-f]{6}$/i)
        .describe(
          'ICAO 24-bit hex address of the aircraft transponder (e.g. 3c6444 for a Lufthansa aircraft)',
        ),
    })
    .strip(),

  'opensky.states_country': z
    .object({
      country: z
        .string()
        .describe(
          'Origin country name to filter aircraft by (e.g. Germany, United States, France). Case-insensitive.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe('Maximum number of matching aircraft to return (default 100, max 500)'),
      lamin: z
        .number()
        .min(-90)
        .max(90)
        .optional()
        .describe('Optional minimum latitude to narrow the search area (decimal degrees)'),
      lomin: z
        .number()
        .min(-180)
        .max(180)
        .optional()
        .describe('Optional minimum longitude to narrow the search area (decimal degrees)'),
      lamax: z
        .number()
        .min(-90)
        .max(90)
        .optional()
        .describe('Optional maximum latitude to narrow the search area (decimal degrees)'),
      lomax: z
        .number()
        .min(-180)
        .max(180)
        .optional()
        .describe('Optional maximum longitude to narrow the search area (decimal degrees)'),
    })
    .strip(),

  'opensky.aircraft_track': z
    .object({
      icao24: z
        .string()
        .regex(/^[0-9a-f]{6}$/i)
        .describe(
          'ICAO 24-bit hex address of the aircraft (e.g. 3ffc33). Must be an actively tracked flight.',
        ),
      time: z
        .number()
        .int()
        .optional()
        .describe(
          'Unix timestamp for which to retrieve the track. Use 0 or omit for the current flight trajectory.',
        ),
    })
    .strip(),
};
