import { z, type ZodSchema } from 'zod';

const create = z.object({
  url: z.string().url().describe('Original URL to shorten (e.g. "https://example.com/very/long/path")'),
  title: z.string().optional().describe('Optional title/label for the short link'),
  slug: z.string().optional().describe('Custom short path (e.g. "my-link" → apibase.short.gy/my-link). Auto-generated if omitted.'),
}).strip();

const stats = z.object({
  path: z.string().describe('Short link path (e.g. "imV5of" from apibase.short.gy/imV5of)'),
}).strip();

export const shortioSchemas: Record<string, ZodSchema> = {
  'shorturl.create': create,
  'shorturl.stats': stats,
};
