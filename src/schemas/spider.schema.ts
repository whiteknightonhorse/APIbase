import { z, type ZodSchema } from 'zod';

const scrape = z
  .object({
    url: z.string().url().describe('URL to scrape (e.g. "https://example.com/page")'),
    format: z
      .enum(['markdown', 'text', 'raw', 'commonmark'])
      .optional()
      .default('markdown')
      .describe(
        'Output format: markdown (default, best for LLMs), text (plain), raw (HTML), commonmark',
      ),
    readability: z
      .boolean()
      .optional()
      .describe('Enable readability mode — pre-processes page for LLM consumption'),
    wait_for: z
      .number()
      .int()
      .min(0)
      .max(30000)
      .optional()
      .describe('Wait N ms for JS to render before scraping (0-30000)'),
  })
  .strip();

const search = z
  .object({
    query: z.string().describe('Web search query (e.g. "best MCP servers 2026")'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .default(5)
      .describe('Max results (1-20, default 5)'),
  })
  .strip();

export const spiderSchemas: Record<string, ZodSchema> = {
  'spider.scrape': scrape,
  'spider.search': search,
};
