import { z, type ZodSchema } from 'zod';

const position = z
  .object({
    units: z
      .enum(['kilometers', 'miles'])
      .optional()
      .describe('Distance units: kilometers (default) or miles'),
  })
  .strip();

const tle = z
  .object({
    format: z
      .enum(['json', 'text'])
      .optional()
      .describe('Response format: json (default) or text (raw TLE two-line element)'),
  })
  .strip();

export const issSchemas: Record<string, ZodSchema> = {
  'iss.position': position,
  'iss.tle': tle,
};
