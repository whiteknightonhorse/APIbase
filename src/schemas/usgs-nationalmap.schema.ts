import { z, type ZodSchema } from 'zod';

// ---------------------------------------------------------------------------
// usgs-nationalmap.search_products — search The National Map product catalog
// ---------------------------------------------------------------------------

const usgsNationalMapSearchProducts = z
  .object({
    min_lat: z
      .number()
      .min(-90)
      .max(90)
      .describe('Minimum (southern) latitude of the bounding box, in decimal degrees (e.g. 39.0).'),
    min_lon: z
      .number()
      .min(-180)
      .max(180)
      .describe(
        'Minimum (western) longitude of the bounding box, in decimal degrees (e.g. -105.0).',
      ),
    max_lat: z
      .number()
      .min(-90)
      .max(90)
      .describe('Maximum (northern) latitude of the bounding box, in decimal degrees (e.g. 40.0).'),
    max_lon: z
      .number()
      .min(-180)
      .max(180)
      .describe(
        'Maximum (eastern) longitude of the bounding box, in decimal degrees (e.g. -104.0).',
      ),
    keyword: z
      .string()
      .optional()
      .describe(
        'Free-text keyword to filter products by title/description (e.g. "elevation", "lidar").',
      ),
    datasets: z
      .string()
      .optional()
      .describe(
        'Dataset name to filter by, from usgs-nationalmap.list_datasets (e.g. "US Topo", ' +
          '"National Elevation Dataset (NED) 1/3 arc-second").',
      ),
    formats: z
      .string()
      .optional()
      .describe('File format to filter by (e.g. "GeoTIFF", "GeoPackage", "Shapefile", "LAS,LAZ").'),
    max: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of products to return, 1-50 (default 10).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// usgs-nationalmap.list_datasets — list available TNM dataset collections
// ---------------------------------------------------------------------------

const usgsNationalMapListDatasets = z
  .object({
    category: z
      .string()
      .optional()
      .describe('Filter by parent category, e.g. "Map" or "Data" (case-insensitive, exact match).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// Export map
// ---------------------------------------------------------------------------

export const usgsNationalMapSchemas: Record<string, ZodSchema> = {
  'usgs-nationalmap.search_products': usgsNationalMapSearchProducts,
  'usgs-nationalmap.list_datasets': usgsNationalMapListDatasets,
};
