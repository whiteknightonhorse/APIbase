import { z, type ZodSchema } from 'zod';

const search = z
  .object({
    query: z.string().min(1).describe('Natural language search query — Exa finds semantically related pages, not just keyword matches'),
    num_results: z.number().int().min(1).max(25).optional().describe('Number of results (default 10, max 25)'),
    type: z
      .enum(['auto', 'neural', 'keyword'])
      .optional()
      .describe('Search type: "auto" (balanced), "neural" (semantic similarity), "keyword" (traditional). Default: auto'),
    category: z
      .enum(['company', 'research paper', 'news', 'people', 'tweet'])
      .optional()
      .describe('Category filter for specialized indexes (optional)'),
    include_domains: z.array(z.string()).optional().describe('Only include results from these domains (e.g. ["arxiv.org"])'),
    exclude_domains: z.array(z.string()).optional().describe('Exclude results from these domains'),
    start_published_date: z.string().optional().describe('Filter: only results published after this date (ISO format, e.g. "2025-01-01")'),
    end_published_date: z.string().optional().describe('Filter: only results published before this date'),
    include_text: z.boolean().optional().describe('Include full extracted page text in results (default false — saves tokens)'),
    include_highlights: z.boolean().optional().describe('Include key sentence highlights (default true)'),
  })
  .strip();

const contents = z
  .object({
    urls: z.array(z.string().url()).min(1).max(10).describe('URLs to extract content from (1-10). Returns clean text, title, author, date.'),
  })
  .strip();

const findSimilar = z
  .object({
    url: z.string().url().describe('Reference URL — Exa finds pages semantically similar to this one'),
    num_results: z.number().int().min(1).max(25).optional().describe('Number of similar pages (default 10, max 25)'),
    exclude_source_domain: z.boolean().optional().describe('Exclude results from same domain as input URL (default true)'),
    start_published_date: z.string().optional().describe('Only include similar pages published after this date (ISO format)'),
    include_text: z.boolean().optional().describe('Include full extracted page text (default false)'),
  })
  .strip();

export const exaSchemas: Record<string, ZodSchema> = {
  'exa.search': search,
  'exa.contents': contents,
  'exa.find_similar': findSimilar,
};
