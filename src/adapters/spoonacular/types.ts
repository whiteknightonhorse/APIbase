/**
 * Spoonacular API response types (UC-031).
 *
 * API host: api.spoonacular.com
 * Auth: query param apiKey=API_KEY
 * Free tier: 150 API points/day
 */

// ---------------------------------------------------------------------------
// Recipe Search (/recipes/complexSearch)
// ---------------------------------------------------------------------------

export interface RecipeSearchResult {
  id: number;
  title: string;
  image?: string;
  imageType?: string;
}

export interface RecipeSearchResponse {
  results: RecipeSearchResult[];
  offset: number;
  number: number;
  totalResults: number;
}

// ---------------------------------------------------------------------------
// Recipe Details (/recipes/{id}/information)
// ---------------------------------------------------------------------------

export interface RecipeIngredient {
  id?: number;
  name?: string;
  amount?: number;
  unit?: string;
  original?: string;
  image?: string;
}

export interface RecipeNutrient {
  name?: string;
  amount?: number;
  unit?: string;
  percentOfDailyNeeds?: number;
}

export interface RecipeDetailsResponse {
  id: number;
  title: string;
  image?: string;
  servings?: number;
  readyInMinutes?: number;
  preparationMinutes?: number;
  cookingMinutes?: number;
  sourceUrl?: string;
  sourceName?: string;
  summary?: string;
  instructions?: string;
  analyzedInstructions?: unknown[];
  extendedIngredients?: RecipeIngredient[];
  nutrition?: {
    nutrients?: RecipeNutrient[];
    caloricBreakdown?: {
      percentProtein?: number;
      percentFat?: number;
      percentCarbs?: number;
    };
  };
  vegetarian?: boolean;
  vegan?: boolean;
  glutenFree?: boolean;
  dairyFree?: boolean;
  healthScore?: number;
  spoonacularScore?: number;
  pricePerServing?: number;
  cuisines?: string[];
  dishTypes?: string[];
  diets?: string[];
}

// ---------------------------------------------------------------------------
// Find by Ingredients (/recipes/findByIngredients)
// ---------------------------------------------------------------------------

export interface ByIngredientsIngredient {
  id?: number;
  name?: string;
  amount?: number;
  unit?: string;
  image?: string;
}

export interface ByIngredientsResult {
  id: number;
  title: string;
  image?: string;
  usedIngredientCount?: number;
  missedIngredientCount?: number;
  likes?: number;
  usedIngredients?: ByIngredientsIngredient[];
  missedIngredients?: ByIngredientsIngredient[];
}

export type ByIngredientsResponse = ByIngredientsResult[];

// ---------------------------------------------------------------------------
// Ingredient Search (/food/ingredients/search)
// ---------------------------------------------------------------------------

export interface IngredientSearchResult {
  id: number;
  name: string;
  image?: string;
}

export interface IngredientSearchResponse {
  results: IngredientSearchResult[];
  offset: number;
  number: number;
  totalResults: number;
}

// ---------------------------------------------------------------------------
// Analyze Recipe (/recipes/analyze)
// ---------------------------------------------------------------------------

export interface AnalyzeRecipeResponse {
  vegetarian?: boolean;
  vegan?: boolean;
  glutenFree?: boolean;
  dairyFree?: boolean;
  servings?: number;
  readyInMinutes?: number;
  sourceUrl?: string;
  nutrition?: {
    nutrients?: RecipeNutrient[];
    caloricBreakdown?: {
      percentProtein?: number;
      percentFat?: number;
      percentCarbs?: number;
    };
  };
  extendedIngredients?: RecipeIngredient[];
  [key: string]: unknown;
}
