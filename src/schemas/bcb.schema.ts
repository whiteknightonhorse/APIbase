import { z, type ZodSchema } from 'zod';

const seriesQuery = z
  .object({
    last_n: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe(
        'Number of most recent observations to return (default 30, max 500). For daily series this is days; for monthly (IPCA) it is months.',
      ),
  })
  .strip();

export const bcbSchemas: Record<string, ZodSchema> = {
  'bcb.selic': seriesQuery,
  'bcb.cdi': seriesQuery,
  'bcb.ipca': seriesQuery,
  'bcb.usd_brl': seriesQuery,
  'bcb.eur_brl': seriesQuery,
  'bcb.selic_target': seriesQuery,
};
