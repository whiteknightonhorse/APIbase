import { z, type ZodSchema } from 'zod';

const search = z
  .object({
    query: z
      .string()
      .optional()
      .describe(
        'Free-text search across title, author name, and subject (e.g. "shakespeare", "moby dick").',
      ),
    language: z
      .string()
      .optional()
      .describe(
        'ISO 639-1 language code or comma-separated codes to filter by language (e.g. "en", "fr,de").',
      ),
    topic: z
      .string()
      .optional()
      .describe('Subject/bookshelf topic filter (e.g. "Adventure", "Children\'s literature").'),
    author_year_start: z
      .number()
      .int()
      .optional()
      .describe(
        'Filter by author birth year — only include books from authors alive in this period start.',
      ),
    author_year_end: z
      .number()
      .int()
      .optional()
      .describe(
        'Filter by author birth year — only include books from authors alive up to this year.',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Max results to return (default 20, max 50).'),
  })
  .strip();

const book = z
  .object({
    book_id: z
      .number()
      .int()
      .min(1)
      .describe(
        'Project Gutenberg book ID (e.g. 1342 for Pride and Prejudice, 11 for Alice in Wonderland).',
      ),
  })
  .strip();

const byAuthor = z
  .object({
    author: z
      .string()
      .min(1)
      .describe('Author name search (e.g. "Jane Austen", "Mark Twain", "Tolstoy").'),
    language: z
      .string()
      .optional()
      .describe('Optional ISO 639-1 language code to filter by language (e.g. "en").'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Max results to return (default 20, max 50).'),
  })
  .strip();

const popular = z
  .object({
    language: z
      .string()
      .optional()
      .describe('Optional ISO 639-1 language code to filter (e.g. "en").'),
    topic: z
      .string()
      .optional()
      .describe('Optional subject/bookshelf to filter (e.g. "Adventure").'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Max results to return (default 20, max 50).'),
  })
  .strip();

export const gutendexSchemas: Record<string, ZodSchema> = {
  'gutendex.search': search,
  'gutendex.book': book,
  'gutendex.by_author': byAuthor,
  'gutendex.popular': popular,
};
