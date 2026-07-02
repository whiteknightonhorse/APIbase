import { z } from 'zod';

export const aviationweatherSchemas: Record<string, z.ZodSchema> = {
  'aviationweather.metar': z
    .object({
      ids: z
        .string()
        .describe(
          'Comma-separated ICAO airport codes to retrieve METAR for (e.g. "KJFK", "KJFK,KLAX,EGLL"). ' +
            'Maximum ~10 stations per call.',
        ),
      hours_back: z
        .number()
        .int()
        .min(1)
        .max(24)
        .optional()
        .describe(
          'How many hours back to look for the most recent METAR observation (1–24, default 1). ' +
            'Use 3–6 if a station may not have reported in the last hour.',
        ),
    })
    .strip(),

  'aviationweather.taf': z
    .object({
      ids: z
        .string()
        .describe(
          'Comma-separated ICAO airport codes to retrieve Terminal Aerodrome Forecasts for ' +
            '(e.g. "KJFK", "KJFK,KLAX"). Most major airports publish a TAF valid 24–30 hours ahead.',
        ),
    })
    .strip(),

  'aviationweather.pirep': z
    .object({
      id: z
        .string()
        .describe(
          'ICAO station identifier to use as the geographic center of the search ' +
            '(e.g. "KJFK", "KORD"). Pilot reports within `distance` nautical miles of this ' +
            'station and within the last `age` hours are returned.',
        ),
      age: z
        .number()
        .int()
        .min(1)
        .max(24)
        .optional()
        .describe('How many hours back to search for pilot reports (1–24, default 2).'),
      distance: z
        .number()
        .int()
        .min(10)
        .max(200)
        .optional()
        .describe(
          'Search radius in nautical miles around the station (10–200, default 100). ' +
            '100 nm covers the typical terminal area plus en-route corridor.',
        ),
    })
    .strip(),

  'aviationweather.stations': z
    .object({
      ids: z
        .string()
        .optional()
        .describe(
          'Comma-separated ICAO station identifiers to look up (e.g. "KJFK,KLAX"). ' +
            'Use this OR bbox OR state — not together.',
        ),
      bbox: z
        .string()
        .optional()
        .describe(
          'Bounding box in decimal degrees: "minLat,minLon,maxLat,maxLon" ' +
            '(e.g. "25,-125,50,-65" for the contiguous US). ' +
            'Returns all aviation weather stations within the box.',
        ),
      state: z
        .string()
        .length(2)
        .optional()
        .describe(
          'Two-letter US state abbreviation to filter stations by state (e.g. "TX", "CA"). ' +
            'Returns all aviation weather stations in that state.',
        ),
    })
    .strip(),
};
