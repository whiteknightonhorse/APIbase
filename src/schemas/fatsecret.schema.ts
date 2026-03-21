import { z, type ZodSchema } from 'zod';

const foodSearch = z.object({
  query: z.string().min(1).describe('Food name to search (e.g. "chicken breast", "banana", "greek yogurt")'),
  page: z.number().int().min(0).optional().describe('Page number for pagination (default 0)'),
  max_results: z.number().int().min(1).max(50).optional().describe('Results per page (default 20, max 50)'),
}).strip();

const foodDetails = z.object({
  food_id: z.string().min(1).describe('FatSecret food ID from search results (e.g. "33691" for chicken breast)'),
}).strip();

export const fatsecretSchemas: Record<string, ZodSchema> = {
  'fatsecret.food_search': foodSearch,
  'fatsecret.food_details': foodDetails,
};
