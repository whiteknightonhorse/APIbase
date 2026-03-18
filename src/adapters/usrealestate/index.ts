import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  ForSaleResponse,
  PropertyDetailResponse,
  PropertySearchResult,
  LocationSuggestResponse,
} from './types';

/**
 * US Real Estate API adapter via RapidAPI (UC-063).
 *
 * Supported tools (read-only):
 *   usrealestate.for_sale        → GET /v3/for-sale
 *   usrealestate.property_detail → GET /v3/property-detail
 *   usrealestate.location_suggest → GET /location/suggest
 *
 * Auth: X-RapidAPI-Key + X-RapidAPI-Host headers.
 * Free tier: 500,000 req/month on RapidAPI BASIC plan.
 */
export class UsRealEstateAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'usrealestate',
      baseUrl: 'https://us-real-estate.p.rapidapi.com',
    });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      'X-RapidAPI-Key': this.apiKey,
      'X-RapidAPI-Host': 'us-real-estate.p.rapidapi.com',
      'Content-Type': 'application/json',
    };

    switch (req.toolId) {
      case 'usrealestate.for_sale':
        return this.buildForSaleRequest(params, headers);
      case 'usrealestate.property_detail':
        return this.buildPropertyDetailRequest(params, headers);
      case 'usrealestate.location_suggest':
        return this.buildLocationSuggestRequest(params, headers);
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
    switch (req.toolId) {
      case 'usrealestate.for_sale':
        return this.parseForSaleResponse(raw);
      case 'usrealestate.property_detail':
        return this.parsePropertyDetailResponse(raw);
      case 'usrealestate.location_suggest':
        return this.parseLocationSuggestResponse(raw);
      default:
        return raw.body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildForSaleRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    if (params.city) qs.set('city', String(params.city));
    if (params.state_code) qs.set('state_code', String(params.state_code));
    if (params.postal_code) qs.set('postal_code', String(params.postal_code));
    if (params.price_min !== undefined) qs.set('price_min', String(params.price_min));
    if (params.price_max !== undefined) qs.set('price_max', String(params.price_max));
    if (params.beds_min !== undefined) qs.set('beds_min', String(params.beds_min));
    if (params.baths_min !== undefined) qs.set('baths_min', String(params.baths_min));
    if (params.sqft_min !== undefined) qs.set('sqft_min', String(params.sqft_min));
    if (params.property_type) qs.set('type', String(params.property_type));
    if (params.sort) qs.set('sort', String(params.sort));
    const limit = Math.min(Number(params.limit ?? 10), 42);
    qs.set('limit', String(limit));
    qs.set('offset', String(params.offset ?? 0));

    return {
      url: `${this.baseUrl}/v3/for-sale?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildPropertyDetailRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('property_id', String(params.property_id));

    return {
      url: `${this.baseUrl}/v3/property-detail?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildLocationSuggestRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('input', String(params.query));

    return {
      url: `${this.baseUrl}/location/suggest?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  // ---------------------------------------------------------------------------
  // Response parsers
  // ---------------------------------------------------------------------------

  private parseForSaleResponse(raw: ProviderRawResponse): unknown {
    const body = raw.body as unknown as ForSaleResponse;
    const results = body?.data?.home_search?.results ?? [];
    const total = body?.data?.home_search?.total ?? 0;

    return {
      total,
      count: results.length,
      listings: results.map((r: PropertySearchResult) => ({
        property_id: r.property_id,
        address: r.location?.address?.line,
        city: r.location?.address?.city,
        state: r.location?.address?.state_code,
        zip: r.location?.address?.postal_code,
        price: r.list_price,
        beds: r.description?.beds,
        baths: r.description?.baths,
        sqft: r.description?.sqft,
        lot_sqft: r.description?.lot_sqft,
        year_built: r.description?.year_built,
        type: r.description?.type,
        status: r.status,
        photo: r.primary_photo?.href ?? null,
        latitude: r.location?.coordinate?.lat ?? null,
        longitude: r.location?.coordinate?.lon ?? null,
      })),
    };
  }

  private parsePropertyDetailResponse(raw: ProviderRawResponse): unknown {
    const body = raw.body as unknown as PropertyDetailResponse;
    const d = body?.data ?? {};
    const home = (d.home ?? d) as Record<string, unknown>;
    const desc = (home.description ?? {}) as Record<string, unknown>;
    const locAddr = ((home.location as Record<string, unknown>)?.address ?? {}) as Record<string, unknown>;
    const locCoord = ((home.location as Record<string, unknown>)?.coordinate ?? {}) as Record<string, unknown>;
    const taxHistory = (home.tax_history ?? []) as Array<Record<string, unknown>>;
    const hoa = (home.hoa ?? {}) as Record<string, unknown>;

    return {
      property_id: home.property_id ?? d.property_id,
      address: locAddr.line,
      city: locAddr.city,
      state: locAddr.state_code,
      zip: locAddr.postal_code,
      county: locAddr.county,
      price: home.list_price,
      beds: desc.beds,
      baths: desc.baths,
      sqft: desc.sqft,
      lot_sqft: desc.lot_sqft,
      year_built: desc.year_built,
      type: desc.type,
      stories: desc.stories,
      garage: desc.garage,
      status: home.status,
      days_on_market: home.days_on_market,
      last_sold_date: home.last_sold_date,
      last_sold_price: home.last_sold_price,
      hoa_fee: hoa.fee,
      latitude: locCoord.lat ?? null,
      longitude: locCoord.lon ?? null,
      tax_assessment: taxHistory.length > 0
        ? {
            year: (taxHistory[0] as Record<string, unknown>).year,
            total: ((taxHistory[0] as Record<string, unknown>).assessment as Record<string, unknown>)?.total,
            tax: (taxHistory[0] as Record<string, unknown>).tax,
          }
        : null,
      photos: ((home.photos ?? []) as Array<Record<string, unknown>>).slice(0, 5).map(
        (p) => (p.href as string) ?? null,
      ),
    };
  }

  private parseLocationSuggestResponse(raw: ProviderRawResponse): unknown {
    const body = raw.body as unknown as LocationSuggestResponse;
    const suggestions = body?.data ?? [];

    return {
      count: suggestions.length,
      suggestions: suggestions.slice(0, 10).map((s) => ({
        id: s._id,
        slug: s.slug_id,
        city: s.city,
        state: s.state_code,
        zip: s.postal_code,
        address: s.line,
        latitude: s.centroid?.lat ?? null,
        longitude: s.centroid?.lon ?? null,
      })),
    };
  }
}
