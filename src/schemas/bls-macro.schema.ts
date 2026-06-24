import { z } from 'zod';

export const blsMacroSchemas: Record<string, z.ZodSchema> = {
  'bls-macro.series': z
    .object({
      series_ids: z
        .string()
        .describe(
          'Comma-separated BLS series ID(s), up to 5 (e.g. "CUUR0000SA0,LNS14000000"). Find IDs at bls.gov/data.',
        ),
      start_year: z
        .number()
        .int()
        .min(1913)
        .max(2030)
        .optional()
        .describe('First year of data to retrieve (default: current year - 2).'),
      end_year: z
        .number()
        .int()
        .min(1913)
        .max(2030)
        .optional()
        .describe(
          'Last year of data to retrieve (default: current year). Max 10-year span per BLS limits.',
        ),
    })
    .strip(),

  'bls-macro.cpi': z
    .object({
      item: z
        .enum(['all', 'food', 'energy', 'shelter', 'core'])
        .optional()
        .describe(
          'CPI category: "all" = All Items CPI-U (default), "food" = Food, "energy" = Energy, "shelter" = Shelter, "core" = All Items Less Food and Energy.',
        ),
      start_year: z
        .number()
        .int()
        .min(1913)
        .max(2030)
        .optional()
        .describe('First year of CPI data (default: current year - 4).'),
      end_year: z
        .number()
        .int()
        .min(1913)
        .max(2030)
        .optional()
        .describe('Last year of CPI data (default: current year).'),
    })
    .strip(),

  'bls-macro.unemployment': z
    .object({
      measure: z
        .enum(['rate', 'participation', 'employment_ratio', 'long_term'])
        .optional()
        .describe(
          'Labor market measure: "rate" = Unemployment Rate % (default), "participation" = Labor Force Participation Rate %, "employment_ratio" = Employment-Population Ratio %, "long_term" = Long-term Unemployed 27+ weeks (thousands).',
        ),
      start_year: z
        .number()
        .int()
        .min(1948)
        .max(2030)
        .optional()
        .describe('First year of data (default: current year - 4).'),
      end_year: z
        .number()
        .int()
        .min(1948)
        .max(2030)
        .optional()
        .describe('Last year of data (default: current year).'),
    })
    .strip(),

  'bls-macro.payrolls': z
    .object({
      industry: z
        .enum([
          'total',
          'private',
          'manufacturing',
          'construction',
          'professional',
          'healthcare',
          'retail',
          'finance',
        ])
        .optional()
        .describe(
          'Industry sector: "total" = Total Nonfarm (default), "private" = Total Private, "manufacturing", "construction", "professional" = Professional & Business Services, "healthcare" = Healthcare & Social Assistance, "retail" = Retail Trade, "finance" = Financial Activities.',
        ),
      start_year: z
        .number()
        .int()
        .min(1939)
        .max(2030)
        .optional()
        .describe('First year of payroll data (default: current year - 4).'),
      end_year: z
        .number()
        .int()
        .min(1939)
        .max(2030)
        .optional()
        .describe('Last year of payroll data (default: current year).'),
    })
    .strip(),
};
