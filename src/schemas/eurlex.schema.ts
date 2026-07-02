import { z, type ZodSchema } from 'zod';

const search = z
  .object({
    keyword: z
      .string()
      .describe(
        'English keyword to search for in EU legislation titles ' +
          '(e.g. "artificial intelligence", "GDPR", "carbon border adjustment")',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe('Maximum number of results to return (1–20, default 10)'),
    from_date: z
      .string()
      .optional()
      .describe(
        'Restrict results to legislation published on or after this date in YYYY-MM-DD format ' +
          '(e.g. "2020-01-01"). Omit for all dates.',
      ),
  })
  .strip();

const recent = z
  .object({
    days: z
      .number()
      .int()
      .min(1)
      .max(365)
      .optional()
      .describe(
        'Look back this many days for recently published EU legislation (1–365, default 30)',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe('Maximum number of results to return (1–20, default 10)'),
  })
  .strip();

const detail = z
  .object({
    celex: z
      .string()
      .describe(
        'CELEX identifier of the EU legal act to retrieve ' +
          '(e.g. "32024R1689" for the EU AI Act, "32016R0679" for GDPR, "32023R1115" for EU Deforestation Regulation). ' +
          'Format: sector digit (3 = secondary legislation) + 4-digit year + type letter ' +
          '(R=Regulation, L=Directive, D=Decision) + sequential number.',
      ),
  })
  .strip();

const byType = z
  .object({
    doc_type: z
      .enum(['regulation', 'directive', 'decision'])
      .describe(
        'Type of EU legislative act: ' +
          '"regulation" (directly applicable in all EU member states), ' +
          '"directive" (binding on objectives, member states choose implementation means), ' +
          '"decision" (binding on specific addressees)',
      ),
    from_year: z
      .number()
      .int()
      .min(1950)
      .max(2030)
      .optional()
      .describe(
        'Only return legislation from this year onwards (e.g. 2020). ' +
          'Omit to retrieve the most recent across all years.',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe('Maximum number of results to return (1–20, default 10)'),
  })
  .strip();

export const eurLexSchemas: Record<string, ZodSchema> = {
  'eurlex.legislation.search': search,
  'eurlex.legislation.recent': recent,
  'eurlex.legislation.detail': detail,
  'eurlex.legislation.by_type': byType,
};
