import { BaseAdapter } from '../base.adapter';
import { type ProviderRequest, type ProviderRawResponse, ProviderErrorCode } from '../../types/provider';

export class OpenFoodFactsAdapter extends BaseAdapter {
  constructor() { super({ provider: 'openfoodfacts', baseUrl: 'https://world.openfoodfacts.org' }); }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const h: Record<string, string> = { Accept: 'application/json', 'User-Agent': 'APIbase/1.0 (https://apibase.pro)' };
    switch (req.toolId) {
      case 'food.barcode':
        return { url: `${this.baseUrl}/api/v2/product/${encodeURIComponent(String(p.barcode))}.json`, method: 'GET', headers: h };
      case 'food.search': {
        const qs = new URLSearchParams(); qs.set('search_terms', String(p.query)); qs.set('json', '1');
        qs.set('page_size', String(Math.min(Number(p.limit ?? 10), 50)));
        return { url: `${this.baseUrl}/cgi/search.pl?${qs}`, method: 'GET', headers: h };
      }
      default: throw { code: ProviderErrorCode.INVALID_RESPONSE, httpStatus: 502, message: `Unsupported: ${req.toolId}`, provider: this.provider, toolId: req.toolId, durationMs: 0 };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as Record<string, unknown>;
    if (req.toolId === 'food.barcode') {
      const p = (body.product ?? {}) as Record<string, unknown>;
      const nut = (p.nutriments ?? {}) as Record<string, unknown>;
      return { name: p.product_name, brand: p.brands, barcode: p.code, categories: p.categories, nutriscore: p.nutriscore_grade, nova_group: p.nova_group, ingredients: (p.ingredients_text as string)?.slice(0, 500), calories_100g: nut['energy-kcal_100g'], fat_100g: nut.fat_100g, carbs_100g: nut.carbohydrates_100g, protein_100g: nut.proteins_100g, image: p.image_url };
    }
    const products = (body.products ?? []) as Array<Record<string, unknown>>;
    return { total: body.count, products: products.slice(0, 20).map(p => ({ name: p.product_name, brand: p.brands, barcode: p.code, nutriscore: p.nutriscore_grade, image: p.image_small_url })) };
  }
}
