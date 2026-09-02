import { z, type ZodSchema } from 'zod';

/**
 * Central Statistical Bureau of Latvia PXWeb API tool schemas (UC-668).
 *
 * All fields have .describe() per Smithery quality requirements.
 * NEVER use empty z.object({}) — every tool has at least one param.
 */

export const latviaStatisticsSchemas: Record<string, ZodSchema> = {
  'latvia-statistics.catalog': z
    .object({
      path: z
        .string()
        .optional()
        .default('')
        .describe(
          "Hierarchical path through the Latvia statistics taxonomy. Empty '' gets top-level " +
            "categories. Examples: 'POP' (population), 'EMP' (labour market), " +
            "'VES' (social security and health), 'IZG' (education, culture and science), " +
            "'VEK' (economy), 'TIR' (trade and services), 'ENT' (business), " +
            "'IKT' (information technologies), 'ENV' (environment), " +
            "'FIN' (indicators of well-being and equality). " +
            'Use latvia-statistics.catalog recursively to navigate until type=t (table leaf) nodes appear.',
        ),
    })
    .strip(),

  'latvia-statistics.table_metadata': z
    .object({
      table_path: z
        .string()
        .describe(
          "Full path to a leaf table (type='t' from latvia-statistics.catalog), e.g. " +
            "'POP/IR/IRS/IRS010' (population at the beginning of year, key vital statistics). " +
            'Returns title, dimension codes, and valid values to use in latvia-statistics.table_query.',
        ),
    })
    .strip(),

  'latvia-statistics.table_query': z
    .object({
      table_path: z
        .string()
        .describe(
          'Full path to the leaf table to query — same as latvia-statistics.table_metadata ' +
            "table_path. Example: 'POP/IR/IRS/IRS010'.",
        ),
      query: z
        .array(
          z
            .object({
              code: z
                .string()
                .describe(
                  'Dimension code from latvia-statistics.table_metadata variables[].code. ' +
                    "Examples: 'INDICATOR', 'ContentsCode', 'TIME'.",
                ),
              selection: z
                .object({
                  filter: z
                    .string()
                    .describe(
                      "Filter type. Common values: 'item' (select by exact code), " +
                        "'top' (select N most recent — use with TIME/year dimensions), " +
                        "'all' (all values). Use the valueSet codes from metadata.",
                    ),
                  values: z
                    .array(z.string())
                    .describe(
                      'Array of value codes to select. Get valid codes from ' +
                        'latvia-statistics.table_metadata variables[].values. ' +
                        "For filter='item': list codes like ['POP_SY']. " +
                        "For filter='top': list count like ['3'] (3 most recent years). " +
                        "For filter='all': use ['*'].",
                    ),
                })
                .strip()
                .describe('Selection criteria for this dimension.'),
            })
            .strip()
            .describe('Filter for one dimension (variable) in the table.'),
        )
        .describe(
          'Array of dimension filters. Each filter selects which values to include for one ' +
            "dimension. Example: [{code:'INDICATOR',selection:{filter:'item',values:['POP_SY']}}, " +
            "{code:'ContentsCode',selection:{filter:'item',values:['IRS010']}}, " +
            "{code:'TIME',selection:{filter:'top',values:['1']}}]. " +
            'Response is JSON-stat2 format with dimension labels and numeric values array.',
        ),
    })
    .strip(),
};
