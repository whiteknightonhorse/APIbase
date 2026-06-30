import { z } from 'zod';

export const clevelandArtSchemas: Record<string, z.ZodSchema> = {
  'clevelandart.artwork_search': z
    .object({
      query: z
        .string()
        .optional()
        .describe(
          'Full-text search query (e.g. "monet", "landscape", "still life"). ' +
            'Searches title, creator, tombstone, and description fields.',
        ),
      type: z
        .string()
        .optional()
        .describe(
          'Artwork classification type filter (e.g. "Painting", "Drawing", "Print", ' +
            '"Sculpture", "Photograph", "Textile"). Case-insensitive.',
        ),
      department: z
        .string()
        .optional()
        .describe(
          'Museum department filter (e.g. "European Paintings", "Asian Art", ' +
            '"Prints", "Photography", "Decorative Art and Design").',
        ),
      has_image: z
        .boolean()
        .optional()
        .describe(
          'When true, returns only artworks that have at least one image available. ' +
            'Recommended for visual use cases.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe('Maximum number of results to return (1–50). Default: 10.'),
      skip: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Number of results to skip for pagination. Default: 0.'),
    })
    .strip(),

  'clevelandart.artwork_detail': z
    .object({
      artwork_id: z
        .number()
        .int()
        .positive()
        .describe(
          'Numeric ID of the artwork in the Cleveland Museum of Art collection ' +
            '(e.g. 127859). Obtain from cma.artwork.search results.',
        ),
    })
    .strip(),

  'clevelandart.creator_search': z
    .object({
      query: z
        .string()
        .optional()
        .describe(
          'Artist or creator name to search for (e.g. "Picasso", "Rembrandt", ' +
            '"Mary Cassatt"). Partial name matches are supported.',
        ),
      nationality: z
        .string()
        .optional()
        .describe(
          'Filter by creator nationality (e.g. "American", "French", "Dutch", ' +
            '"Italian", "Japanese"). Case-insensitive.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe('Maximum number of results to return (1–50). Default: 10.'),
      skip: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Number of results to skip for pagination. Default: 0.'),
    })
    .strip(),

  'clevelandart.exhibition_search': z
    .object({
      query: z
        .string()
        .optional()
        .describe(
          'Full-text search query over exhibition titles and related content ' +
            '(e.g. "impressionism", "medieval", "contemporary").',
        ),
      is_venue_cma: z
        .boolean()
        .optional()
        .describe(
          'When true, limits results to exhibitions held at the Cleveland Museum ' +
            'of Art itself (excludes traveling exhibitions at other venues).',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe('Maximum number of results to return (1–50). Default: 10.'),
      skip: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Number of results to skip for pagination. Default: 0.'),
    })
    .strip(),
};
