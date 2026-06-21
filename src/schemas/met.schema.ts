import { z, type ZodSchema } from 'zod';

const search = z
  .object({
    query: z
      .string()
      .min(1)
      .describe(
        'Search keyword — artist, title, medium, or subject (e.g. "monet", "sunflowers", "greek vase", "armor")',
      ),
    department_id: z
      .number()
      .int()
      .optional()
      .describe(
        'Department filter: 1=American Decorative Arts, 3=Ancient Near Eastern Art, 6=Asian Art, 9=Drawings and Prints, 11=European Paintings, 13=Greek and Roman Art, 17=Medieval Art, 21=Modern Art',
      ),
    medium: z
      .string()
      .optional()
      .describe('Medium filter (e.g. "Paintings", "Sculpture", "Photographs", "Ceramics")'),
    has_images: z.boolean().optional().describe('Only return artworks with images (default: true)'),
    geo_location: z
      .string()
      .optional()
      .describe('Geographic location filter (e.g. "France", "Japan", "Egypt")'),
    date_begin: z
      .number()
      .int()
      .optional()
      .describe('Start year for date range filter (e.g. 1800). Use with date_end.'),
    date_end: z
      .number()
      .int()
      .optional()
      .describe('End year for date range filter (e.g. 1900). Use with date_begin.'),
  })
  .strip();

const details = z
  .object({
    object_id: z
      .number()
      .int()
      .min(1)
      .describe(
        'Met Museum object ID (e.g. 436524 for Van Gogh Sunflowers, 45734 for Washington Crossing the Delaware). Use met.search to find IDs.',
      ),
  })
  .strip();

const departments = z
  .object({
    sort_by: z
      .enum(['id', 'name'])
      .optional()
      .describe(
        'Sort order for the department list: "id" (numeric, default) or "name" (alphabetical)',
      ),
  })
  .strip();

const browse = z
  .object({
    department_id: z
      .number()
      .int()
      .min(1)
      .describe(
        'Department ID to browse. Use met.departments to get IDs. Examples: 10=Egyptian Art, 11=European Paintings, 13=Greek and Roman Art, 21=Modern Art',
      ),
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        'Page number for pagination (1-based, default 1). Each page returns up to 100 object IDs.',
      ),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe(
        'Number of object IDs per page (1–100, default 50). Use with met.details to fetch artwork metadata.',
      ),
  })
  .strip();

export const metSchemas: Record<string, ZodSchema> = {
  'met.search': search,
  'met.details': details,
  'met.departments': departments,
  'met.browse': browse,
};
