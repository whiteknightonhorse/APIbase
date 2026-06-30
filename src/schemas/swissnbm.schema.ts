import { z } from 'zod';

export const swissnbmSchemas: Record<string, z.ZodSchema> = {
  'swissnbm.fx_rates': z
    .object({
      period: z
        .enum(['monthly_avg', 'end_of_month'])
        .optional()
        .describe(
          'Rate type: "monthly_avg" for monthly average (default) or "end_of_month" for end-of-month fixing.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(120)
        .optional()
        .describe(
          'Number of most recent monthly observations to return per currency (1–120, default 24).',
        ),
    })
    .strip(),

  'swissnbm.policy_rate': z
    .object({
      limit: z
        .number()
        .int()
        .min(1)
        .max(365)
        .optional()
        .describe(
          'Number of most recent daily observations to return per rate series (1–365, default 90).',
        ),
    })
    .strip(),

  'swissnbm.saron_rates': z
    .object({
      limit: z
        .number()
        .int()
        .min(1)
        .max(365)
        .optional()
        .describe(
          'Number of most recent daily observations to return per SARON series (1–365, default 90).',
        ),
    })
    .strip(),

  'swissnbm.monetary_aggregates': z
    .object({
      level_type: z
        .enum(['level', 'change'])
        .optional()
        .describe(
          'Data type: "level" for absolute CHF million values (default) or "change" for period-over-period percent change.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(120)
        .optional()
        .describe(
          'Number of most recent monthly observations to return per aggregate (1–120, default 24).',
        ),
    })
    .strip(),
};
