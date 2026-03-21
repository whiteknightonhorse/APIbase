import { BaseAdapter } from '../base.adapter';
import type { ProviderRequest, ProviderRawResponse } from '../../types/provider';
import { FatSecretAuth } from './auth';

export class FatSecretAdapter extends BaseAdapter {
  private readonly auth: FatSecretAuth;
  private currentToken = '';

  constructor(clientId: string, clientSecret: string) {
    super({ timeout: 10_000, maxRetries: 2, maxResponseSize: 512_000 });
    this.auth = new FatSecretAuth(clientId, clientSecret);
  }

  async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    this.currentToken = await this.auth.getToken();
    return super.call(req);
  }

  buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = (req.params ?? {}) as Record<string, unknown>;

    switch (req.toolId) {
      case 'fatsecret.food_search': {
        const query = String(params.query ?? '');
        const page = params.page ?? 0;
        const maxResults = params.max_results ?? 20;
        return {
          url: 'https://platform.fatsecret.com/rest/server.api',
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.currentToken}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `method=foods.search&search_expression=${encodeURIComponent(query)}&page_number=${page}&max_results=${maxResults}&format=json`,
        };
      }

      case 'fatsecret.food_details': {
        const foodId = String(params.food_id ?? '');
        return {
          url: 'https://platform.fatsecret.com/rest/server.api',
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.currentToken}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `method=food.get.v4&food_id=${encodeURIComponent(foodId)}&format=json`,
        };
      }

      default:
        throw new Error(`Unknown tool: ${req.toolId}`);
    }
  }

  parseResponse(raw: ProviderRawResponse, _req: ProviderRequest): ProviderRawResponse {
    const body =
      typeof raw.body === 'string' ? JSON.parse(raw.body) : raw.body;

    if (body?.error) {
      return {
        ...raw,
        status: 502,
        body: { error: body.error.message ?? 'FatSecret request failed', code: body.error.code },
      };
    }

    // food_search response
    if (body?.foods) {
      const foods = body.foods.food;
      if (!foods) {
        return { ...raw, body: { foods: [], total_results: 0, page: 0 } };
      }
      const list = Array.isArray(foods) ? foods : [foods];
      return {
        ...raw,
        body: {
          foods: list.map((f: Record<string, unknown>) => ({
            food_id: f.food_id,
            food_name: f.food_name,
            food_type: f.food_type,
            brand_name: f.brand_name || null,
            food_url: f.food_url,
            food_description: f.food_description,
          })),
          total_results: Number(body.foods.total_results ?? list.length),
          page: Number(body.foods.page_number ?? 0),
          max_results: Number(body.foods.max_results ?? 20),
        },
      };
    }

    // food_details response
    if (body?.food) {
      const f = body.food;
      const servings = f.servings?.serving;
      const servingList = servings
        ? (Array.isArray(servings) ? servings : [servings])
        : [];

      return {
        ...raw,
        body: {
          food_id: f.food_id,
          food_name: f.food_name,
          food_type: f.food_type,
          brand_name: f.brand_name || null,
          food_url: f.food_url,
          servings: servingList.map((s: Record<string, unknown>) => ({
            serving_description: s.serving_description,
            serving_url: s.serving_url,
            metric_serving_amount: s.metric_serving_amount,
            metric_serving_unit: s.metric_serving_unit,
            calories: s.calories,
            fat: s.fat,
            saturated_fat: s.saturated_fat,
            carbohydrate: s.carbohydrate,
            fiber: s.fiber,
            sugar: s.sugar,
            protein: s.protein,
            cholesterol: s.cholesterol,
            sodium: s.sodium,
            potassium: s.potassium,
            calcium: s.calcium,
            iron: s.iron,
            vitamin_a: s.vitamin_a,
            vitamin_c: s.vitamin_c,
          })),
        },
      };
    }

    return raw;
  }
}
