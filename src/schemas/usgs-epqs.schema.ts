import { z, type ZodSchema } from 'zod';

// ---------------------------------------------------------------------------
// usgs-epqs.elevation — single-point elevation from USGS 3DEP
// ---------------------------------------------------------------------------

const usgsEpqsElevation = z
  .object({
    latitude: z
      .number()
      .min(-90)
      .max(90)
      .describe(
        'Latitude in decimal degrees, WGS84 (e.g. 39.7147). Continental US + territories only.',
      ),
    longitude: z
      .number()
      .min(-180)
      .max(180)
      .describe('Longitude in decimal degrees, WGS84 (e.g. -105.0178).'),
    units: z
      .enum(['Meters', 'Feet'])
      .optional()
      .describe('Elevation output units, "Meters" or "Feet" (default "Meters").'),
    include_date: z
      .boolean()
      .optional()
      .describe('Include the source DEM raster acquisition date in the response (default false).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// Export map
// ---------------------------------------------------------------------------

export const usgsEpqsSchemas: Record<string, ZodSchema> = {
  'usgs-epqs.elevation': usgsEpqsElevation,
};
