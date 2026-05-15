import { z, type ZodSchema } from 'zod';

/**
 * NOAA Aviation Weather Center (AWC) tool schemas (UC-422).
 *
 * All fields have .describe() per Smithery quality requirements.
 * NEVER use empty z.object({}) — every tool has at least one param.
 */

export const awcSchemas: Record<string, ZodSchema> = {
  'awc.metar': z
    .object({
      icao_codes: z
        .string()
        .describe(
          "Comma-separated ICAO airport codes (uppercase, 4 letters each, e.g. 'KJFK,KLAX,EGLL,RJTT'). Max 20 per call. Examples: KJFK (New York JFK), EGLL (London Heathrow), RJTT (Tokyo Haneda).",
        ),
      hours: z
        .number()
        .int()
        .min(1)
        .max(72)
        .optional()
        .default(2)
        .describe('Hours of history to return (default 2, max 72)'),
    })
    .strip(),

  'awc.taf': z
    .object({
      icao_codes: z
        .string()
        .describe(
          'Comma-separated ICAO airport codes. Max 20 per call. Examples: KJFK (New York JFK), EGLL (London Heathrow), OMDB (Dubai International), YSSY (Sydney Kingsford Smith).',
        ),
    })
    .strip(),

  'awc.sigmet': z
    .object({
      _unused: z.string().optional().describe('Reserved for future hazard-type filtering'),
    })
    .strip(),
};
