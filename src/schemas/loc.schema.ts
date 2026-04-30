import { z, type ZodSchema } from 'zod';

const search = z
  .object({
    query: z
      .string()
      .min(1)
      .describe(
        'Free-text search across LOC\'s 415K+ digitized items (e.g. "civil war", "suffrage", "lincoln").',
      ),
    format: z
      .enum(['image', 'audio', 'film, video', 'online text', 'web archive'])
      .optional()
      .describe(
        'Optional filter by online format — image, audio, film/video, online text, or web archive.',
      ),
    collection: z
      .string()
      .optional()
      .describe('Optional collection slug to scope the search (e.g. "rosa-parks-papers").'),
    page: z.number().int().min(1).optional().describe('Page number for pagination (1-based).'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Results per page (default 20, max 50).'),
  })
  .strip();

const item = z
  .object({
    item_id: z
      .string()
      .min(1)
      .describe(
        'Library of Congress item ID or full LOC URL (e.g. "item/2003675333" or "https://www.loc.gov/item/2003675333/"). Returns metadata + asset URLs.',
      ),
  })
  .strip();

const collections = z
  .object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Max collections to return (default 20, max 50).'),
  })
  .strip();

export const locSchemas: Record<string, ZodSchema> = {
  'loc.search': search,
  'loc.item': item,
  'loc.collections': collections,
};
