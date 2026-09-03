import { z, type ZodSchema } from 'zod';

const papersSearch = z
  .object({
    query: z
      .string()
      .min(1)
      .describe('Search query across paper title and abstract (e.g. "transformer attention")'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .describe('Number of results to return (1-25, default 10)'),
  })
  .strip();

const authorsSearch = z
  .object({
    query: z
      .string()
      .min(1)
      .describe('Search query for researcher/author name (e.g. "geoffrey hinton")'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .describe('Number of results to return (1-25, default 10)'),
  })
  .strip();

const getPaper = z
  .object({
    paper_id: z
      .string()
      .min(1)
      .describe(
        'Semantic Scholar paper ID (40-char hash), DOI (e.g. "10.1038/nature14539"), or ' +
          'ArXiv ID (e.g. "ARXIV:1706.03762") to fetch full details for',
      ),
  })
  .strip();

export const semanticscholarSchemas: Record<string, ZodSchema> = {
  'semanticscholar.papers_search': papersSearch,
  'semanticscholar.authors_search': authorsSearch,
  'semanticscholar.get_paper': getPaper,
};
