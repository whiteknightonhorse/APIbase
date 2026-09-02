import { z, type ZodSchema } from 'zod';

// ---------------------------------------------------------------------------
// statistik-austria.dataset_search — browse/search the ~540-dataset catalog
// ---------------------------------------------------------------------------

const statistikAustriaDatasetSearch = z
  .object({
    search: z
      .string()
      .optional()
      .describe(
        'Filter datasets by substring, case-insensitive, matched against title and dataset_id ' +
          '(e.g. "Bevölkerung" for population datasets, "veste309" for the earnings-structure ' +
          'survey). Statistik Austria has no full-text search API — omit to page through the ' +
          'full ~540-dataset catalog with offset/limit.',
      ),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Number of matching datasets to skip (default 0). For paging through results.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Max datasets to return (1-50, default 20).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// statistik-austria.dataset_metadata — full metadata for one dataset
// ---------------------------------------------------------------------------

const statistikAustriaDatasetMetadata = z
  .object({
    dataset_id: z
      .string()
      .min(1)
      .describe(
        'Statistik Austria dataset id, from statistik-austria.dataset_search (e.g. ' +
          '"OGD_veste309_Veste309_1" for the 2018 earnings-structure survey, ' +
          '"OGD_konjunkturmonitor_KonMon_1" for the economic-monitor series).',
      ),
  })
  .strip();

// ---------------------------------------------------------------------------
// statistik-austria.dataset_data — fetch a dataset's CSV rows
// ---------------------------------------------------------------------------

const statistikAustriaDatasetData = z
  .object({
    dataset_id: z
      .string()
      .min(1)
      .describe(
        'Statistik Austria dataset id, from statistik-austria.dataset_search (e.g. ' +
          '"OGD_konjunkturmonitor_KonMon_1").',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe('Max rows to return (1-200, default 20).'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Number of rows to skip, for paging through a large dataset.'),
  })
  .strip();

// ---------------------------------------------------------------------------
// statistik-austria.category_codes — decode one categorical dimension's codes
// ---------------------------------------------------------------------------

const statistikAustriaCategoryCodes = z
  .object({
    dataset_id: z
      .string()
      .min(1)
      .describe(
        'Statistik Austria dataset id, from statistik-austria.dataset_search (e.g. ' +
          '"OGD_veste309_Veste309_1").',
      ),
    dimension_code: z
      .string()
      .min(1)
      .describe(
        "Categorical column code to decode, from statistik-austria.dataset_metadata's " +
          'category_dimensions list (format "C-{NAME}-{N}", e.g. "C-STAATS-0" for citizenship, ' +
          '"C-VEBDL-0" for federal state). Columns starting with "F-" are numeric measures with ' +
          'no code lookup.',
      ),
  })
  .strip();

// ---------------------------------------------------------------------------
// Export map
// ---------------------------------------------------------------------------

export const statistikAustriaSchemas: Record<string, ZodSchema> = {
  'statistik-austria.dataset_search': statistikAustriaDatasetSearch,
  'statistik-austria.dataset_metadata': statistikAustriaDatasetMetadata,
  'statistik-austria.dataset_data': statistikAustriaDatasetData,
  'statistik-austria.category_codes': statistikAustriaCategoryCodes,
};
