import { z, type ZodSchema } from 'zod';

// ---------------------------------------------------------------------------
// czso.dataset_list — browse the CZSO open-data catalog (no full-text search)
// ---------------------------------------------------------------------------

const czsoDatasetList = z
  .object({
    id_prefix: z
      .string()
      .optional()
      .describe(
        'Filter dataset ids by substring, case-insensitive (e.g. "13014" for population-movement ' +
          'series, "sldb2021" for the 2021 census). CZSO has no full-text search — omit to page ' +
          'through the full ~1000-dataset catalog with offset/limit.',
      ),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Number of matching dataset ids to skip (default 0). For paging through results.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe('Max datasets to return with title + coverage attached (1-20, default 10).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// czso.dataset_metadata — full metadata + resource list for one dataset
// ---------------------------------------------------------------------------

const czsoDatasetMetadata = z
  .object({
    dataset_id: z
      .string()
      .min(1)
      .describe(
        'CZSO dataset id, from czso.dataset_list (e.g. "130141r25" for 2024 population movement, ' +
          '"010022" for consumer price indices).',
      ),
  })
  .strip();

// ---------------------------------------------------------------------------
// czso.dataset_data — fetch + filter a dataset's CSV rows
// ---------------------------------------------------------------------------

const czsoDatasetData = z
  .object({
    dataset_id: z
      .string()
      .min(1)
      .describe(
        'CZSO dataset id, from czso.dataset_list (e.g. "130141r25" for 2024 population movement).',
      ),
    filter_column: z
      .string()
      .optional()
      .describe(
        'Column name to filter on, must match a column in the CSV header returned by this same ' +
          'tool (column names vary per dataset, e.g. "vuzemi_txt" for territory name, "rok" for ' +
          'year, "vuk" for indicator code) — call once without a filter to see the header first. ' +
          'Requires filter_value.',
      ),
    filter_value: z
      .string()
      .optional()
      .describe(
        'Substring to match (case-insensitive) against filter_column\'s value, e.g. "Praha" when ' +
          'filter_column is "vuzemi_txt". Required when filter_column is set.',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe('Max rows to return after filtering (1-500, default 50).'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Number of matching rows to skip, for paging through a large filtered result.'),
  })
  .strip();

// ---------------------------------------------------------------------------
// Export map
// ---------------------------------------------------------------------------

export const czsoSchemas: Record<string, ZodSchema> = {
  'czso.dataset_list': czsoDatasetList,
  'czso.dataset_metadata': czsoDatasetMetadata,
  'czso.dataset_data': czsoDatasetData,
};
