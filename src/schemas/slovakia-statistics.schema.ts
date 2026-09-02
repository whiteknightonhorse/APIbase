import { z, type ZodSchema } from 'zod';

// ---------------------------------------------------------------------------
// slovakia-statistics.dataset_search — browse/search the 675 DATAcube tables
// ---------------------------------------------------------------------------

const slovakiaStatisticsDatasetSearch = z
  .object({
    query: z
      .string()
      .optional()
      .describe(
        'Substring to search across table labels and cube codes, case-insensitive (e.g. ' +
          '"population", "earnings", "GDP"). Omit to list tables from the start of the catalog ' +
          '(675 tables total, no full-text search endpoint upstream — filtered client-side).',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Max tables to return (1-100, default 50).'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Number of matching tables to skip, for paging through results (default 0).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// slovakia-statistics.dataset_metadata — dimensions + value codes for one table
// ---------------------------------------------------------------------------

const slovakiaStatisticsDatasetMetadata = z
  .object({
    cube_code: z
      .string()
      .describe(
        'Table code from slovakia-statistics.dataset_search (e.g. "as1001rs" for "Population ' +
          'and attributes of age").',
      ),
  })
  .strip();

// ---------------------------------------------------------------------------
// slovakia-statistics.dataset_data — fetch data rows for one table + selection
// ---------------------------------------------------------------------------

const slovakiaStatisticsDatasetData = z
  .object({
    cube_code: z
      .string()
      .describe(
        'Table code from slovakia-statistics.dataset_search (e.g. "as1001rs" for "Population ' +
          'and attributes of age").',
      ),
    selections: z
      .record(z.string(), z.string())
      .describe(
        'One value per dimension of this table — get the dimension codes and valid value codes ' +
          'from slovakia-statistics.dataset_metadata first. Every dimension of the table must be ' +
          'present. Each value may be a single code ("2024"), a comma list ("2016,2017,2018"), a ' +
          'range ("2010:2015", "2010:", ":2015"), "lastN" (e.g. "last5" for the 5 most recent), ' +
          'or a "*" wildcard (e.g. "SK04*"). Example: {"as1001rs_rok": "2024", ' +
          '"as1001rs_ukaz": "UKAZ01", "as1001rs_poh": "TOTAL"}.',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Max data rows to return (1-1000, default 200).'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Number of data rows to skip, for paging through a large selection (default 0).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// Export map
// ---------------------------------------------------------------------------

export const slovakiaStatisticsSchemas: Record<string, ZodSchema> = {
  'slovakia-statistics.dataset_search': slovakiaStatisticsDatasetSearch,
  'slovakia-statistics.dataset_metadata': slovakiaStatisticsDatasetMetadata,
  'slovakia-statistics.dataset_data': slovakiaStatisticsDatasetData,
};
