import { z, type ZodSchema } from 'zod';

// ---------------------------------------------------------------------------
// hungary-ksh.dataset_search — browse/search the 13 HVD datasets
// ---------------------------------------------------------------------------

const hungaryKshDatasetSearch = z
  .object({
    query: z
      .string()
      .optional()
      .describe(
        'Substring to search across Hungarian + English titles, keywords, and themes, ' +
          'case-insensitive (e.g. "population", "GDP", "tourism"). Omit to list all 13 High-Value ' +
          'Datasets (KSH publishes exactly these 13, no more — this is the full EU-mandated HVD ' +
          'category list, not a paginated catalog).',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(13)
      .optional()
      .describe('Max datasets to return (1-13, default 13).'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Number of matching datasets to skip (default 0).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// hungary-ksh.dataset_metadata — full metadata + distribution list for one dataset
// ---------------------------------------------------------------------------

const hungaryKshDatasetMetadata = z
  .object({
    dataset_id: z
      .string()
      .describe(
        'KSH dataset UUID, from hungary-ksh.dataset_search (e.g. ' +
          '"f44d314b-bc27-40a7-b34e-af01b3c4ab05" for Population).',
      ),
  })
  .strip();

// ---------------------------------------------------------------------------
// hungary-ksh.dataset_data — fetch + filter one distribution's rows (CSV or SDMX-ML)
// ---------------------------------------------------------------------------

const hungaryKshDatasetData = z
  .object({
    dataset_id: z
      .string()
      .describe(
        'KSH dataset UUID, from hungary-ksh.dataset_search (e.g. ' +
          '"f44d314b-bc27-40a7-b34e-af01b3c4ab05" for Population).',
      ),
    distribution_id: z
      .string()
      .describe(
        "Distribution UUID, from hungary-ksh.dataset_metadata's distributions list (e.g. " +
          '"eb3e481e-6b5a-45d1-8076-18c4ece155c2"). Each distribution is one CSV or SDMX-ML data ' +
          'file for a specific breakdown of the dataset (e.g. population by region vs. by ' +
          'citizenship) — call dataset_metadata first to see which one you need.',
      ),
    filter_column: z
      .string()
      .optional()
      .describe(
        'Column name to filter on, must match a column in the header returned by this same tool ' +
          '(column names vary per distribution, e.g. "GEO" for region, "TIME" for year, "SEX" for ' +
          'sex code) — call once without a filter to see the header first. Requires filter_value.',
      ),
    filter_value: z
      .string()
      .optional()
      .describe(
        'Substring to match (case-insensitive) against filter_column\'s value, e.g. "HU11" when ' +
          'filter_column is "GEO". Required when filter_column is set.',
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

export const hungaryKshSchemas: Record<string, ZodSchema> = {
  'hungary-ksh.dataset_search': hungaryKshDatasetSearch,
  'hungary-ksh.dataset_metadata': hungaryKshDatasetMetadata,
  'hungary-ksh.dataset_data': hungaryKshDatasetData,
};
