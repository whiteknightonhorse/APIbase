import { z } from 'zod';
import type { ZodSchema } from 'zod';

const GLOBAL_DEM_DATASET = z
  .enum([
    'SRTMGL1',
    'SRTMGL3',
    'SRTMGL1_E',
    'AW3D30',
    'AW3D30_E',
    'NASADEM',
    'COP30',
    'COP90',
    'EU_DTM',
    'SRTM15Plus',
    'GEDI_L3',
    'GEBCOIceTopo',
    'GEBCOSubIceTopo',
  ])
  .optional()
  .describe(
    'Global DEM dataset to query. SRTMGL1 = NASA SRTM 30m (default, global). ' +
      'COP30 = Copernicus 30m (high accuracy). AW3D30 = ALOS World 3D 30m. ' +
      'NASADEM = NASA 30m reprocessed SRTM. SRTMGL3 = SRTM 90m. ' +
      'COP90 = Copernicus 90m. SRTM15Plus = 500m global+bathymetry. ' +
      'EU_DTM = European 30m. GEBCOIceTopo/GEBCOSubIceTopo = GEBCO 500m ice/sub-ice.',
  );

export const opentopographySchemas: Record<string, ZodSchema> = {
  'opentopo.elevation_point': z
    .object({
      lat: z
        .number()
        .min(-90)
        .max(90)
        .describe('Latitude of the point to query (-90 to 90 decimal degrees)'),
      lon: z
        .number()
        .min(-180)
        .max(180)
        .describe('Longitude of the point to query (-180 to 180 decimal degrees)'),
      dataset: GLOBAL_DEM_DATASET,
    })
    .strip(),

  'opentopo.elevation_area': z
    .object({
      south: z
        .number()
        .min(-90)
        .max(90)
        .describe('Southern boundary of bounding box in decimal degrees (-90 to 90)'),
      north: z
        .number()
        .min(-90)
        .max(90)
        .describe('Northern boundary of bounding box in decimal degrees (must be > south)'),
      west: z
        .number()
        .min(-180)
        .max(180)
        .describe('Western boundary of bounding box in decimal degrees (-180 to 180)'),
      east: z
        .number()
        .min(-180)
        .max(180)
        .describe('Eastern boundary of bounding box in decimal degrees (must be > west)'),
      dataset: GLOBAL_DEM_DATASET,
    })
    .strip(),

  'opentopo.lidar_catalog': z
    .object({
      min_lon: z
        .number()
        .min(-180)
        .max(180)
        .describe('Western boundary of search area in decimal degrees (-180 to 180)'),
      min_lat: z
        .number()
        .min(-90)
        .max(90)
        .describe('Southern boundary of search area in decimal degrees (-90 to 90)'),
      max_lon: z
        .number()
        .min(-180)
        .max(180)
        .describe('Eastern boundary of search area in decimal degrees (-180 to 180)'),
      max_lat: z
        .number()
        .min(-90)
        .max(90)
        .describe('Northern boundary of search area in decimal degrees (-90 to 90)'),
    })
    .strip(),

  'opentopo.dem_catalog': z
    .object({
      min_lon: z
        .number()
        .min(-180)
        .max(180)
        .describe('Western boundary of search area in decimal degrees (-180 to 180)'),
      min_lat: z
        .number()
        .min(-90)
        .max(90)
        .describe('Southern boundary of search area in decimal degrees (-90 to 90)'),
      max_lon: z
        .number()
        .min(-180)
        .max(180)
        .describe('Eastern boundary of search area in decimal degrees (-180 to 180)'),
      max_lat: z
        .number()
        .min(-90)
        .max(90)
        .describe('Northern boundary of search area in decimal degrees (-90 to 90)'),
    })
    .strip(),
};
