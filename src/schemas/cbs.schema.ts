import { z, type ZodSchema } from 'zod';

/**
 * Statistics Netherlands (CBS) OData v3 API tool schemas (UC-432).
 *
 * All fields have .describe() per Smithery quality requirements.
 * NEVER use empty z.object({}) — every tool has at least one param.
 */

export const cbsSchemas: Record<string, ZodSchema> = {
  'cbs.catalog_search': z
    .object({
      query: z
        .string()
        .describe(
          'Search keyword to match against table Title or ShortDescription. ' +
            "Examples: 'population' (bevolking tables), 'inflation' (CPI/prices), " +
            "'unemployment' (werkloosheid), 'wages' (lonen), 'energy' (energie), " +
            "'housing' (woningen), 'GDP' (bbp/national accounts), 'births' (geboorte). " +
            'Returns matching CBS statistical tables with their Identifier codes.',
        ),
      top: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(25)
        .describe(
          'Maximum number of matching tables to return (1-100, default 25). ' +
            'Use a higher value (50-100) for broad keyword searches to see more results.',
        ),
    })
    .strip(),

  'cbs.table_metadata': z
    .object({
      table_id: z
        .string()
        .describe(
          "CBS table identifier (alphanumeric, e.g. '85619NED' for population statistics, " +
            "'83765NED' for consumer price index, '82931NED' for labour force). " +
            'Get identifiers from cbs.catalog_search results (Identifier field). ' +
            'Returns title, period coverage, frequency, and modification date.',
        ),
    })
    .strip(),

  'cbs.table_data': z
    .object({
      table_id: z
        .string()
        .describe(
          "CBS table identifier (alphanumeric, e.g. '85619NED'). " +
            'Get from cbs.catalog_search or cbs.table_metadata.',
        ),
      top: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .default(100)
        .describe(
          'Maximum rows to return (1-1000, default 100). Use lower values for exploration, ' +
            'higher values to retrieve complete datasets.',
        ),
      skip: z
        .number()
        .int()
        .min(0)
        .optional()
        .default(0)
        .describe(
          'Number of rows to skip for pagination (default 0). ' +
            'Use in combination with top to paginate through large datasets.',
        ),
      filter: z
        .string()
        .optional()
        .describe(
          'OData v3 \\$filter expression to subset rows. Examples: ' +
            '"Geslacht eq \'T001038\'" (gender = total), ' +
            '"Perioden eq \'2023JJ00\'" (year 2023), ' +
            '"RegioS eq \'NL01  \'" (Netherlands total). ' +
            'Column names and valid values differ per table — use cbs.table_metadata to discover them.',
        ),
    })
    .strip(),
};
