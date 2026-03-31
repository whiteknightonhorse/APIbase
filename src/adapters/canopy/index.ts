import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  CanopySearchProduct,
  CanopyProductDetail,
  CanopyOffer,
  CanopyDeal,
  CanopySearchOutput,
  CanopyProductOutput,
  CanopyOffersOutput,
  CanopyDealsOutput,
} from './types';

/**
 * Canopy API adapter (UC-265).
 *
 * Supported tools:
 *   canopy.search  → GET /api/amazon/search
 *   canopy.product → GET /api/amazon/product
 *   canopy.offers  → GET /api/amazon/product/offers
 *   canopy.deals   → GET /api/amazon/deals
 *
 * Auth: API-KEY header. 100 req/month free (Hobby), $0.01/req PAYG.
 * Amazon product data across 12 marketplaces.
 */
export class CanopyAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'canopy',
      baseUrl: 'https://rest.canopyapi.co/api/amazon',
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
    const headers: Record<string, string> = { 'API-KEY': this.apiKey };
    const domain = String(params.domain || 'US');

    switch (req.toolId) {
      case 'canopy.search': {
        const qp = new URLSearchParams();
        qp.set('searchTerm', String(params.query || ''));
        qp.set('domain', domain);
        if (params.page) qp.set('page', String(params.page));
        if (params.sort) qp.set('sortBy', String(params.sort));
        if (params.price_min) qp.set('priceMin', String(params.price_min));
        if (params.price_max) qp.set('priceMax', String(params.price_max));
        return { url: `${this.baseUrl}/search?${qp.toString()}`, method: 'GET', headers };
      }

      case 'canopy.product': {
        const qp = new URLSearchParams();
        qp.set('asin', String(params.asin));
        qp.set('domain', domain);
        return { url: `${this.baseUrl}/product?${qp.toString()}`, method: 'GET', headers };
      }

      case 'canopy.offers': {
        const qp = new URLSearchParams();
        qp.set('asin', String(params.asin));
        qp.set('domain', domain);
        return {
          url: `${this.baseUrl}/product/offers?${qp.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'canopy.deals': {
        const qp = new URLSearchParams();
        qp.set('domain', domain);
        if (params.page) qp.set('page', String(params.page));
        return { url: `${this.baseUrl}/deals?${qp.toString()}`, method: 'GET', headers };
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
    const data = (body.data ?? {}) as Record<string, unknown>;

    switch (req.toolId) {
      case 'canopy.search':
        return this.parseSearch(data);
      case 'canopy.product':
        return this.parseProduct(data);
      case 'canopy.offers':
        return this.parseOffers(data);
      case 'canopy.deals':
        return this.parseDeals(data);
      default:
        return body;
    }
  }

  private parseSearch(data: Record<string, unknown>): CanopySearchOutput {
    const sr = (data.amazonProductSearchResults ?? {}) as Record<string, unknown>;
    const pr = (sr.productResults ?? {}) as Record<string, unknown>;
    const results = (pr.results ?? []) as CanopySearchProduct[];
    const pi = (pr.pageInfo ?? {}) as Record<string, unknown>;

    return {
      products: results.map((p) => ({
        title: p.title ?? '',
        asin: p.asin ?? '',
        price: p.price?.display ?? '',
        price_value: p.price?.value ?? null,
        currency: p.price?.currency ?? 'USD',
        rating: p.rating,
        ratings_total: p.ratingsTotal,
        is_prime: p.isPrime ?? false,
        url: p.url ?? '',
        image: p.mainImageUrl ?? '',
      })),
      page: Number(pi.currentPage) || 1,
      total_pages: Number(pi.totalPages) || 0,
      count: results.length,
    };
  }

  private parseProduct(data: Record<string, unknown>): CanopyProductOutput {
    const p = (data.amazonProduct ?? {}) as CanopyProductDetail;
    return {
      title: p.title ?? '',
      brand: p.brand ?? '',
      asin: p.asin ?? '',
      price: p.price?.display ?? '',
      price_value: p.price?.value ?? null,
      currency: p.price?.currency ?? 'USD',
      rating: p.rating,
      ratings_total: p.ratingsTotal,
      is_prime: p.isPrime ?? false,
      in_stock: p.isInStock ?? false,
      features: p.featureBullets ?? [],
      categories: (p.categories ?? []).map((c) => c.name),
      seller: p.seller?.name ?? '',
      url: p.url ?? '',
      image: p.mainImageUrl ?? '',
    };
  }

  private parseOffers(data: Record<string, unknown>): CanopyOffersOutput {
    const ap = (data.amazonProduct ?? {}) as Record<string, unknown>;
    const op = (ap.offersPaginated ?? {}) as Record<string, unknown>;
    const offers = (op.offers ?? []) as CanopyOffer[];

    return {
      offers: offers.map((o) => ({
        price: o.price?.display ?? '',
        price_value: o.price?.value ?? 0,
        currency: o.price?.currency ?? 'USD',
        condition: o.title ?? '',
        is_prime: o.isPrime ?? false,
        is_buy_box: o.isBuyBoxWinner ?? false,
        seller_name: o.seller?.name ?? '',
        seller_rating: o.seller?.rating ?? null,
        fulfilled_by_amazon: o.delivery?.fulfilledByAmazon ?? false,
        delivery: o.delivery?.comments ?? '',
      })),
      count: offers.length,
    };
  }

  private parseDeals(data: Record<string, unknown>): CanopyDealsOutput {
    const ad = (data.amazonDeals ?? {}) as Record<string, unknown>;
    const pr = (ad.productResults ?? {}) as Record<string, unknown>;
    const results = (pr.results ?? []) as CanopyDeal[];
    const pi = (pr.pageInfo ?? {}) as Record<string, unknown>;

    return {
      deals: results.map((d) => ({
        title: d.title ?? '',
        asin: d.asin ?? '',
        price: d.price?.display ?? '',
        deal_price: d.dealPrice?.display ?? '',
        url: d.dealUrl ?? d.url ?? '',
        image: d.mainImageUrl ?? '',
      })),
      page: Number(pi.currentPage) || 1,
      total_pages: Number(pi.totalPages) || 0,
      count: results.length,
    };
  }
}
