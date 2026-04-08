import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import { stripHtml } from '../../utils/strip-html';
import type {
  WgerExerciseSearchOutput,
  WgerExerciseDetailOutput,
  WgerIngredientsOutput,
  ExerciseSearchResult,
  IngredientResult,
} from './types';

const WGER_BASE = 'https://wger.de';

/**
 * Wger adapter (UC-360).
 *
 * Open exercise + nutrition database. 896 exercises, 1.28M ingredients.
 * CC-BY-SA, no auth, unlimited. First fitness provider on platform.
 */
export class WgerAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'wger', baseUrl: WGER_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'wger.exercise_search': {
        const term = encodeURIComponent(String(params.term));
        return {
          url: `${WGER_BASE}/api/v2/exercise/search/?term=${term}&language=english&format=json`,
          method: 'GET',
          headers,
        };
      }

      case 'wger.exercise_details': {
        const id = Number(params.id);
        return {
          url: `${WGER_BASE}/api/v2/exerciseinfo/${id}/?format=json`,
          method: 'GET',
          headers,
        };
      }

      case 'wger.ingredients': {
        const name = encodeURIComponent(String(params.name));
        const limit = Math.min(Number(params.limit) || 10, 20);
        return {
          url: `${WGER_BASE}/api/v2/ingredient/?language=2&name=${name}&limit=${limit}&format=json`,
          method: 'GET',
          headers,
        };
      }

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

    switch (req.toolId) {
      case 'wger.exercise_search':
        return this.parseExerciseSearch(body);
      case 'wger.exercise_details':
        return this.parseExerciseDetails(body);
      case 'wger.ingredients':
        return this.parseIngredients(body);
      default:
        return body;
    }
  }

  private parseExerciseSearch(body: Record<string, unknown>): WgerExerciseSearchOutput {
    const suggestions = (body.suggestions ?? []) as Record<string, unknown>[];
    return {
      total: suggestions.length,
      results: suggestions.slice(0, 20).map((s): ExerciseSearchResult => {
        const data = (s.data ?? {}) as Record<string, unknown>;
        return {
          id: Number(data.base_id ?? data.id ?? 0),
          name: String(data.name ?? s.value ?? ''),
          category: String(data.category ?? ''),
        };
      }),
    };
  }

  private parseExerciseDetails(body: Record<string, unknown>): WgerExerciseDetailOutput {
    const category = (body.category ?? {}) as Record<string, unknown>;
    const muscles = (body.muscles ?? []) as Record<string, unknown>[];
    const musclesSec = (body.muscles_secondary ?? []) as Record<string, unknown>[];
    const equipment = (body.equipment ?? []) as Record<string, unknown>[];
    const translations = (body.translations ?? []) as Record<string, unknown>[];

    // Find English description
    const enTranslation = translations.find((t) => Number(t.language) === 2) as
      | Record<string, unknown>
      | undefined;

    return {
      id: Number(body.id ?? 0),
      name: String(enTranslation?.name ?? body.name ?? ''),
      description: stripHtml(String(enTranslation?.description ?? '')).slice(0, 500),
      category: String(category.name ?? ''),
      muscles: muscles.map((m) => String(m.name_en ?? m.name ?? '')),
      muscles_secondary: musclesSec.map((m) => String(m.name_en ?? m.name ?? '')),
      equipment: equipment.map((e) => String(e.name ?? '')),
    };
  }

  private parseIngredients(body: Record<string, unknown>): WgerIngredientsOutput {
    const results = (body.results ?? []) as Record<string, unknown>[];
    return {
      total: Number(body.count ?? results.length),
      results: results.map(
        (r): IngredientResult => ({
          id: Number(r.id ?? 0),
          name: String(r.name ?? ''),
          energy_kcal: Number(r.energy ?? 0),
          protein_g: Number(r.protein ?? 0),
          carbs_g: Number(r.carbohydrates ?? 0),
          fat_g: Number(r.fat ?? 0),
          fiber_g: r.fiber != null ? Number(r.fiber) : null,
          sugar_g: r.sugar != null ? Number(r.sugar) : null,
          sodium_g: r.sodium != null ? Number(r.sodium) : null,
        }),
      ),
    };
  }
}
