import { z, type ZodSchema } from 'zod';

export const mfapiSchemas: Record<string, ZodSchema> = {
  'mfapi.scheme_search': z
    .object({
      query: z
        .string()
        .describe('Keyword to filter scheme names (e.g. "HDFC", "SBI Bluechip", "mid cap")'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Maximum number of results to return (1–100, default 20)'),
    })
    .strip(),

  'mfapi.scheme_list': z
    .object({
      page: z.number().int().min(1).optional().describe('Page number for pagination (default 1)'),
      per_page: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe('Number of schemes per page (1–200, default 50)'),
    })
    .strip(),

  'mfapi.nav_latest': z
    .object({
      scheme_code: z
        .number()
        .int()
        .positive()
        .describe(
          'AMFI scheme code (integer). Use mfapi.scheme_search to find the code for a fund.',
        ),
    })
    .strip(),

  'mfapi.nav_history': z
    .object({
      scheme_code: z
        .number()
        .int()
        .positive()
        .describe(
          'AMFI scheme code (integer). Use mfapi.scheme_search to find the code for a fund.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .describe(
          'Maximum number of historical NAV records to return, most recent first (1–1000, default 100)',
        ),
    })
    .strip(),
};
