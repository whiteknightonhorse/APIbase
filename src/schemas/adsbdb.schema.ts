import { z } from 'zod';

export const adsbdbSchemas: Record<string, z.ZodTypeAny> = {
  'adsbdb.aircraft_lookup': z
    .object({
      identifier: z
        .string()
        .describe(
          'Aircraft identifier: Mode-S hex code (e.g. "400F6B", "A05ED9") or ICAO registration mark (e.g. "G-RVCL", "N123AB"). Mode-S is a 6-character hexadecimal transponder code; registration is the tail number. Both formats are accepted.',
        ),
    })
    .strip(),

  'adsbdb.airline_lookup': z
    .object({
      code: z
        .string()
        .describe(
          'Airline code to look up. Accepts ICAO 3-letter codes (e.g. "BAW" for British Airways, "UAL" for United) or IATA 2-letter codes (e.g. "BA", "UA"). ICAO codes are preferred for unambiguous lookup.',
        ),
    })
    .strip(),

  'adsbdb.callsign_lookup': z
    .object({
      callsign: z
        .string()
        .describe(
          'Flight callsign to resolve, typically the airline ICAO code followed by flight number (e.g. "BAW123" for British Airways flight 123, "UAL456" for United flight 456). Returns origin, destination airports and airline details.',
        ),
    })
    .strip(),
};
