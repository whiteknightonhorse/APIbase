import { z, type ZodSchema } from 'zod';

const catalogSearch = z
  .object({
    query: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Keyword to search in CBS table titles and descriptions (e.g. "population", "unemployment", "gdp"). Leave empty to list the most recently updated tables.',
      ),
    frequency: z
      .enum(['Perjaar', 'Kwartaal', 'Maand', 'Onregelmatig'])
      .optional()
      .describe(
        'Filter by publication frequency: Perjaar (annual), Kwartaal (quarterly), Maand (monthly), Onregelmatig (irregular).',
      ),
    language: z
      .enum(['nl', 'en'])
      .optional()
      .describe(
        'Filter by language of the table metadata: nl (Dutch, default) or en (English). English tables are a subset.',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of results to return (1–50, default 10).'),
    skip: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Number of results to skip for pagination (default 0).'),
  })
  .strip();

const tableInfo = z
  .object({
    table_id: z
      .string()
      .min(1)
      .describe(
        'CBS table identifier returned by catalog_search (e.g. "83583NED", "37556"). Used to retrieve metadata about a specific statistical dataset.',
      ),
  })
  .strip();

const tableProperties = z
  .object({
    table_id: z
      .string()
      .min(1)
      .describe(
        'CBS table identifier (e.g. "83583NED"). Returns the column schema (keys, types, titles, units) so you know which fields to use in table_data queries.',
      ),
  })
  .strip();

const tableData = z
  .object({
    table_id: z
      .string()
      .min(1)
      .describe(
        'CBS table identifier (e.g. "83583NED"). Use catalog_search to find a table, then table_properties to discover its columns.',
      ),
    filter: z
      .string()
      .optional()
      .describe(
        "OData $filter expression to narrow results (e.g. \"Perioden eq '2023JJ00'\" for annual 2023 data, or \"RegioS eq 'NL00  '\" for national totals). Use values from the table's dimension endpoints.",
      ),
    select: z
      .string()
      .optional()
      .describe(
        'Comma-separated list of columns to include (e.g. "Perioden, RegioS, Bevolking_1"). Reduces response size for wide tables. Omit to return all columns.',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of data records to return (1–100, default 10).'),
    skip: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Number of records to skip for pagination (default 0).'),
  })
  .strip();

export const cbsNetherlandsSchemas: Record<string, ZodSchema> = {
  'cbs.catalog_search': catalogSearch,
  'cbs.table_info': tableInfo,
  'cbs.table_properties': tableProperties,
  'cbs.table_data': tableData,
};
