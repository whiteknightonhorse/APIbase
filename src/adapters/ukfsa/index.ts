import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { FsaEstablishmentsResponse, FsaEstablishment, FsaAuthoritiesResponse } from './types';

/**
 * UK Food Standards Agency (FSA) — Food Hygiene Rating Scheme adapter (UC-429).
 *
 * Supported tools:
 *   ukfsa.establishment_search  → GET /Establishments (search with query params)
 *   ukfsa.establishment_details → GET /Establishments/{id}
 *   ukfsa.local_authorities     → GET /Authorities
 *
 * Auth: none — open public API under Open Government Licence v3.0.
 * Required header: x-api-version: 2 (version negotiator — API returns 404 without it).
 * All string params are URL-encoded per flywheel [2026-04-05].
 */
export class UkfsaAdapter extends BaseAdapter {
  private static readonly UKFSA_BASE = 'https://api.ratings.food.gov.uk';

  constructor() {
    super({
      provider: 'ukfsa',
      baseUrl: UkfsaAdapter.UKFSA_BASE,
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    switch (req.toolId) {
      case 'ukfsa.establishment_search':
        return this.buildEstablishmentSearch(req.params as Record<string, unknown>);
      case 'ukfsa.establishment_details':
        return this.buildEstablishmentDetails(req.params as Record<string, unknown>);
      case 'ukfsa.local_authorities':
        return this.buildAuthorities();
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
      case 'ukfsa.establishment_search': {
        const data = raw.body as FsaEstablishmentsResponse;
        if (!data || !Array.isArray(data.establishments)) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: 'Invalid FSA establishments response',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        return data;
      }
      case 'ukfsa.establishment_details': {
        const data = raw.body as FsaEstablishment;
        if (!data || typeof data !== 'object' || !data.FHRSID) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: 'Establishment not found — FHRSID returned no data',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        return data;
      }
      case 'ukfsa.local_authorities': {
        const data = raw.body as FsaAuthoritiesResponse;
        if (!data || !Array.isArray(data.authorities)) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: 'Invalid FSA authorities response',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        return data;
      }
      default:
        return raw.body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private fsaHeaders(): Record<string, string> {
    return {
      'x-api-version': '2',
      Accept: 'application/json',
      'User-Agent': 'APIbase-Gateway/1.0',
    };
  }

  private buildEstablishmentSearch(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const qs = new URLSearchParams();
    qs.set('sortOptionKey', 'relevance');

    if (params.name !== undefined && params.name !== '') {
      qs.set('name', encodeURIComponent(String(params.name)));
    }
    if (params.address !== undefined && params.address !== '') {
      qs.set('address', encodeURIComponent(String(params.address)));
    }
    if (params.latitude !== undefined) {
      qs.set('latitude', String(params.latitude));
    }
    if (params.longitude !== undefined) {
      qs.set('longitude', String(params.longitude));
    }
    if (params.max_distance_miles !== undefined) {
      qs.set('maxDistanceLimit', String(params.max_distance_miles));
    }
    if (params.page_size !== undefined) {
      qs.set('pageSize', String(params.page_size));
    }
    if (params.page_number !== undefined) {
      qs.set('pageNumber', String(params.page_number));
    }

    return {
      url: `${UkfsaAdapter.UKFSA_BASE}/Establishments?${qs.toString()}`,
      method: 'GET',
      headers: this.fsaHeaders(),
    };
  }

  private buildEstablishmentDetails(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const id = encodeURIComponent(String(params.establishment_id));
    return {
      url: `${UkfsaAdapter.UKFSA_BASE}/Establishments/${id}`,
      method: 'GET',
      headers: this.fsaHeaders(),
    };
  }

  private buildAuthorities(): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    return {
      url: `${UkfsaAdapter.UKFSA_BASE}/Authorities`,
      method: 'GET',
      headers: this.fsaHeaders(),
    };
  }
}
