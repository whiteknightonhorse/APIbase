import { z } from 'zod';

export const usdamarsSchemas: Record<string, z.ZodSchema> = {
  'usdamars.list_reports': z
    .object({
      days: z
        .number()
        .int()
        .min(1)
        .max(30)
        .optional()
        .describe(
          "Number of past days to include (1–30). Default 7. Today's reports use 1; a full work week uses 5.",
        ),
    })
    .strip(),

  'usdamars.get_report': z
    .object({
      report_id: z
        .union([z.string(), z.number()])
        .describe(
          'USDA AMS MARS report ID or slug (e.g. 2826 or "nw_ls910"). Obtain IDs from usdamars.list_reports or usdamars.search_reports.',
        ),
    })
    .strip(),

  'usdamars.list_corrected': z
    .object({
      days: z
        .union([z.string(), z.number()])
        .optional()
        .describe(
          'Number of past days to search for corrections (1–90), or "all" for complete history. Default "all".',
        ),
    })
    .strip(),

  'usdamars.search_reports': z
    .object({
      keyword: z
        .string()
        .optional()
        .describe(
          'Commodity or topic keyword to filter report titles (case-insensitive). Examples: "cattle", "dairy", "fruit", "grain", "lamb", "poultry", "cotton", "boxed beef", "egg".',
        ),
      days: z
        .number()
        .int()
        .min(1)
        .max(30)
        .optional()
        .describe('Number of past days to search within (1–30). Default 7.'),
    })
    .strip(),
};
