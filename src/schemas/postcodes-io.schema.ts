import { z, type ZodSchema } from 'zod';

const lookup = z
  .object({
    postcode: z
      .string()
      .min(1)
      .describe(
        'UK postcode to look up (e.g. "SW1A 1AA" for Westminster, "EC2R 8AH" for City of London, "M1 1AA" for Manchester). Returns district, region, country, lat/lon, parliamentary constituency',
      ),
  })
  .strip();

const nearest = z
  .object({
    lat: z.number().describe('Latitude (e.g. 51.5074 for London)'),
    lon: z.number().describe('Longitude (e.g. -0.1278 for London)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .default(5)
      .describe('Max results (1-10, default 5)'),
  })
  .strip();

const validate = z
  .object({
    postcode: z
      .string()
      .min(1)
      .describe(
        'UK postcode to validate (e.g. "SW1A 1AA"). Returns true if valid format and exists',
      ),
  })
  .strip();

export const postcodesIoSchemas: Record<string, ZodSchema> = {
  'ukpost.lookup': lookup,
  'ukpost.nearest': nearest,
  'ukpost.validate': validate,
};
