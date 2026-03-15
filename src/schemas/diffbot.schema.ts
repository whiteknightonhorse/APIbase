import { z, type ZodSchema } from 'zod';

const diffbotProductExtract = z
  .object({
    url: z.string().url().describe('Product page URL to extract data from (any e-commerce site)'),
    discussion: z.boolean().optional().describe('Include product reviews and comments (default false)'),
    timeout: z.number().int().min(5000).max(30000).optional().describe('Request timeout in milliseconds (5000-30000, default 15000)'),
  })
  .strip();

const diffbotPageAnalyze = z
  .object({
    url: z.string().url().describe('Web page URL to auto-detect type and extract structured data'),
    mode: z.enum(['product', 'article', 'image', 'discussion', 'video']).optional().describe('Force extraction mode instead of auto-detection'),
    fallback: z.enum(['article', 'product']).optional().describe('Fallback extraction type if auto-detection fails'),
    timeout: z.number().int().min(5000).max(30000).optional().describe('Request timeout in milliseconds (5000-30000, default 15000)'),
  })
  .strip();

const diffbotArticleExtract = z
  .object({
    url: z.string().url().describe('Article or blog post URL to extract text, author, and metadata'),
    paging: z.boolean().optional().describe('Follow multi-page articles and concatenate text (default true)'),
    maxTags: z.number().int().min(1).max(50).optional().describe('Maximum number of topic tags to return (1-50, default 10)'),
    timeout: z.number().int().min(5000).max(30000).optional().describe('Request timeout in milliseconds (5000-30000, default 15000)'),
  })
  .strip();

const diffbotSearch = z
  .object({
    query: z.string().describe('Diffbot Knowledge Graph query (DQL) — e.g. "type:Product title:iPhone"'),
    type: z.enum(['Product', 'Article', 'Organization', 'Person', 'Place', 'Event']).optional().describe('Filter results by entity type in Knowledge Graph'),
    size: z.number().int().min(1).max(50).optional().describe('Number of results to return (1-50, default 25)'),
    from: z.number().int().min(0).optional().describe('Pagination offset for results (default 0)'),
  })
  .strip();

export const diffbotSchemas: Record<string, ZodSchema> = {
  'diffbot.product_extract': diffbotProductExtract,
  'diffbot.page_analyze': diffbotPageAnalyze,
  'diffbot.article_extract': diffbotArticleExtract,
  'diffbot.search': diffbotSearch,
};
