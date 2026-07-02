import { z } from 'zod';

export const statfinSchemas: Record<string, z.ZodSchema> = {
  'statfin.consumer_price_index': z
    .object({
      months: z
        .number()
        .int()
        .min(1)
        .max(120)
        .optional()
        .describe(
          'Number of recent months to return (1–120, default 12). E.g. 12 returns the last 12 months.',
        ),
      base_year: z
        .enum([
          '1972',
          '1977',
          '1981',
          '1985',
          '1990',
          '1995',
          '2000',
          '2005',
          '2010',
          '2015',
          '2025',
        ])
        .optional()
        .describe(
          'Index base year (default "2015"). The CPI value equals 100 in the chosen base year. ' +
            'Available bases: 1972, 1977, 1981, 1985, 1990, 1995, 2000, 2005, 2010, 2015, 2025.',
        ),
    })
    .strip(),

  'statfin.population': z
    .object({
      years: z
        .number()
        .int()
        .min(1)
        .max(276)
        .optional()
        .describe(
          'Number of recent years to return (1–276, default 10). ' +
            'Finland population records go back to 1750.',
        ),
      sex: z
        .enum(['total', 'male', 'female'])
        .optional()
        .describe(
          'Sex filter (default "total"). "total" returns combined population; "male"/"female" splits by sex.',
        ),
    })
    .strip(),

  'statfin.unemployment': z
    .object({
      months: z
        .number()
        .int()
        .min(1)
        .max(220)
        .optional()
        .describe(
          'Number of recent months to return (1–220, default 12). ' +
            'Data available from 2008M01 onwards.',
        ),
    })
    .strip(),

  'statfin.table_search': z
    .object({
      category: z
        .string()
        .min(2)
        .max(20)
        .describe(
          'StatFin category code to list tables for. Examples: "khi" (consumer prices), ' +
            '"vaerak" (population), "tyonv" (unemployment/job seekers), "synt" (births), ' +
            '"adopt" (adoptions), "matk" (accommodation), "ilma" (air transport), ' +
            '"kans" (citizenships), "kbar" (consumer confidence), "rki" (building cost index). ' +
            'Returns all tables available in that statistical category.',
        ),
    })
    .strip(),
};
