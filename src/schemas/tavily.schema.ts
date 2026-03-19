import { z, type ZodSchema } from 'zod';

const search = z
  .object({
    query: z.string().min(1).describe('Search query — Tavily returns AI-synthesized answer + curated results with extracted content'),
    search_depth: z
      .enum(['basic', 'advanced'])
      .optional()
      .describe('Search depth: "basic" (faster, 1 credit) or "advanced" (deeper, 2 credits). Default: basic'),
    include_answer: z
      .boolean()
      .optional()
      .describe('Include AI-synthesized answer based on search results (default true)'),
    max_results: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe('Number of results to return (default 5, max 20)'),
    include_domains: z
      .array(z.string())
      .optional()
      .describe('Only include results from these domains (e.g. ["wikipedia.org", "arxiv.org"])'),
    exclude_domains: z
      .array(z.string())
      .optional()
      .describe('Exclude results from these domains (e.g. ["reddit.com"])'),
    days: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Recency filter — only include results from the last N days'),
  })
  .strip();

const extract = z
  .object({
    urls: z
      .array(z.string().url())
      .min(1)
      .max(20)
      .describe('URLs to extract clean content from (1-20 URLs). Returns readable text, title, author, date.'),
  })
  .strip();

export const tavilySchemas: Record<string, ZodSchema> = {
  'tavily.search': search,
  'tavily.extract': extract,
};
