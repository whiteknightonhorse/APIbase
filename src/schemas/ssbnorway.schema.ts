import { z, type ZodSchema } from 'zod';

/**
 * Statistics Norway (SSB) PXWeb API tool schemas (UC-459).
 *
 * All fields have .describe() per Smithery quality requirements.
 */
export const ssbnorwaySchemas: Record<string, ZodSchema> = {
  'ssbnorway.search': z
    .object({
      query: z
        .string()
        .describe(
          'Keyword to search for in SSB table titles. Examples: "population", "gdp", ' +
            '"unemployment", "inflation", "energy", "immigration", "agriculture", "exports". ' +
            'Returns tables matching the keyword with IDs, titles, and publication dates.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(10)
        .describe('Maximum number of tables to return (1–50, default 10).'),
    })
    .strip(),

  'ssbnorway.metadata': z
    .object({
      table_id: z
        .string()
        .describe(
          'SSB table ID (numeric string). Obtain from ssbnorway.search results. ' +
            'Common tables: "07459" (population by region/sex/age/year), ' +
            '"09842" (GDP per capita by year), ' +
            '"05111" (labour force status by sex/age/year), ' +
            '"03013" (CPI / consumer price index by year), ' +
            '"08655" (exports/imports by product/country/year). ' +
            'Returns dimension codes and valid values required for ssbnorway.query.',
        ),
    })
    .strip(),

  'ssbnorway.query': z
    .object({
      table_id: z
        .string()
        .describe(
          'SSB table ID to query — the numeric ID from ssbnorway.search or ssbnorway.metadata. ' +
            'Example: "07459" for population, "09842" for GDP.',
        ),
      query: z
        .array(
          z
            .object({
              code: z
                .string()
                .describe(
                  'Dimension code from ssbnorway.metadata variables[].code. ' +
                    "Examples: 'Region', 'Kjonn', 'Alder', 'ContentsCode', 'Tid'.",
                ),
              selection: z
                .object({
                  filter: z
                    .string()
                    .describe(
                      "Filter type. Use 'item' to select specific values by code, " +
                        '\'top\' to select the N most recent periods (for Tid/year dimensions, e.g. values=["3"]), ' +
                        "'all' to include all values for a dimension.",
                    ),
                  values: z
                    .array(z.string())
                    .describe(
                      "Array of value codes. For filter='item': codes from ssbnorway.metadata variables[].values " +
                        '(e.g. ["0"] for \'The whole country\' in Region). ' +
                        'For filter=\'top\': a single count string like ["5"] for 5 most recent years. ' +
                        'For filter=\'all\': use ["*"].',
                    ),
                })
                .strip()
                .describe('Selection criteria for this dimension.'),
            })
            .strip()
            .describe('Filter specifying which values to include for one table dimension.'),
        )
        .describe(
          'Array of dimension filters. Each filter selects specific values for one variable. ' +
            'Unfiltered dimensions are aggregated (eliminated) if elimination=true, or omitted. ' +
            "Example: [{code:'ContentsCode',selection:{filter:'item',values:['Personer1']}}, " +
            "{code:'Tid',selection:{filter:'top',values:['3']}}]. " +
            'Response is JSON-stat2 with label, updated, dimension map, and values array.',
        ),
    })
    .strip(),

  'ssbnorway.population': z
    .object({
      region_code: z
        .string()
        .optional()
        .default('0')
        .describe(
          'Norwegian region code from SSB classification. "0" = The whole country (default). ' +
            'County codes (2024 structure): "31" Østfold, "32" Akershus, "03" Oslo, ' +
            '"33" Buskerud, "34" Innlandet, "38" Telemark, "39" Vestfold, "40" Aust-Agder, ' +
            '"42" Vest-Agder, "11" Rogaland, "46" Vestland, "15" Møre og Romsdal, ' +
            '"50" Trøndelag, "18" Nordland, "55" Troms, "56" Finnmark. ' +
            'Use ssbnorway.metadata on table 07459 for all valid municipality codes.',
        ),
      years: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .default(5)
        .describe(
          'Number of most recent years to include (1–20, default 5). ' +
            'Table 07459 covers 1986 to the current reference year.',
        ),
    })
    .strip(),
};
