import { z, type ZodSchema } from 'zod';

const isbnLookup = z
  .object({
    isbn: z
      .string()
      .describe('ISBN-10 or ISBN-13 to look up (e.g. "9780451524935" for 1984, "0140449132" for The Republic)'),
  })
  .strip();

const search = z
  .object({
    query: z
      .string()
      .optional()
      .describe('General search query across title, author, and full text (e.g. "dune frank herbert")'),
    title: z
      .string()
      .optional()
      .describe('Search by book title only (e.g. "The Great Gatsby")'),
    author: z
      .string()
      .optional()
      .describe('Search by author name (e.g. "Tolkien")'),
    subject: z
      .string()
      .optional()
      .describe('Search by subject/genre (e.g. "science fiction", "history")'),
    isbn: z
      .string()
      .optional()
      .describe('Search by ISBN number'),
    sort: z
      .enum(['new', 'old', 'rating', 'readinglog', 'want_to_read', 'currently_reading', 'already_read'])
      .optional()
      .describe('Sort order: "new" (newest first), "old" (oldest), "rating" (highest rated)'),
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Page number for pagination (default: 1)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Results per page (default: 10, max: 100)'),
  })
  .strip();

const workDetails = z
  .object({
    olid: z
      .string()
      .describe('Open Library Work ID, e.g. "OL45804W" for Lord of the Rings. Get from search results key field'),
  })
  .strip();

const author = z
  .object({
    olid: z
      .string()
      .describe('Open Library Author ID, e.g. "OL23919A" for J.R.R. Tolkien. Get from search or work author keys'),
  })
  .strip();

export const openlibrarySchemas: Record<string, ZodSchema> = {
  'books.isbn_lookup': isbnLookup,
  'books.search': search,
  'books.work_details': workDetails,
  'books.author': author,
};
