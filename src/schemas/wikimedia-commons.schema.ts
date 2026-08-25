import { z, type ZodSchema } from 'zod';

const search = z
  .object({
    query: z
      .string()
      .min(1)
      .describe('Search keywords for Wikimedia Commons files (e.g. "Eiffel Tower")'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of results to return (1-50, default 10)'),
  })
  .strip();

const fileInfo = z
  .object({
    title: z
      .string()
      .min(1)
      .describe(
        'Commons file title, with or without the "File:" prefix (e.g. "File:Tour Eiffel Wikimedia Commons.jpg")',
      ),
  })
  .strip();

const categoryFiles = z
  .object({
    category: z
      .string()
      .min(1)
      .describe(
        'Commons category name, with or without the "Category:" prefix (e.g. "Category:Eiffel Tower")',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of files to return (1-50, default 20)'),
    cursor: z
      .string()
      .optional()
      .describe(
        "Pagination cursor from a previous call's next_cursor field, to fetch the next page",
      ),
  })
  .strip();

const random = z
  .object({
    count: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe('Number of random files to return (1-20, default 5)'),
  })
  .strip();

export const wikimediaCommonsSchemas: Record<string, ZodSchema> = {
  'wikimedia-commons.search': search,
  'wikimedia-commons.file_info': fileInfo,
  'wikimedia-commons.category_files': categoryFiles,
  'wikimedia-commons.random': random,
};
