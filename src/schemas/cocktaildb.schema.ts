import { z, type ZodSchema } from 'zod';

const search = z
  .object({
    name: z
      .string()
      .optional()
      .describe('Cocktail name to search (e.g. "margarita", "mojito", "old fashioned")'),
    ingredient: z
      .string()
      .optional()
      .describe(
        'Filter by ingredient (e.g. "Vodka", "Rum", "Gin"). Returns cocktails containing this ingredient. Use name OR ingredient, not both.',
      ),
  })
  .strip();

const random = z
  .object({
    count: z
      .number()
      .int()
      .min(1)
      .max(1)
      .optional()
      .default(1)
      .describe('Always returns 1 random cocktail with full recipe'),
  })
  .strip();

export const cocktaildbSchemas: Record<string, ZodSchema> = {
  'cocktail.search': search,
  'cocktail.random': random,
};
