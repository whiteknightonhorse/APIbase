import { z, type ZodSchema } from 'zod';

/**
 * Statistics Iceland (Hagstofa Íslands) PXWeb API tool schemas (UC-669).
 *
 * All fields have .describe() per Smithery quality requirements.
 * NEVER use empty z.object({}) — every tool has at least one param.
 */

export const icelandStatisticsSchemas: Record<string, ZodSchema> = {
  'iceland-statistics.catalog': z
    .object({
      path: z
        .string()
        .optional()
        .default('')
        .describe(
          "Hierarchical path through the Iceland statistics taxonomy. Empty '' gets the " +
            "top-level databases: 'Atvinnuvegir' (industries/sectors: fisheries, agriculture, " +
            "tourism), 'Efnahagur' (economy: prices, national accounts, public finance, trade), " +
            "'Ibuar' (population: migration, births/deaths, family, elections, census), " +
            "'Samfelag' (society: labour market, education, wages, health, culture, justice), " +
            "'Umhverfi' (environment: land, air quality, energy, transport). " +
            'Use iceland-statistics.catalog recursively to navigate until type=t (table leaf) nodes appear.',
        ),
    })
    .strip(),

  'iceland-statistics.table_metadata': z
    .object({
      table_path: z
        .string()
        .describe(
          "Full path to a leaf table (type='t' from iceland-statistics.catalog), e.g. " +
            "'Ibuar/mannfjoldi/1_yfirlit/yfirlit_mannfjolda/MAN00000.px' (population key figures " +
            'since 1703). Returns title, dimension codes, and valid values to use in ' +
            'iceland-statistics.table_query.',
        ),
    })
    .strip(),

  'iceland-statistics.table_query': z
    .object({
      table_path: z
        .string()
        .describe(
          'Full path to the leaf table to query — same as iceland-statistics.table_metadata ' +
            "table_path. Example: 'Ibuar/mannfjoldi/1_yfirlit/yfirlit_mannfjolda/MAN00000.px'.",
        ),
      query: z
        .array(
          z
            .object({
              code: z
                .string()
                .describe(
                  'Dimension code from iceland-statistics.table_metadata variables[].code. ' +
                    "Examples: 'Ár' (year), 'Eining' (unit). Dimension codes are frequently " +
                    'Icelandic words with non-ASCII characters — copy them exactly as returned ' +
                    'by table_metadata.',
                ),
              selection: z
                .object({
                  filter: z
                    .string()
                    .describe(
                      "Filter type. Common values: 'item' (select by exact code), " +
                        "'top' (select N most recent — use with time dimensions like 'Ár'), " +
                        "'all' (all values). Use the valueSet codes from metadata.",
                    ),
                  values: z
                    .array(z.string())
                    .describe(
                      'Array of value codes to select. Get valid codes from ' +
                        'iceland-statistics.table_metadata variables[].values. ' +
                        "For filter='item': list codes like ['0']. " +
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
            "dimension. Example: [{code:'Ár',selection:{filter:'top',values:['3']}}, " +
            "{code:'Eining',selection:{filter:'item',values:['0']}}]. " +
            'Response is JSON-stat2 format with dimension labels and numeric values array.',
        ),
    })
    .strip(),
};
