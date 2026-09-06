import { z, type ZodSchema } from 'zod';

const search = z
  .object({
    query: z
      .string()
      .optional()
      .describe(
        'Full-text search query across title, description, and text (e.g. "moon landing 1969"). Omit to browse by mediatype/creator alone',
      ),
    mediatype: z
      .enum([
        'texts',
        'movies',
        'audio',
        'software',
        'image',
        'data',
        'web',
        'collection',
        'account',
      ])
      .optional()
      .describe(
        'Filter by item type: texts (books/docs), movies, audio, software, image, data, web (archived sites), collection',
      ),
    creator: z
      .string()
      .optional()
      .describe('Filter by creator/author/uploader name (e.g. "NASA", "mark twain")'),
    rows: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of results to return (default: 10, max: 50)'),
    page: z.number().int().min(1).optional().describe('Page number for pagination (default: 1)'),
  })
  .strip();

const metadata = z
  .object({
    identifier: z
      .string()
      .describe(
        'archive.org item identifier, e.g. "goodytwoshoes00newyiala" (get from archiveorg.search results\' identifier field, or the tail of an archive.org/details/{identifier} URL)',
      ),
  })
  .strip();

const waybackCheck = z
  .object({
    url: z
      .string()
      .describe(
        'The live URL to check for an archived snapshot in the Wayback Machine (e.g. "example.com" or "https://example.com/page")',
      ),
    timestamp: z
      .string()
      .optional()
      .describe(
        'Find the snapshot closest to this timestamp, format YYYYMMDDhhmmss (e.g. "20260101" for Jan 1 2026). Omit for the most recent snapshot',
      ),
  })
  .strip();

export const archiveorgSchemas: Record<string, ZodSchema> = {
  'archiveorg.search': search,
  'archiveorg.metadata': metadata,
  'archiveorg.wayback_check': waybackCheck,
};
