import { z, type ZodSchema } from 'zod';

// ---------------------------------------------------------------------------
// usgs-mrds.search_by_area — search deposits within a geographic bounding box
// ---------------------------------------------------------------------------

const usgsMrdsSearchByArea = z
  .object({
    min_lat: z.number().min(-90).max(90).describe('Southern boundary latitude in decimal degrees.'),
    min_lon: z
      .number()
      .min(-180)
      .max(180)
      .describe('Western boundary longitude in decimal degrees.'),
    max_lat: z.number().min(-90).max(90).describe('Northern boundary latitude in decimal degrees.'),
    max_lon: z
      .number()
      .min(-180)
      .max(180)
      .describe('Eastern boundary longitude in decimal degrees.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of deposits to return (default 20, max 100).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// Export map
// ---------------------------------------------------------------------------

export const usgsMrdsSchemas: Record<string, ZodSchema> = {
  'usgs-mrds.search_by_area': usgsMrdsSearchByArea,
};
