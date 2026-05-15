import { z } from 'zod';
import { type ZodSchema } from 'zod';

/**
 * AVWX Aviation Weather schemas (UC-424).
 *
 * https://avwx.rest/documentation
 * Three tools: parsed NOTAMs, parsed PIREPs, composite station summary.
 */

export const avwxSchemas: Record<string, ZodSchema> = {
  'avwx.notams': z
    .object({
      icao_code: z
        .string()
        .describe(
          'Single ICAO airport code (4-letter uppercase). Examples: KJFK, EGLL, RJTT, OMDB.',
        ),
      distance: z
        .number()
        .int()
        .min(0)
        .max(100)
        .optional()
        .describe(
          'Include NOTAMs within this nautical-mile radius (0-100, default 10). Use 0 for airport-specific only.',
        ),
    })
    .strip(),

  'avwx.pireps': z
    .object({
      icao_code: z
        .string()
        .describe('Single ICAO airport code (4-letter uppercase). Examples: KJFK, EGLL, KSFO.'),
    })
    .strip(),

  'avwx.station_summary': z
    .object({
      icao_code: z
        .string()
        .describe('Single ICAO airport code (4-letter uppercase). Examples: KJFK, EGLL, KSFO.'),
    })
    .strip(),
};
