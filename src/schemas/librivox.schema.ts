import { z, type ZodSchema } from 'zod';

const search = z
  .object({
    title: z
      .string()
      .optional()
      .describe('Substring search on audiobook title (e.g. "pride and prejudice", "treasure").'),
    author: z
      .string()
      .optional()
      .describe('Author name search (e.g. "shakespeare", "twain", "tolstoy").'),
    genre: z
      .string()
      .optional()
      .describe(
        'Genre filter — e.g. "Adventure", "Children\'s Fiction", "Mystery", "Plays", "Poetry".',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Max results to return (default 25, max 100).'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Pagination offset for stepping through large result sets.'),
  })
  .strip();

const book = z
  .object({
    book_id: z
      .number()
      .int()
      .min(1)
      .describe(
        'LibriVox audiobook ID (integer). Use librivox.search first to discover IDs. Returns full chapter list with MP3 URLs.',
      ),
  })
  .strip();

export const librivoxSchemas: Record<string, ZodSchema> = {
  'librivox.search': search,
  'librivox.book': book,
};
