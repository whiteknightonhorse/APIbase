import { z } from 'zod';

const ITEM_TYPE_VALUES = ['subjects', 'media', 'documents', 'all'] as const;
const DETAIL_TYPE_VALUES = ['subjects', 'projects', 'media', 'documents'] as const;

export const opencontextSchemas: Record<string, z.ZodSchema> = {
  'opencontext.search': z
    .object({
      query: z
        .string()
        .min(1)
        .describe(
          'Full-text search query for archaeological items (e.g. "Roman pottery", ' +
            '"Bronze Age burial", "Petra temple", "obsidian flake"). ' +
            'Searches labels, descriptions, and project metadata across 200K+ records.',
        ),
      item_type: z
        .enum(ITEM_TYPE_VALUES)
        .optional()
        .describe(
          'Filter by item category. "subjects" for excavated objects and contexts (default); ' +
            '"media" for images, 3D models, and videos; "documents" for field notes and reports; ' +
            '"all" to search across all types.',
        ),
      rows: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe('Number of results to return per page (1–50, default 10).'),
      start: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
          'Zero-based pagination offset. Use with rows to page through results ' +
            '(e.g. start=10, rows=10 to get the second page).',
        ),
    })
    .strip(),

  'opencontext.detail': z
    .object({
      uuid: z
        .string()
        .min(1)
        .describe(
          'UUID of the Open Context item to retrieve (e.g. ' +
            '"013860d8-a5c9-48fc-d695-0ab6cc7c94b0"). ' +
            'Obtain from opencontext.archaeology.search results (last path segment of the URI).',
        ),
      item_type: z
        .enum(DETAIL_TYPE_VALUES)
        .optional()
        .describe(
          'Item category for routing to the correct endpoint. ' +
            '"subjects" for excavated objects/finds/contexts (default); ' +
            '"projects" for excavation projects; ' +
            '"media" for images/3D models; "documents" for field notes/reports. ' +
            'Matches the path segment in the item URI (e.g. opencontext.org/subjects/...).',
        ),
    })
    .strip(),

  'opencontext.facets': z
    .object({
      query: z
        .string()
        .describe(
          'Search query to compute facets for (e.g. "Roman pottery", "Bronze Age"). ' +
            'Use an empty string "" to get facets across the entire Open Context database.',
        ),
      item_type: z
        .enum(ITEM_TYPE_VALUES)
        .optional()
        .describe(
          'Optional filter to restrict facet computation to a specific item type. ' +
            '"subjects" for excavated objects; "media" for images/3D; "documents" for field notes; ' +
            '"all" or omit to aggregate across all types.',
        ),
    })
    .strip(),

  'opencontext.projects': z
    .object({
      query: z
        .string()
        .describe(
          'Search query for archaeological excavation projects or collections ' +
            '(e.g. "Turkey", "Roman", "DINAA", "Petra"). ' +
            'Use an empty string "" to browse all available projects.',
        ),
      rows: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe('Number of project results to return (1–50, default 10).'),
      start: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Zero-based pagination offset for browsing large result sets (default 0).'),
    })
    .strip(),
};
