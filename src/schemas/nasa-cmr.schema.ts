import { z } from 'zod';
import { type ZodSchema } from 'zod';

export const nasaCmrSchemas: Record<string, ZodSchema> = {
  'nasa-cmr.search_collections': z
    .object({
      keyword: z
        .string()
        .optional()
        .describe(
          'Free-text keyword to search collection titles, summaries, and metadata ' +
            '(e.g. "sea surface temperature", "MODIS land cover", "global precipitation").',
        ),
      short_name: z
        .string()
        .optional()
        .describe(
          'Exact collection short name identifier (e.g. "MOD13A2", "GPM_3IMERGHHE"). ' +
            'Use when you know the specific dataset short name.',
        ),
      provider: z
        .string()
        .optional()
        .describe(
          'Filter by NASA data center / archive provider ID ' +
            '(e.g. "GES_DISC", "ORNL_DAAC", "LPDAAC_ECS", "PODAAC", "NSIDC_ECS"). ' +
            'Use nasa-cmr.providers.list to discover available provider IDs.',
        ),
      temporal_start: z
        .string()
        .optional()
        .describe(
          'Start of temporal coverage filter in ISO 8601 UTC format (e.g. "2020-01-01T00:00:00Z"). ' +
            'Returns collections whose temporal extent overlaps this range.',
        ),
      temporal_end: z
        .string()
        .optional()
        .describe(
          'End of temporal coverage filter in ISO 8601 UTC format (e.g. "2023-12-31T23:59:59Z"). ' +
            'Returns collections whose temporal extent overlaps this range.',
        ),
      bbox: z
        .string()
        .optional()
        .describe(
          'Bounding box spatial filter as "west,south,east,north" decimal degrees ' +
            '(e.g. "-180,-90,180,90" for global, "-125,24,-66,50" for continental US). ' +
            'Returns collections with spatial coverage intersecting the box.',
        ),
      processing_level: z
        .string()
        .optional()
        .describe(
          'NASA data processing level filter (e.g. "1B", "2", "3", "4"). ' +
            'Level 1 = raw/calibrated; Level 2 = geophysical retrievals; ' +
            'Level 3 = gridded; Level 4 = model output.',
        ),
      sort_key: z
        .enum(['-score', 'entry_title', '-entry_title', 'start_date', '-start_date'])
        .optional()
        .describe(
          'Sort order for results: "-score" (relevance, default), "entry_title" / "-entry_title" ' +
            '(alphabetical), "start_date" / "-start_date" (temporal coverage start date).',
        ),
      page_size: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe('Number of collections to return per page (1–20, default 10).'),
    })
    .strip(),

  'nasa-cmr.collection_detail': z
    .object({
      concept_id: z
        .string()
        .describe(
          'CMR concept ID of the collection to retrieve full UMM metadata for ' +
            '(e.g. "C2515837343-GES_DISC"). Obtain concept IDs from nasa-cmr.datasets.search results.',
        ),
    })
    .strip(),

  'nasa-cmr.search_granules': z
    .object({
      collection_concept_id: z
        .string()
        .optional()
        .describe(
          'CMR concept ID of the parent collection to search granules within ' +
            '(e.g. "C2515837343-GES_DISC"). Obtain from nasa-cmr.datasets.search results. ' +
            'Provide this or short_name to scope the search.',
        ),
      short_name: z
        .string()
        .optional()
        .describe(
          'Collection short name to search granules for (e.g. "MOD09GA", "GPM_3IMERGHHE"). ' +
            'Alternative to collection_concept_id for well-known datasets.',
        ),
      temporal_start: z
        .string()
        .optional()
        .describe(
          'Start of temporal filter in ISO 8601 UTC format (e.g. "2023-01-01T00:00:00Z"). ' +
            'Returns granules with data acquisition time overlapping this range.',
        ),
      temporal_end: z
        .string()
        .optional()
        .describe(
          'End of temporal filter in ISO 8601 UTC format (e.g. "2023-01-31T23:59:59Z"). ' +
            'Returns granules with data acquisition time overlapping this range.',
        ),
      bbox: z
        .string()
        .optional()
        .describe(
          'Bounding box spatial filter as "west,south,east,north" decimal degrees ' +
            '(e.g. "-10.0,35.0,30.0,60.0" for Europe). ' +
            'Returns granules with spatial coverage intersecting the box.',
        ),
      day_night_flag: z
        .enum(['day', 'night', 'unspecified'])
        .optional()
        .describe(
          'Filter granules by illumination condition during acquisition: ' +
            '"day" (daylight pass), "night" (nighttime pass), or "unspecified".',
        ),
      page_size: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe('Number of granules to return per page (1–20, default 10).'),
    })
    .strip(),

  'nasa-cmr.list_providers': z
    .object({
      page_size: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe(
          'Number of providers to return (1–100, default 50). ' +
            'There are approximately 60 active NASA CMR data centers.',
        ),
    })
    .strip(),
};
