import { z, type ZodSchema } from 'zod';

const worksSearch = z
  .object({
    query: z
      .string()
      .min(1)
      .describe('Search query across title, abstract, and full text (e.g. "climate change")'),
    per_page: z
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
      .describe('Search query for researcher/author name (e.g. "marie curie")'),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .describe('Number of results to return (1-25, default 10)'),
  })
  .strip();

const getWork = z
  .object({
    id: z
      .string()
      .min(1)
      .describe(
        'OpenAlex work ID (e.g. "W2101234009"), OpenAlex URL, or DOI ' +
          '(e.g. "10.48550/arxiv.1201.0490") to fetch full details for',
      ),
  })
  .strip();

export const openalexSchemas: Record<string, ZodSchema> = {
  'openalex.works_search': worksSearch,
  'openalex.authors_search': authorsSearch,
  'openalex.get_work': getWork,
};
