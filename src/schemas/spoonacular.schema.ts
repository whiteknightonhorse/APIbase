import { z, type ZodSchema } from 'zod';

const recipeSearch = z
  .object({
    query: z.string().optional().describe('Search query for recipes (e.g. "pasta", "chicken soup")'),
    cuisine: z
      .string()
      .optional()
      .describe('Cuisine filter — comma-separated (e.g. "italian", "mexican,chinese")'),
    diet: z
      .string()
      .optional()
      .describe('Diet filter: gluten free, ketogenic, vegetarian, lacto-vegetarian, ovo-vegetarian, vegan, pescetarian, paleo, primal, whole30'),
    intolerances: z
      .string()
      .optional()
      .describe('Intolerances filter — comma-separated (e.g. "dairy,gluten,peanut,shellfish")'),
    type: z
      .string()
      .optional()
      .describe('Meal type: main course, side dish, dessert, appetizer, salad, bread, breakfast, soup, beverage, sauce, marinade, fingerfood, snack, drink'),
    max_ready_time: z.number().int().optional().describe('Maximum preparation time in minutes'),
    number: z.number().int().min(1).max(100).optional().describe('Number of results to return (default 10, max 100)'),
    offset: z.number().int().min(0).optional().describe('Offset for pagination (default 0)'),
  })
  .strip();

const recipeDetails = z
  .object({
    id: z.number().int().describe('Spoonacular recipe ID (from recipe_search or by_ingredients results)'),
  })
  .strip();

const byIngredients = z
  .object({
    ingredients: z
      .string()
      .describe('Comma-separated list of ingredients you have (e.g. "chicken,rice,tomato")'),
    number: z.number().int().min(1).max(100).optional().describe('Number of results to return (default 10, max 100)'),
    ranking: z
      .number()
      .int()
      .min(1)
      .max(2)
      .optional()
      .describe('Ranking mode: 1 = maximize used ingredients, 2 = minimize missing ingredients (default 1)'),
    ignore_pantry: z
      .boolean()
      .optional()
      .describe('Ignore common pantry items like water, flour, salt (default false)'),
  })
  .strip();

const ingredientSearch = z
  .object({
    query: z.string().describe('Ingredient search query (e.g. "banana", "olive oil", "chicken breast")'),
    number: z.number().int().min(1).max(100).optional().describe('Number of results to return (default 10, max 100)'),
    sort: z
      .enum(['calories', 'protein', 'fat', 'carbs'])
      .optional()
      .describe('Sort results by nutrient value'),
    sort_direction: z
      .enum(['asc', 'desc'])
      .optional()
      .describe('Sort direction (default asc)'),
  })
  .strip();

const analyzeRecipe = z
  .object({
    title: z.string().describe('Recipe title (e.g. "Spaghetti Carbonara")'),
    ingredients: z
      .array(z.string())
      .describe('List of ingredient strings (e.g. ["200g spaghetti", "100g guanciale", "2 eggs"])'),
    instructions: z
      .string()
      .optional()
      .describe('Cooking instructions as plain text'),
    servings: z.number().int().min(1).optional().describe('Number of servings (default 1)'),
  })
  .strip();

export const spoonacularSchemas: Record<string, ZodSchema> = {
  'spoonacular.recipe_search': recipeSearch,
  'spoonacular.recipe_details': recipeDetails,
  'spoonacular.by_ingredients': byIngredients,
  'spoonacular.ingredient_search': ingredientSearch,
  'spoonacular.analyze_recipe': analyzeRecipe,
};
