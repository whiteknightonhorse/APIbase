import { z } from 'zod';

export const abrSchemas: Record<string, z.ZodTypeAny> = {
  'abr.abn_lookup': z
    .object({
      abn: z
        .string()
        .describe(
          'Australian Business Number (ABN) — 11-digit numeric identifier, spaces optional (e.g. "33 051 775 556" or "33051775556")',
        ),
    })
    .strip(),

  'abr.acn_lookup': z
    .object({
      acn: z
        .string()
        .describe(
          'Australian Company Number (ACN) — 9-digit numeric identifier issued by ASIC, spaces optional (e.g. "051 775 556" or "051775556")',
        ),
    })
    .strip(),

  'abr.name_search': z
    .object({
      name: z
        .string()
        .describe(
          'Business name to search for (e.g. "Telstra", "Qantas Airways"). Partial names supported.',
        ),
      max_results: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe('Maximum number of matching businesses to return (1–50, default 10).'),
      state: z
        .enum(['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT'])
        .optional()
        .describe(
          'Filter results to a specific Australian state or territory using the standard abbreviation (e.g. "VIC", "NSW").',
        ),
      postcode: z
        .string()
        .optional()
        .describe(
          'Filter results to businesses registered in a specific Australian postcode (e.g. "3000" for Melbourne CBD).',
        ),
    })
    .strip(),
};
