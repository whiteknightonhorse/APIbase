import { z } from 'zod';

export const swissfsoSchemas: Record<string, z.ZodSchema> = {
  'swissfso.catalog.list': z
    .object({
      subject: z
        .string()
        .optional()
        .describe(
          'Filter by BFS subject code or name. Code examples: "01"=population, "03"=employment, ' +
            '"06"=industry, "07"=agriculture, "09"=construction, "10"=tourism, "13"=social-security, ' +
            '"14"=health, "15"=education, "21"=sustainability. Omit to list all 648 datasets.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe('Maximum number of dataset entries to return (1–200, default 50).'),
    })
    .strip(),

  'swissfso.table.metadata': z
    .object({
      database_id: z
        .string()
        .describe(
          'BFS database identifier (e.g. "px-x-0304010000_201" for monthly wages, ' +
            '"px-x-0103010000_123" for 2023 population by canton). Obtain from catalog.list.',
        ),
    })
    .strip(),

  'swissfso.table.query': z
    .object({
      database_id: z
        .string()
        .describe(
          'BFS database identifier (e.g. "px-x-0304010000_201"). ' +
            'Use catalog.list to discover IDs; table.metadata to see variable codes and values.',
        ),
      filters: z
        .array(
          z
            .object({
              code: z
                .string()
                .describe(
                  'Dimension code as returned by table.metadata (e.g. "Jahr", "Geschlecht").',
                ),
              values: z
                .array(z.string())
                .describe(
                  'Array of value codes to select (e.g. ["2024"] for year 2024, ["-1"] for totals). ' +
                    'Use value codes from table.metadata, not the human-readable labels.',
                ),
            })
            .strip()
            .describe('A dimension filter: selects specific values for one variable.'),
        )
        .optional()
        .describe(
          'Array of dimension filters. Unfiltered dimensions return all values. ' +
            'Tip: always filter time and region dimensions to keep response size manageable.',
        ),
    })
    .strip(),

  'swissfso.wages.monthly': z
    .object({
      year: z
        .string()
        .optional()
        .describe(
          'Survey year. Available: 2024, 2022, 2020, 2018, 2016, 2014, 2012. Default: 2024.',
        ),
      gender: z
        .enum(['total', 'female', 'male'])
        .optional()
        .describe('Gender filter: "total" (default), "female" (Frauen), or "male" (Männer).'),
      percentile: z
        .enum(['1', '2', '3', '4', '5'])
        .optional()
        .describe('Wage percentile: "1"=median (default), "2"=P10, "3"=P25, "4"=P75, "5"=P90.'),
    })
    .strip(),
};
