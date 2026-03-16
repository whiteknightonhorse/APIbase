import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  RecipeSearchResponse,
  RecipeDetailsResponse,
  ByIngredientsResponse,
  IngredientSearchResponse,
  AnalyzeRecipeResponse,
} from './types';

/**
 * Spoonacular API adapter (UC-031).
 *
 * Supported tools (Phase 1, read-only):
 *   spoonacular.recipe_search    → GET /recipes/complexSearch
 *   spoonacular.recipe_details   → GET /recipes/{id}/information
 *   spoonacular.by_ingredients   → GET /recipes/findByIngredients
 *   spoonacular.ingredient_search→ GET /food/ingredients/search
 *   spoonacular.analyze_recipe   → POST /recipes/analyze
 *
 * Auth: query param apiKey=API_KEY.
 * Free tier: 150 API points/day.
 */
export class SpoonacularAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'spoonacular',
      baseUrl: 'https://api.spoonacular.com',
    });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    switch (req.toolId) {
      case 'spoonacular.recipe_search':
        return this.buildRecipeSearchRequest(params, headers);
      case 'spoonacular.recipe_details':
        return this.buildRecipeDetailsRequest(params, headers);
      case 'spoonacular.by_ingredients':
        return this.buildByIngredientsRequest(params, headers);
      case 'spoonacular.ingredient_search':
        return this.buildIngredientSearchRequest(params, headers);
      case 'spoonacular.analyze_recipe':
        return this.buildAnalyzeRecipeRequest(params, headers);
      default:
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 502,
          message: `Unsupported tool: ${req.toolId}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
        };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body;

    switch (req.toolId) {
      case 'spoonacular.recipe_search': {
        const data = body as RecipeSearchResponse;
        if (!data.results) {
          throw new Error('Missing results in recipe search response');
        }
        return data;
      }
      case 'spoonacular.recipe_details': {
        const data = body as RecipeDetailsResponse;
        if (!data.id) {
          throw new Error('Missing id in recipe details response');
        }
        return data;
      }
      case 'spoonacular.by_ingredients': {
        const data = body as ByIngredientsResponse;
        if (!Array.isArray(data)) {
          throw new Error('Expected array in by-ingredients response');
        }
        return data;
      }
      case 'spoonacular.ingredient_search': {
        const data = body as IngredientSearchResponse;
        if (!data.results) {
          throw new Error('Missing results in ingredient search response');
        }
        return data;
      }
      case 'spoonacular.analyze_recipe': {
        const data = body as AnalyzeRecipeResponse;
        return data;
      }
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildRecipeSearchRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('apiKey', this.apiKey);
    if (params.query) qs.set('query', String(params.query));
    if (params.cuisine) qs.set('cuisine', String(params.cuisine));
    if (params.diet) qs.set('diet', String(params.diet));
    if (params.intolerances) qs.set('intolerances', String(params.intolerances));
    if (params.type) qs.set('type', String(params.type));
    if (params.max_ready_time) qs.set('maxReadyTime', String(params.max_ready_time));
    if (params.number) qs.set('number', String(params.number));
    else qs.set('number', '10');
    if (params.offset) qs.set('offset', String(params.offset));
    qs.set('addRecipeNutrition', 'true');

    return {
      url: `${this.baseUrl}/recipes/complexSearch?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildRecipeDetailsRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const id = String(params.id);
    const qs = new URLSearchParams();
    qs.set('apiKey', this.apiKey);
    qs.set('includeNutrition', 'true');

    return {
      url: `${this.baseUrl}/recipes/${id}/information?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildByIngredientsRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('apiKey', this.apiKey);
    qs.set('ingredients', String(params.ingredients));
    if (params.number) qs.set('number', String(params.number));
    else qs.set('number', '10');
    if (params.ranking) qs.set('ranking', String(params.ranking));
    if (params.ignore_pantry !== undefined) qs.set('ignorePantry', String(params.ignore_pantry));

    return {
      url: `${this.baseUrl}/recipes/findByIngredients?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildIngredientSearchRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('apiKey', this.apiKey);
    qs.set('query', String(params.query));
    if (params.number) qs.set('number', String(params.number));
    else qs.set('number', '10');
    if (params.sort) qs.set('sort', String(params.sort));
    if (params.sort_direction) qs.set('sortDirection', String(params.sort_direction));
    qs.set('addChildren', 'true');

    return {
      url: `${this.baseUrl}/food/ingredients/search?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildAnalyzeRecipeRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string>; body: string } {
    const qs = new URLSearchParams();
    qs.set('apiKey', this.apiKey);
    qs.set('includeNutrition', 'true');
    qs.set('includeTaste', 'false');

    const body: Record<string, unknown> = {};
    if (params.title) body.title = String(params.title);
    if (params.ingredients) body.ingredients = params.ingredients;
    if (params.instructions) body.instructions = String(params.instructions);
    if (params.servings) body.servings = Number(params.servings);

    return {
      url: `${this.baseUrl}/recipes/analyze?${qs.toString()}`,
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    };
  }
}
