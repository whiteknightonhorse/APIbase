import { z, type ZodSchema } from 'zod';

const search = z
  .object({
    query: z
      .string()
      .min(1)
      .describe(
        'Free-text search across title, author name, and subject (e.g. "frankenstein", "jane austen"). Required — an empty query returns zero results.',
      ),
    sort: z
      .enum(['newest', 'author', 'reading_ease', 'length', 'popularity'])
      .optional()
      .describe(
        'Sort order: "newest" (S.E. release date, default), "author" (author name A-Z), "reading_ease" (easiest first), "length" (shortest first), "popularity" (most downloaded first).',
      ),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(60)
      .optional()
      .describe('Results per page (default 12, max 60).'),
    page: z.number().int().min(1).optional().describe('Page number for pagination (default 1).'),
  })
  .strip();

const newReleases = z
  .object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(15)
      .optional()
      .describe(
        'Max number of recent releases to return (default 15, max 15 — feed size is fixed).',
      ),
  })
  .strip();

export const standardEbooksSchemas: Record<string, ZodSchema> = {
  'standard-ebooks.search': search,
  'standard-ebooks.new_releases': newReleases,
};
