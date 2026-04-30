import { z, type ZodSchema } from 'zod';

const translations = z
  .object({
    language: z
      .string()
      .optional()
      .describe(
        'Optional ISO 639-3 language code (e.g. "eng", "spa", "fra") or English language name substring (e.g. "Spanish") to filter the 1000+ translations.',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe('Max translations to return (default 50, max 200).'),
  })
  .strip();

const books = z
  .object({
    translation: z
      .string()
      .min(1)
      .describe(
        'Bible translation ID (e.g. "KJV", "ASV", "WEB", "BSB"). Use bible.translations to discover IDs.',
      ),
  })
  .strip();

const passage = z
  .object({
    translation: z
      .string()
      .min(1)
      .describe('Bible translation ID (e.g. "KJV", "ASV", "WEB", "BSB").'),
    book: z
      .string()
      .min(1)
      .describe(
        'Book ID — typically a 3-letter code (e.g. "GEN", "JHN", "PSA") or full name. Use bible.books to discover.',
      ),
    chapter: z.number().int().min(1).describe('Chapter number (1-based, e.g. 3 for John 3).'),
  })
  .strip();

const commentaries = z
  .object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Max commentaries to return (default 50, max 100).'),
  })
  .strip();

export const bibleSchemas: Record<string, ZodSchema> = {
  'bible.translations': translations,
  'bible.books': books,
  'bible.passage': passage,
  'bible.commentaries': commentaries,
};
