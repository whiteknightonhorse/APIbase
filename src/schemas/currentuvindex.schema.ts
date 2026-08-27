import { z, type ZodSchema } from 'zod';

const uvIndex = z
  .object({
    latitude: z
      .number()
      .min(-90)
      .max(90)
      .describe('Latitude of the location, decimal degrees (-90 to 90). Example: 40.6943.'),
    longitude: z
      .number()
      .min(-180)
      .max(180)
      .describe('Longitude of the location, decimal degrees (-180 to 180). Example: -73.9249.'),
  })
  .strip();

export const currentuvindexSchemas: Record<string, ZodSchema> = {
  'currentuvindex.uv_index': uvIndex,
};
