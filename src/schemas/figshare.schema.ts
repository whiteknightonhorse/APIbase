import { z, type ZodSchema } from 'zod';

const ITEM_TYPES = [
  'figure',
  'media',
  'dataset',
  'poster',
  'journal_contribution',
  'presentation',
  'thesis',
  'software',
  'online_resource',
  'preprint',
  'book',
  'conference_contribution',
] as const;

const search = z
  .object({
    query: z
      .string()
      .optional()
      .describe(
        'Free-text search across title, description, and author (e.g. "soil moisture", "gene expression").',
      ),
    doi: z
      .string()
      .optional()
      .describe('Filter by exact DOI (e.g. "10.6084/m9.figshare.33350571.v1").'),
    item_type: z
      .enum(ITEM_TYPES)
      .optional()
      .describe(
        'Filter by research output type: figure, media, dataset, poster, journal_contribution, presentation, thesis, software, online_resource, preprint, book, or conference_contribution.',
      ),
    order_direction: z
      .enum(['asc', 'desc'])
      .optional()
      .describe('Sort direction by published date (default "desc" — newest first).'),
    page: z.number().int().min(1).optional().describe('Page number for pagination (default 1).'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Results per page (default 10, max 50).'),
  })
  .strip();

const articleDetails = z
  .object({
    article_id: z
      .number()
      .int()
      .min(1)
      .describe('Figshare article ID (e.g. 33350571) — obtained from figshare.search results.'),
  })
  .strip();

const categories = z
  .object({
    query: z
      .string()
      .optional()
      .describe(
        'Optional free-text filter on category/subject title (e.g. "ecology", "biotechnology"). Omit to browse the full taxonomy.',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe('Max categories to return (default 50, max 200).'),
  })
  .strip();

export const figshareSchemas: Record<string, ZodSchema> = {
  'figshare.search': search,
  'figshare.article_details': articleDetails,
  'figshare.categories': categories,
};
