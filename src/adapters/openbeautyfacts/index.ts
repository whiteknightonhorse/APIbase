import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';

export class OpenBeautyFactsAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'openbeautyfacts', baseUrl: 'https://world.openbeautyfacts.org' });
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const h: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'APIbase/1.0 (https://apibase.pro)',
    };
    switch (req.toolId) {
      case 'openbeautyfacts.barcode':
        return {
          url: `${this.baseUrl}/api/v2/product/${encodeURIComponent(String(p.barcode))}.json`,
          method: 'GET',
          headers: h,
        };
      case 'openbeautyfacts.search': {
        const qs = new URLSearchParams();
        qs.set('search_terms', String(p.query));
        qs.set('page_size', String(Math.min(Number(p.limit ?? 10), 50)));
        qs.set('fields', 'code,product_name,brands,categories_tags,image_url,quantity');
        return { url: `${this.baseUrl}/api/v2/search?${qs}`, method: 'GET', headers: h };
      }
      default:
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 502,
          message: `Unsupported: ${req.toolId}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
        };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as Record<string, unknown>;
    if (req.toolId === 'openbeautyfacts.barcode') {
      const p = (body.product ?? {}) as Record<string, unknown>;
      if (body.status === 0) {
        return { found: false, barcode: body.code };
      }
      return {
        found: true,
        name: p.product_name,
        brand: p.brands,
        barcode: p.code,
        categories: p.categories,
        quantity: p.quantity,
        ingredients: (p.ingredients_text as string)?.slice(0, 1000),
        image: p.image_url,
      };
    }
    const products = (body.products ?? []) as Array<Record<string, unknown>>;
    return {
      total: body.count,
      products: products.slice(0, 50).map((p) => ({
        name: p.product_name,
        brand: p.brands,
        barcode: p.code,
        categories: p.categories_tags,
        quantity: p.quantity,
        image: p.image_url,
      })),
    };
  }
}
