import { z } from 'zod';
import type { ZodSchema } from 'zod';

export const opentopoDataSchemas: Record<string, ZodSchema> = {
  'opentopodata.point': z
    .object({
      lat: z.number().min(-90).max(90).describe('Latitude of the point (-90 to 90)'),
      lon: z.number().min(-180).max(180).describe('Longitude of the point (-180 to 180)'),
      dataset: z
        .enum(['srtm90m', 'srtm30m', 'aster30m'])
        .optional()
        .describe(
          'Elevation dataset: srtm90m (NASA SRTM 90m, default), srtm30m (NASA SRTM 30m), aster30m (ASTER 30m, good for high mountains)',
        ),
      interpolation: z
        .enum(['bilinear', 'nearest'])
        .optional()
        .describe(
          'Interpolation method: bilinear (default, smoother) or nearest (raw pixel value)',
        ),
    })
    .strip(),

  'opentopodata.batch': z
    .object({
      locations: z
        .array(
          z
            .object({
              lat: z.number().min(-90).max(90).describe('Latitude (-90 to 90)'),
              lon: z.number().min(-180).max(180).describe('Longitude (-180 to 180)'),
            })
            .strip(),
        )
        .min(1)
        .max(100)
        .describe('Array of lat/lon objects to query (1–100 locations per request)'),
      dataset: z
        .enum(['srtm90m', 'srtm30m', 'aster30m'])
        .optional()
        .describe(
          'Elevation dataset applied to all locations: srtm90m (default), srtm30m, aster30m',
        ),
      interpolation: z
        .enum(['bilinear', 'nearest'])
        .optional()
        .describe('Interpolation method: bilinear (default) or nearest'),
    })
    .strip(),

  'opentopodata.high_res': z
    .object({
      lat: z.number().min(-90).max(90).describe('Latitude of the point (-90 to 90)'),
      lon: z.number().min(-180).max(180).describe('Longitude of the point (-180 to 180)'),
      dataset: z
        .enum(['ned10m', 'eudem25m'])
        .optional()
        .describe(
          'High-resolution dataset: ned10m (USGS NED 10m, continental US only) or eudem25m (EU-DEM 25m, Europe only). Defaults to ned10m.',
        ),
      interpolation: z
        .enum(['bilinear', 'nearest'])
        .optional()
        .describe('Interpolation method: bilinear (default) or nearest'),
    })
    .strip(),

  'opentopodata.ocean': z
    .object({
      lat: z.number().min(-90).max(90).describe('Latitude of the ocean/sea point (-90 to 90)'),
      lon: z.number().min(-180).max(180).describe('Longitude of the ocean/sea point (-180 to 180)'),
      interpolation: z
        .enum(['bilinear', 'nearest'])
        .optional()
        .describe('Interpolation method: bilinear (default) or nearest'),
    })
    .strip(),
};
