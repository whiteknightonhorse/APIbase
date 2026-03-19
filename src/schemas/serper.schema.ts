import { z, type ZodSchema } from 'zod';

const webSearch = z
  .object({
    q: z.string().min(1).describe('Search query (e.g. "best restaurants in Berlin", "how does MCP protocol work")'),
    gl: z.string().max(2).optional().describe('Country code for localized results (e.g. "us", "gb", "de", "fr")'),
    hl: z.string().max(5).optional().describe('Language code for results (e.g. "en", "de", "fr", "es")'),
    num: z.number().int().min(1).max(100).optional().describe('Number of results to return (default 10, max 100)'),
    page: z.number().int().min(1).optional().describe('Page number for pagination (default 1)'),
  })
  .strip();

const newsSearch = z
  .object({
    q: z.string().min(1).describe('News search query (e.g. "AI agents", "Base network")'),
    gl: z.string().max(2).optional().describe('Country code for localized news (e.g. "us", "gb")'),
    hl: z.string().max(5).optional().describe('Language code (e.g. "en", "de")'),
    num: z.number().int().min(1).max(100).optional().describe('Number of articles (default 10, max 100)'),
    tbs: z
      .string()
      .optional()
      .describe('Time filter: "qdr:h" (past hour), "qdr:d" (past day), "qdr:w" (past week), "qdr:m" (past month)'),
  })
  .strip();

const imageSearch = z
  .object({
    q: z.string().min(1).describe('Image search query (e.g. "golden gate bridge sunset")'),
    gl: z.string().max(2).optional().describe('Country code (e.g. "us")'),
    num: z.number().int().min(1).max(100).optional().describe('Number of images (default 10, max 100)'),
  })
  .strip();

const shoppingSearch = z
  .object({
    q: z.string().min(1).describe('Product search query (e.g. "macbook pro 16 inch", "wireless headphones")'),
    gl: z.string().max(2).optional().describe('Country code for localized prices (e.g. "us", "gb")'),
    num: z.number().int().min(1).max(100).optional().describe('Number of products (default 10, max 100)'),
  })
  .strip();

export const serperSchemas: Record<string, ZodSchema> = {
  'serper.web_search': webSearch,
  'serper.news_search': newsSearch,
  'serper.image_search': imageSearch,
  'serper.shopping_search': shoppingSearch,
};
