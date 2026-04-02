import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { CocktailDbDrink, CocktailSearchOutput } from './types';

/**
 * TheCocktailDB adapter (UC-304).
 *
 * Supported tools:
 *   cocktail.search → /search.php or /filter.php
 *   cocktail.random → /random.php
 *
 * Auth: None (test key "1"). Free unlimited. 10,000+ cocktail recipes.
 */
export class CocktailDbAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'cocktaildb',
      baseUrl: 'https://www.thecocktaildb.com/api/json/v1/1',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'cocktail.search': {
        if (params.ingredient) {
          return {
            url: `${this.baseUrl}/filter.php?i=${encodeURIComponent(String(params.ingredient))}`,
            method: 'GET',
            headers,
          };
        }
        const query = String(params.name || 'margarita');
        return {
          url: `${this.baseUrl}/search.php?s=${encodeURIComponent(query)}`,
          method: 'GET',
          headers,
        };
      }

      case 'cocktail.random':
        return {
          url: `${this.baseUrl}/random.php`,
          method: 'GET',
          headers,
        };

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
    const body = raw.body as Record<string, unknown>;
    const drinks = (body.drinks ?? []) as CocktailDbDrink[];

    // filter.php returns minimal data (no instructions/ingredients)
    if (req.toolId === 'cocktail.search' && (req.params as Record<string, unknown>).ingredient) {
      return {
        cocktails: drinks.map((d) => ({
          id: d.idDrink ?? '',
          name: d.strDrink ?? '',
          image: d.strDrinkThumb ?? '',
        })),
        count: drinks.length,
      };
    }

    return this.parseFull(drinks);
  }

  private parseFull(drinks: CocktailDbDrink[]): CocktailSearchOutput {
    return {
      cocktails: drinks.map((d) => {
        const ingredients: { name: string; measure: string }[] = [];
        for (let i = 1; i <= 6; i++) {
          const name = (d as unknown as Record<string, unknown>)[`strIngredient${i}`] as
            | string
            | null;
          const measure = (d as unknown as Record<string, unknown>)[`strMeasure${i}`] as
            | string
            | null;
          if (name && name.trim()) {
            ingredients.push({ name: name.trim(), measure: (measure ?? '').trim() });
          }
        }
        return {
          id: d.idDrink ?? '',
          name: d.strDrink ?? '',
          category: d.strCategory ?? '',
          glass: d.strGlass ?? '',
          instructions: d.strInstructions ?? '',
          image: d.strDrinkThumb ?? '',
          ingredients,
        };
      }),
      count: drinks.length,
    };
  }
}
