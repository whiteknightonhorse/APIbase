import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { OpenBreweryRecord } from './types';

const FILTER_PARAMS = [
  'by_city',
  'by_country',
  'by_dist',
  'by_ids',
  'by_name',
  'by_state',
  'by_postal',
  'by_type',
  'sort',
] as const;

function toBrewerySummary(b: OpenBreweryRecord) {
  return {
    id: b.id,
    name: b.name,
    brewery_type: b.brewery_type,
    address: [b.address_1, b.address_2, b.address_3].filter(Boolean).join(', ') || null,
    city: b.city,
    state_province: b.state_province,
    postal_code: b.postal_code,
    country: b.country,
    longitude: b.longitude,
    latitude: b.latitude,
    phone: b.phone,
    website_url: b.website_url,
  };
}

/**
 * Open Brewery DB adapter (UC-736).
 * Directory of 8,000+ breweries, cideries, and brewpubs (US-heavy, some
 * international coverage). No auth, no documented rate limit, MIT-licensed
 * open source project — commercial reuse permitted.
 * https://www.openbrewerydb.org/documentation
 */
export class OpenBreweryAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'openbrewery',
      baseUrl: 'https://api.openbrewerydb.org/v1',
      maxResponseBytes: 2_000_000,
    });
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'openbrewery.list': {
        const qs = new URLSearchParams();
        for (const key of FILTER_PARAMS) {
          if (p[key] !== undefined && p[key] !== null && p[key] !== '') {
            qs.set(key, String(p[key]));
          }
        }
        qs.set('page', String(p.page ?? 1));
        qs.set('per_page', String(Math.max(1, Math.min(200, Number(p.per_page ?? 50)))));
        return {
          url: `${this.baseUrl}/breweries?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }
      case 'openbrewery.search': {
        const qs = new URLSearchParams();
        qs.set('query', String(p.query ?? ''));
        qs.set('page', String(p.page ?? 1));
        qs.set('per_page', String(Math.max(1, Math.min(200, Number(p.per_page ?? 50)))));
        return {
          url: `${this.baseUrl}/breweries/search?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }
      case 'openbrewery.random': {
        const qs = new URLSearchParams();
        qs.set('size', String(Math.max(1, Math.min(50, Number(p.size ?? 1)))));
        return {
          url: `${this.baseUrl}/breweries/random?${qs.toString()}`,
          method: 'GET',
          headers,
        };
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
    switch (req.toolId) {
      case 'openbrewery.list':
      case 'openbrewery.search':
      case 'openbrewery.random': {
        const list = (raw.body as OpenBreweryRecord[]) ?? [];
        return { total: list.length, breweries: list.map(toBrewerySummary) };
      }
      default:
        return raw.body;
    }
  }
}
