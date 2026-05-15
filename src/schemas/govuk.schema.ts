import { z, type ZodSchema } from 'zod';

/**
 * GOV.UK Content API tool schemas (UC-430).
 *
 * All fields have .describe() per Smithery quality requirements.
 * NEVER use empty z.object({}) — every tool has at least one param.
 */

export const govukSchemas: Record<string, ZodSchema> = {
  'govuk.search': z
    .object({
      q: z
        .string()
        .describe(
          "Search query (free text). Examples: 'energy bill rebate', 'visa skilled worker', 'income tax allowance 2026'.",
        ),
      count: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(10)
        .describe('Results per page (1-100, default 10).'),
      start: z
        .number()
        .int()
        .min(0)
        .optional()
        .default(0)
        .describe('Offset for pagination (default 0).'),
      order: z
        .enum(['-public_timestamp', 'public_timestamp', 'relevance', '-relevance'])
        .optional()
        .describe(
          "Sort order. Default is relevance. Use '-public_timestamp' for newest first, 'public_timestamp' for oldest first.",
        ),
    })
    .strip(),

  'govuk.content': z
    .object({
      base_path: z
        .string()
        .describe(
          "GOV.UK URL path starting with /, e.g. '/income-tax-rates' or '/government/publications/spring-statement-2026'. Get from govuk.search results.",
        ),
    })
    .strip(),

  'govuk.organisations': z
    .object({
      page: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(1)
        .describe('Page number (1-100, default 1, 20 organisations per page).'),
    })
    .strip(),
};
