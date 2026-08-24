import { z, type ZodSchema } from 'zod';

const baseQuery = z
  .object({
    startyear: z
      .number()
      .int()
      .optional()
      .describe('Earliest year to include (e.g. 2015). Omit to return the full available history.'),
    endyear: z
      .number()
      .int()
      .optional()
      .describe('Latest year to include (e.g. 2025). Omit to return the full available history.'),
    language: z
      .enum(['en', 'de'])
      .optional()
      .describe('Response language for labels — "en" (default) or "de".'),
  })
  .strip();

export const destatisSchemas: Record<string, ZodSchema> = {
  'destatis.gdp': baseQuery,
  'destatis.population': baseQuery,
  'destatis.prices': baseQuery,
  'destatis.trade': baseQuery,
};
