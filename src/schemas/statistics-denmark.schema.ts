import { z, type ZodSchema } from 'zod';

/**
 * Statistics Denmark (StatBank) API tool schemas (UC-594).
 *
 * All fields have .describe() per Smithery quality requirements.
 */
export const statisticsDenmarkSchemas: Record<string, ZodSchema> = {
  'statistics-denmark.subjects': z
    .object({
      recursive: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          'If true, return the full nested subject tree down to leaf topics ' +
            '(e.g. People → Population → Population figures). If false (default), ' +
            'return only the 10 top-level subject areas (People, Labour and income, Economy, ' +
            'Social conditions, Education and research, Business, Transport, Culture and leisure, ' +
            'Environment and energy, About Statistics Denmark).',
        ),
    })
    .strip(),

  'statistics-denmark.tables': z
    .object({
      query: z
        .string()
        .optional()
        .describe(
          'Keyword to search for in StatBank table titles. Examples: "population", "gdp", ' +
            '"unemployment", "inflation", "immigration", "housing", "energy", "crime". ' +
            'Omit to list all 2,000+ active tables (large response).',
        ),
      subjects: z
        .string()
        .optional()
        .describe(
          'Comma-separated subject area ID(s) to scope the listing (from statistics-denmark.subjects), ' +
            'e.g. "1" for People, "3" for Economy. Optional — combine with or omit query.',
        ),
    })
    .strip(),

  'statistics-denmark.table_info': z
    .object({
      table_id: z
        .string()
        .describe(
          'StatBank table ID (short alphanumeric code). Obtain from statistics-denmark.tables. ' +
            'Common tables: "FOLK1A" (population by region/sex/age/marital status, quarterly), ' +
            '"BEFOLK1" (population by sex/age, annual since 1971), ' +
            '"AKU1" (labour force survey), "NAN1" (GDP and national accounts), ' +
            '"PRIS111" (consumer price index), "FORBRUG1" (household consumption). ' +
            'Returns dimension codes and valid value codes needed for statistics-denmark.data.',
        ),
    })
    .strip(),

  'statistics-denmark.data': z
    .object({
      table_id: z
        .string()
        .describe(
          'StatBank table ID to query — from statistics-denmark.tables or statistics-denmark.table_info. ' +
            'Example: "FOLK1A" for quarterly population.',
        ),
      variables: z
        .array(
          z
            .object({
              code: z
                .string()
                .describe(
                  'Dimension code from statistics-denmark.table_info variables[].code. ' +
                    'Examples: "OMRÅDE" (region), "KØN" (sex), "ALDER" (age), "Tid" (time).',
                ),
              values: z
                .array(z.string())
                .describe(
                  'Value codes to select for this dimension, from statistics-denmark.table_info ' +
                    'variables[].values[].id. Use ["*"] to select all values for the dimension, ' +
                    'or ["000"] etc. for a specific code. For the time dimension use specific period ' +
                    'codes (e.g. ["2026K3"] for a quarter, ["2026"] for a year) or ["*"] for the full series.',
                ),
            })
            .strip()
            .describe('Selected value codes for one table dimension.'),
        )
        .min(1)
        .describe(
          'Array of dimension filters. Any dimension left out is auto-eliminated (aggregated to its ' +
            'default/total value) by StatBank — include a dimension only when you need to filter or ' +
            'break out by it. Example: [{code:"OMRÅDE",values:["000"]},{code:"KØN",values:["TOT"]},' +
            '{code:"ALDER",values:["IALT"]},{code:"CIVILSTAND",values:["TOT"]},{code:"Tid",values:["*"]}]. ' +
            'Response is a JSON-stat dataset with dimension labels and a flat value array.',
        ),
    })
    .strip(),
};
