import { z } from 'zod';

export const treasuryfiscalSchemas: Record<string, z.ZodSchema> = {
  'treasuryfiscal.debt.current': z
    .object({
      days: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe(
          'Number of most-recent daily records to return (1–100). Default 1 returns only the latest date. ' +
            'The national debt is updated each business day by the US Treasury.',
        ),
    })
    .strip(),

  'treasuryfiscal.rates.interest': z
    .object({
      security_type: z
        .enum(['marketable', 'non-marketable', 'all'])
        .optional()
        .describe(
          'Filter by security type. "marketable" = T-Bills, T-Notes, T-Bonds, TIPS, FRN; ' +
            '"non-marketable" = Savings Bonds, Government Account Series, State/Local securities; ' +
            '"all" (default) returns both types. US Treasury reports rates monthly.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe(
          'Maximum number of records to return (1–200). Default 30. Each monthly report contains ' +
            'about 15 rows (one per security type), so limit=30 typically covers the 2 most recent months.',
        ),
    })
    .strip(),

  'treasuryfiscal.yield.quarterly': z
    .object({
      limit: z
        .number()
        .int()
        .min(1)
        .max(40)
        .optional()
        .describe(
          'Number of quarterly yield records to return (1–40). Default 8 returns 2 years of data. ' +
            'Each record covers one fiscal quarter. Yield is expressed as an annual percentage.',
        ),
    })
    .strip(),

  'treasuryfiscal.debt.expense': z
    .object({
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe(
          'Maximum number of records to return (1–200). Default 20. Each monthly report contains ' +
            'multiple rows — one per security type (T-Notes, T-Bonds, TIPS, FRN, Bills, Savings Bonds, etc.). ' +
            'Set limit=50 to get roughly one month of all line items.',
        ),
    })
    .strip(),
};
