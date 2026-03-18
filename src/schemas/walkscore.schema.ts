import { z, type ZodSchema } from 'zod';

const score = z
  .object({
    address: z
      .string()
      .describe('Full street address, e.g. "1119 8th Avenue Seattle WA 98101"'),
    latitude: z
      .number()
      .min(-90)
      .max(90)
      .describe('Latitude of the address (-90 to 90). Use geo.geocode to get coordinates.'),
    longitude: z
      .number()
      .min(-180)
      .max(180)
      .describe('Longitude of the address (-180 to 180). Use geo.geocode to get coordinates.'),
  })
  .strip();

export const walkscoreSchemas: Record<string, ZodSchema> = {
  'walkscore.score': score,
};
