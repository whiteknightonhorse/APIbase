import { z, type ZodSchema } from 'zod';

/**
 * Statistics Sweden (SCB) PXWeb API tool schemas (UC-431).
 *
 * All fields have .describe() per Smithery quality requirements.
 * NEVER use empty z.object({}) — every tool has at least one param.
 */

export const scbSchemas: Record<string, ZodSchema> = {
  'scb.catalog': z
    .object({
      path: z
        .string()
        .optional()
        .default('')
        .describe(
          "Hierarchical path through SCB taxonomy. Empty '' gets top-level categories. " +
            "Examples: 'BE' (population), 'BE/BE0101' (population statistics tables), " +
            "'AM' (labour market), 'NR' (national accounts), 'PR' (prices/inflation), " +
            "'MI' (environment), 'HE' (household finances). " +
            'Use scb.catalog recursively to navigate until type=t (table leaf) nodes appear.',
        ),
    })
    .strip(),

  'scb.table_metadata': z
    .object({
      table_path: z
        .string()
        .describe(
          "Full path to a leaf table (type='t' from scb.catalog), e.g. " +
            "'BE/BE0101/BE0101A/BefolkningNy' (Sweden population by region/age/sex/year). " +
            "'AM/AKU/AKU01/AKU01A' (labour market, employed persons). " +
            'Returns title, dimension codes, and valid values to use in scb.table_query.',
        ),
    })
    .strip(),

  'scb.table_query': z
    .object({
      table_path: z
        .string()
        .describe(
          'Full path to the leaf table to query — same as scb.table_metadata table_path. ' +
            "Example: 'BE/BE0101/BE0101A/BefolkningNy'.",
        ),
      query: z
        .array(
          z
            .object({
              code: z
                .string()
                .describe(
                  'Dimension code from scb.table_metadata variables[].code. ' +
                    "Examples: 'Region', 'Alder', 'Kon', 'Tid', 'ContentsCode'.",
                ),
              selection: z
                .object({
                  filter: z
                    .string()
                    .describe(
                      "Filter type. Common values: 'item' (select by exact code), " +
                        "'vs:RegionRiket99' (Sweden total), " +
                        "'vs:RegionKommun07' (municipality level), " +
                        "'top' (select N most recent — use with Tid/year dimensions), " +
                        "'all' (all values). Use the valueSet codes from metadata.",
                    ),
                  values: z
                    .array(z.string())
                    .describe(
                      'Array of value codes to select. Get valid codes from scb.table_metadata variables[].values. ' +
                        "For filter='item': list codes like ['00','01']. " +
                        "For filter='top': list count like ['3'] (3 most recent). " +
                        "For filter='all': use ['*']. " +
                        "Example: Region '00' = Sweden total, Kon '1'=men '2'=women.",
                    ),
                })
                .strip()
                .describe('Selection criteria for this dimension.'),
            })
            .strip()
            .describe('Filter for one dimension (variable) in the table.'),
        )
        .describe(
          'Array of dimension filters. Each filter selects which values to include for one dimension. ' +
            "Example: [{code:'Region',selection:{filter:'vs:RegionRiket99',values:['00']}}, " +
            "{code:'ContentsCode',selection:{filter:'item',values:['BE0101N1']}}, " +
            "{code:'Tid',selection:{filter:'top',values:['1']}}]. " +
            'Response is JSON-stat2 format with dimension labels and numeric values array.',
        ),
    })
    .strip(),
};
