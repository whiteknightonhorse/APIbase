import { z } from 'zod';

export const doajSchemas: Record<string, z.ZodTypeAny> = {
  'doaj.journal_search': z
    .object({
      query: z
        .string()
        .describe(
          'Search query for journals (e.g. "ecology", "ISSN:1234-5678", "publisher:Elsevier"). Supports DOAJ query syntax.',
        ),
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('Result page number (1-based). Default: 1.'),
      page_size: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe('Number of journals per page (1–50). Default: 10.'),
      sort: z
        .string()
        .optional()
        .describe(
          'Sort order for results. Examples: "title:asc", "issn:desc". Default: relevance.',
        ),
    })
    .strip(),

  'doaj.journal_detail': z
    .object({
      journal_id: z
        .string()
        .describe(
          'DOAJ journal identifier (32-character hex string, e.g. "4b3d6d1e61534f8d84b64b5c5a9a4cd0"). Obtain from journal_search results.',
        ),
    })
    .strip(),

  'doaj.article_search': z
    .object({
      query: z
        .string()
        .describe(
          'Full-text search query for articles (e.g. "climate change mitigation", "title:CRISPR", "doi:10.1002/xyz"). Supports DOAJ query syntax.',
        ),
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('Result page number (1-based). Default: 1.'),
      page_size: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe('Number of articles per page (1–50). Default: 10.'),
      sort: z
        .string()
        .optional()
        .describe('Sort order. Examples: "title:asc", "created_date:desc". Default: relevance.'),
    })
    .strip(),

  'doaj.article_detail': z
    .object({
      article_id: z
        .string()
        .describe(
          'DOAJ article identifier (32-character hex string, e.g. "000004687a3a411cb466625281f2ceb0"). Obtain from article_search results.',
        ),
    })
    .strip(),
};
