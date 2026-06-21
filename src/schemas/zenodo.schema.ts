import { z, type ZodSchema } from 'zod';

const search = z
  .object({
    query: z
      .string()
      .optional()
      .describe(
        'Free-text search query across title, description, creators, and keywords (e.g. "CRISPR gene editing", "climate change datasets", "machine learning").',
      ),
    type: z
      .enum([
        'publication',
        'poster',
        'presentation',
        'dataset',
        'image',
        'video',
        'software',
        'lesson',
        'physicalobject',
        'other',
      ])
      .optional()
      .describe(
        'Filter by record type: "publication" (papers/preprints), "dataset", "software", "presentation", "poster", "image", "video", "lesson", "physicalobject", or "other".',
      ),
    sort: z
      .enum(['bestmatch', 'mostrecent', 'mostviewed', 'mostdownloaded'])
      .optional()
      .describe(
        'Sort order: "bestmatch" (relevance), "mostrecent" (newest first), "mostviewed", or "mostdownloaded". Default: bestmatch.',
      ),
    access_right: z
      .enum(['open', 'embargoed', 'restricted', 'closed'])
      .optional()
      .describe(
        'Filter by access right: "open" (freely downloadable), "embargoed", "restricted", or "closed".',
      ),
    date_from: z
      .string()
      .optional()
      .describe(
        'Filter records published on or after this date in ISO 8601 format (e.g. "2023-01-01").',
      ),
    date_to: z
      .string()
      .optional()
      .describe(
        'Filter records published on or before this date in ISO 8601 format (e.g. "2024-12-31").',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of results to return per page (default 10, max 50).'),
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Page number for pagination (default 1). Combine with limit for paging.'),
  })
  .strip();

const record = z
  .object({
    record_id: z
      .union([z.string(), z.number()])
      .describe(
        'Zenodo record ID (numeric, e.g. 10487285) or DOI suffix. Find IDs via zenodo.records.search or from a DOI like "10.5281/zenodo.10487285".',
      ),
  })
  .strip();

const files = z
  .object({
    record_id: z
      .union([z.string(), z.number()])
      .describe(
        'Zenodo record ID whose files to list (numeric, e.g. 10487285). Obtain from zenodo.records.search or zenodo.records.detail.',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of files to return (default 50, max 100).'),
  })
  .strip();

const communities = z
  .object({
    query: z
      .string()
      .optional()
      .describe(
        'Search term to filter communities by name or topic (e.g. "astronomy", "machine learning", "climate", "bioinformatics").',
      ),
    sort: z
      .enum(['bestmatch', 'newest', 'oldest'])
      .optional()
      .describe('Sort order: "bestmatch" (relevance), "newest", or "oldest". Default: bestmatch.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of communities to return (default 10, max 50).'),
    page: z.number().int().min(1).optional().describe('Page number for pagination (default 1).'),
  })
  .strip();

export const zenodoSchemas: Record<string, ZodSchema> = {
  'zenodo.search': search,
  'zenodo.record': record,
  'zenodo.files': files,
  'zenodo.communities': communities,
};
