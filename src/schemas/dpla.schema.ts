import { z } from 'zod';
import type { ZodSchema } from 'zod';

export const dplaSchemas: Record<string, ZodSchema> = {
  'dpla.items.search': z
    .object({
      q: z
        .string()
        .optional()
        .describe(
          'Full-text search query across title, description, creator, and subject fields (e.g. "civil war photographs", "Thomas Jefferson")',
        ),
      type: z
        .enum(['image', 'text', 'sound', 'moving image', 'physical object'])
        .optional()
        .describe(
          'Filter by media type: image (photographs, drawings), text (books, manuscripts), sound (audio recordings), moving image (film/video), physical object',
        ),
      date_begin: z
        .string()
        .optional()
        .describe(
          'Filter items created on or after this year (e.g. "1850"). Use with date_end for a range.',
        ),
      date_end: z
        .string()
        .optional()
        .describe(
          'Filter items created on or before this year (e.g. "1900"). Use with date_begin for a range.',
        ),
      state: z
        .string()
        .optional()
        .describe(
          'Filter by US state name where the item originated or is about (e.g. "Massachusetts", "California")',
        ),
      provider: z
        .string()
        .optional()
        .describe(
          'Filter by contributing institution name (e.g. "Smithsonian Institution", "The New York Public Library")',
        ),
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('Page number for pagination, starting at 1 (default: 1)'),
      page_size: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe('Number of items per page, 1–50 (default: 10)'),
    })
    .strip(),

  'dpla.items.detail': z
    .object({
      item_id: z
        .string()
        .describe(
          'DPLA item identifier (32-character hex string, e.g. "eb930b2f9ad638f921429e5e898f0a34"). Obtain from search results.',
        ),
    })
    .strip(),

  'dpla.items.by_subject': z
    .object({
      subject: z
        .string()
        .describe(
          'Subject or topic to browse (e.g. "Photography", "Women", "Architecture", "Native Americans"). Case-insensitive exact match against DPLA subject vocabulary.',
        ),
      type: z
        .enum(['image', 'text', 'sound', 'moving image', 'physical object'])
        .optional()
        .describe(
          'Optionally narrow results to a specific media type: image, text, sound, moving image, or physical object',
        ),
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('Page number for pagination, starting at 1 (default: 1)'),
      page_size: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe('Number of items per page, 1–50 (default: 10)'),
    })
    .strip(),

  'dpla.items.facets': z
    .object({
      q: z
        .string()
        .optional()
        .describe(
          'Optional query to scope the facets (e.g. "civil war" returns top subjects/providers/types within that query). Omit for global top facets.',
        ),
      facet_size: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe('Number of top terms to return per facet dimension, 1–50 (default: 10)'),
    })
    .strip(),
};
