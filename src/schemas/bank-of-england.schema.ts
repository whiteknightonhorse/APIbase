import { z, type ZodSchema } from 'zod';

const dailySeriesQuery = z
  .object({
    last_n: z
      .number()
      .int()
      .min(1)
      .max(1825)
      .optional()
      .describe(
        'Number of most recent calendar days to return, counting back from today (default 90, max 1825 = 5 years). This is a daily series.',
      ),
  })
  .strip();

const monthlySeriesQuery = z
  .object({
    last_n: z
      .number()
      .int()
      .min(1)
      .max(120)
      .optional()
      .describe(
        'Number of most recent months to return, counting back from the current month (default 24, max 120 = 10 years). This is a monthly series.',
      ),
  })
  .strip();

export const bankOfEnglandSchemas: Record<string, ZodSchema> = {
  'bank-of-england.bank_rate': dailySeriesQuery,
  'bank-of-england.sonia_rate': dailySeriesQuery,
  'bank-of-england.money_supply_m4': monthlySeriesQuery,
  'bank-of-england.mortgage_rate_2y_fixed': monthlySeriesQuery,
};
