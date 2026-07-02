import { z, type ZodSchema } from 'zod';

const questions = z
  .object({
    amount: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of trivia questions to return (default 10, max 50).'),
    category: z
      .number()
      .int()
      .optional()
      .describe(
        'Category ID to filter by (e.g. 9=General Knowledge, 17=Science & Nature, 21=Sports, 23=History). Use opentdb.trivia.categories to list all 24 IDs.',
      ),
    difficulty: z
      .enum(['easy', 'medium', 'hard'])
      .optional()
      .describe('Difficulty filter: easy, medium, or hard. Omit for mixed difficulty.'),
    type: z
      .enum(['multiple', 'boolean'])
      .optional()
      .describe(
        'Question type: multiple (4 choices) or boolean (True/False). Omit for both types.',
      ),
  })
  .strip();

const categories = z
  .object({
    _placeholder: z
      .string()
      .optional()
      .describe(
        'No parameters required — returns all 24 trivia categories with their numeric IDs.',
      ),
  })
  .strip();

const categoryCount = z
  .object({
    category_id: z
      .number()
      .int()
      .min(9)
      .max(32)
      .describe(
        'Category ID (9–32). Use opentdb.trivia.categories to list all IDs. Examples: 9=General Knowledge, 17=Science & Nature, 21=Sports, 23=History.',
      ),
  })
  .strip();

const globalCount = z
  .object({
    _placeholder: z
      .string()
      .optional()
      .describe(
        'No parameters required — returns global question counts and per-category breakdown.',
      ),
  })
  .strip();

export const opentdbSchemas: Record<string, ZodSchema> = {
  'opentdb.questions': questions,
  'opentdb.categories': categories,
  'opentdb.category_count': categoryCount,
  'opentdb.global_count': globalCount,
};
