import { z, type ZodSchema } from 'zod';

const searchScenes = z
  .object({
    collection: z
      .string()
      .min(1)
      .optional()
      .describe(
        'STAC collection ID to search (default "sentinel-2-l2a"). Other common values: ' +
          '"sentinel-1-grd" (radar), "sentinel-2-l1c" (top-of-atmosphere optical), ' +
          '"sentinel-3-olci-2-wfr-nrt" (ocean color). See copernicus-sentinel.list_collections ' +
          'for the full list.',
      ),
    bbox: z
      .array(z.number())
      .length(4)
      .optional()
      .describe(
        'Bounding box [min_lon, min_lat, max_lon, max_lat] in WGS84 decimal degrees. Provide ' +
          'this OR lat + lon.',
      ),
    lat: z
      .number()
      .min(-90)
      .max(90)
      .optional()
      .describe(
        'Latitude of a point of interest. Use with "lon" (and optional "radius_km") instead of bbox.',
      ),
    lon: z
      .number()
      .min(-180)
      .max(180)
      .optional()
      .describe(
        'Longitude of a point of interest. Use with "lat" (and optional "radius_km") instead of bbox.',
      ),
    radius_km: z
      .number()
      .min(1)
      .max(500)
      .optional()
      .describe(
        'Search radius in kilometers around lat/lon (default 20, max 500). Ignored if bbox is given.',
      ),
    start_date: z.string().describe('Start of the acquisition date range, format YYYY-MM-DD.'),
    end_date: z.string().describe('End of the acquisition date range, format YYYY-MM-DD.'),
    max_cloud_cover: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe(
        'Maximum acceptable cloud cover percentage (0-100). Applies to optical collections ' +
          'like Sentinel-2; omit for radar collections such as Sentinel-1.',
      ),
    sort: z
      .enum(['date_desc', 'cloud_asc'])
      .optional()
      .describe(
        'Sort order: "date_desc" (newest first, default) or "cloud_asc" (least cloudy first).',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of scenes to return (default 10, max 50).'),
  })
  .strip();

const sceneDetail = z
  .object({
    collection: z
      .string()
      .min(1)
      .describe(
        'STAC collection ID the scene belongs to (from a search_scenes result), e.g. "sentinel-2-l2a".',
      ),
    item_id: z
      .string()
      .min(1)
      .describe(
        'STAC item (scene) ID from a search_scenes result, e.g. ' +
          '"S2B_MSIL2A_20260829T053639_N0512_R005_T50XNK_20260829T072754".',
      ),
  })
  .strip();

const listCollections = z
  .object({
    keyword: z
      .string()
      .optional()
      .describe(
        'Filter collections by keyword matched against collection ID and title (case-insensitive ' +
          'substring), e.g. "sentinel-1" or "dem". Omit to list only the Sentinel mission collections.',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of collections to return (default 20, max 100).'),
  })
  .strip();

export const copernicusSentinelSchemas: Record<string, ZodSchema> = {
  'copernicus-sentinel.search_scenes': searchScenes,
  'copernicus-sentinel.scene_detail': sceneDetail,
  'copernicus-sentinel.list_collections': listCollections,
};
