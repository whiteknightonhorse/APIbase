import { z, type ZodSchema } from 'zod';

/**
 * Statistics Estonia (Statistikaamet) PXWeb API tool schemas (UC-670).
 *
 * All fields have .describe() per Smithery quality requirements.
 * NEVER use empty z.object({}) — every tool has at least one param.
 */

export const estoniaStatisticsSchemas: Record<string, ZodSchema> = {
  'estonia-statistics.catalog': z
    .object({
      path: z
        .string()
        .optional()
        .default('')
        .describe(
          "Hierarchical path through the Estonia statistics taxonomy. Empty '' gets the " +
            "top-level databases: 'keskkond' (environment), 'majandus' (economy), " +
            "'rahvastik' (population), 'sotsiaalelu' (social life), " +
            "'eri-valdkondade-statistika' (multidomain statistics), 'rahvaloendus' " +
            "(population and housing census), 'Lepetatud_tabelid' (discontinued datasets). " +
            'Use estonia-statistics.catalog recursively to navigate until type=t (table leaf) nodes appear.',
        ),
    })
    .strip(),

  'estonia-statistics.table_metadata': z
    .object({
      table_path: z
        .string()
        .describe(
          "Full path to a leaf table (type='t' from estonia-statistics.catalog), e.g. " +
            "'rahvastik/rahvastikunaitajad-ja-koosseis/demograafilised-pehinaitajad/RV030.PX' " +
            '(births, deaths and natural increase). Returns title, dimension codes, and valid ' +
            'values to use in estonia-statistics.table_query.',
        ),
    })
    .strip(),

  'estonia-statistics.table_query': z
    .object({
      table_path: z
        .string()
        .describe(
          'Full path to the leaf table to query — same as estonia-statistics.table_metadata ' +
            "table_path. Example: 'rahvastik/rahvastikunaitajad-ja-koosseis/" +
            "demograafilised-pehinaitajad/RV030.PX'.",
        ),
      query: z
        .array(
          z
            .object({
              code: z
                .string()
                .describe(
                  'Dimension code from estonia-statistics.table_metadata variables[].code. ' +
                    "Examples: 'Aasta' (year), 'Näitaja' (indicator). Dimension codes are " +
                    'frequently Estonian words with non-ASCII characters — copy them exactly ' +
                    'as returned by table_metadata.',
                ),
              selection: z
                .object({
                  filter: z
                    .string()
                    .describe(
                      "Filter type. Common values: 'item' (select by exact code), " +
                        "'top' (select N most recent — use with time dimensions like 'Aasta'), " +
                        "'all' (all values). Use the valueSet codes from metadata.",
                    ),
                  values: z
                    .array(z.string())
                    .describe(
                      'Array of value codes to select. Get valid codes from ' +
                        'estonia-statistics.table_metadata variables[].values. ' +
                        "For filter='item': list codes like ['1']. " +
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
            "dimension. Example: [{code:'Aasta',selection:{filter:'top',values:['3']}}, " +
            "{code:'Näitaja',selection:{filter:'item',values:['1','2','3']}}]. " +
            'Response is JSON-stat2 format with dimension labels and numeric values array.',
        ),
    })
    .strip(),
};
