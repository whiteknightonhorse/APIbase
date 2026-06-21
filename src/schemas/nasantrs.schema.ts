import { z } from 'zod';

export const nasantrsSchemas: Record<string, z.ZodTypeAny> = {
  'nasantrs.search': z
    .object({
      query: z
        .string()
        .optional()
        .describe(
          'Full-text search query. Searches titles, abstracts, keywords, and author names (e.g. "solar wind", "lunar lander", "propulsion system"). Leave empty to browse all documents.',
        ),
      center: z
        .string()
        .optional()
        .describe(
          'Filter by NASA center code. Examples: JPL (Jet Propulsion Laboratory), GSFC (Goddard Space Flight Center), JSC (Johnson), MSFC (Marshall), LaRC (Langley), ARC (Ames), GRC (Glenn), KSC (Kennedy).',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(25)
        .optional()
        .describe('Number of results to return per page (1–25, default 10).'),
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe(
          'Page number for pagination (default 1). Use with limit to browse large result sets.',
        ),
      sort: z
        .enum(['score', 'releaseDate', 'submittedDate'])
        .optional()
        .describe(
          'Sort order: "score" (relevance, default), "releaseDate" (public release date), "submittedDate" (submission date).',
        ),
      order: z
        .enum(['asc', 'desc'])
        .optional()
        .describe(
          'Sort direction: "asc" (ascending) or "desc" (descending, default for date sorts).',
        ),
    })
    .strip(),

  'nasantrs.report': z
    .object({
      report_id: z
        .number()
        .int()
        .describe(
          'Numeric NTRS submission/citation ID (e.g. 20140017767). Obtain from nasantrs.reports.search or nasantrs.reports.recent results.',
        ),
    })
    .strip(),

  'nasantrs.recent': z
    .object({
      limit: z
        .number()
        .int()
        .min(1)
        .max(25)
        .optional()
        .describe('Number of recent reports to return (1–25, default 10).'),
      center: z
        .string()
        .optional()
        .describe(
          'Filter by NASA center code to see only recent publications from a specific center (e.g. JPL, GSFC, JSC, MSFC, LaRC, ARC, GRC, KSC).',
        ),
      page: z.number().int().min(1).optional().describe('Page number for pagination (default 1).'),
    })
    .strip(),

  'nasantrs.stats': z
    .object({
      detail: z
        .boolean()
        .optional()
        .describe(
          'When true, returns full aggregation breakdowns by document type, subject category, NASA center, and top keywords. Always true — parameter reserved for future use.',
        ),
    })
    .strip(),
};
