import { z } from 'zod';
import { type ZodSchema } from 'zod';

/**
 * CheckWX Aviation Weather schemas (UC-423).
 *
 * https://www.checkwxapi.com/documentation
 * Three tools: decoded METAR, decoded TAF, station info.
 */

export const checkwxSchemas: Record<string, ZodSchema> = {
  'checkwx.metar_decoded': z
    .object({
      icao_codes: z
        .string()
        .describe(
          "Comma-separated ICAO airport codes (uppercase 4 letters). Max 25 per call. Examples: 'KJFK,EGLL,RJTT', 'KSFO', 'EDDF'.",
        ),
    })
    .strip(),

  'checkwx.taf_decoded': z
    .object({
      icao_codes: z
        .string()
        .describe(
          "Comma-separated ICAO airport codes (uppercase 4 letters). Max 25 per call. Examples: 'KJFK,EGLL,RJTT', 'KSFO', 'EDDF'.",
        ),
    })
    .strip(),

  'checkwx.station_info': z
    .object({
      icao_code: z
        .string()
        .describe(
          "Single ICAO airport/station code (4-letter uppercase). Examples: 'KJFK', 'EGLL', 'RJTT'.",
        ),
    })
    .strip(),
};
