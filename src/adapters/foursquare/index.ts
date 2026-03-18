import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  FsqSearchResponse,
  FsqPlace,
  FsqTip,
  FsqPhoto,
  FsqAutocompleteResponse,
} from './types';

/**
 * Foursquare Places API adapter (UC-003).
 *
 * Supported tools (Phase 1):
 *   foursquare.place_search  → GET /places/search
 *   foursquare.place_details → GET /places/{fsq_id}
 *   foursquare.place_tips    → GET /places/{fsq_id}/tips
 *   foursquare.place_photos  → GET /places/{fsq_id}/photos
 *   foursquare.autocomplete  → GET /autocomplete
 *
 * Auth: Bearer token (Service API Key).
 * Version: X-Places-Api-Version header.
 */
export class FoursquareAdapter extends BaseAdapter {
  private readonly apiKey: string;
  private static readonly API_VERSION = '2025-06-17';

  constructor(apiKey: string) {
    super({
      provider: 'foursquare',
      baseUrl: 'https://places-api.foursquare.com',
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
      Authorization: `Bearer ${this.apiKey}`,
      'X-Places-Api-Version': FoursquareAdapter.API_VERSION,
      Accept: 'application/json',
    };

    switch (req.toolId) {
      case 'foursquare.place_search':
        return this.buildSearchRequest(params, headers);
      case 'foursquare.place_details':
        return this.buildDetailsRequest(params, headers);
      case 'foursquare.place_tips':
        return this.buildTipsRequest(params, headers);
      case 'foursquare.place_photos':
        return this.buildPhotosRequest(params, headers);
      case 'foursquare.autocomplete':
        return this.buildAutocompleteRequest(params, headers);
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
      case 'foursquare.place_search': {
        const data = body as FsqSearchResponse;
        if (!data.results) {
          throw new Error('Missing results in place search response');
        }
        return data;
      }
      case 'foursquare.place_details': {
        const data = body as FsqPlace;
        if (!data.fsq_id || !data.name) {
          throw new Error('Missing required fields in place details response');
        }
        return data;
      }
      case 'foursquare.place_tips': {
        const data = body as FsqTip[];
        if (!Array.isArray(data)) {
          throw new Error('Expected array in place tips response');
        }
        return data;
      }
      case 'foursquare.place_photos': {
        const data = body as FsqPhoto[];
        if (!Array.isArray(data)) {
          throw new Error('Expected array in place photos response');
        }
        return data;
      }
      case 'foursquare.autocomplete': {
        const data = body as FsqAutocompleteResponse;
        if (!data.results) {
          throw new Error('Missing results in autocomplete response');
        }
        return data;
      }
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildSearchRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();

    if (params.query) qs.set('query', String(params.query));
    if (params.near) qs.set('near', String(params.near));
    if (params.ll) qs.set('ll', String(params.ll));
    if (params.radius) qs.set('radius', String(params.radius));
    if (params.categories) qs.set('categories', String(params.categories));
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.sort) qs.set('sort', String(params.sort));
    if (params.open_now) qs.set('open_now', 'true');

    // Default fields for rich responses
    qs.set(
      'fields',
      'fsq_id,name,categories,location,geocodes,distance,rating,popularity,price,hours,tel,website,closed_bucket',
    );

    return {
      url: `${this.baseUrl}/places/search?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildDetailsRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const fsqId = String(params.fsq_id);
    const qs = new URLSearchParams();

    // Full field set for details
    qs.set(
      'fields',
      'fsq_id,name,categories,location,geocodes,rating,popularity,price,hours,tel,website,social_media,verified,stats,tastes,features,closed_bucket,chains',
    );

    return {
      url: `${this.baseUrl}/places/${encodeURIComponent(fsqId)}?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildTipsRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const fsqId = String(params.fsq_id);
    const qs = new URLSearchParams();

    if (params.limit) qs.set('limit', String(params.limit));
    if (params.sort) qs.set('sort', String(params.sort));

    const query = qs.toString();
    const suffix = query ? `?${query}` : '';

    return {
      url: `${this.baseUrl}/places/${encodeURIComponent(fsqId)}/tips${suffix}`,
      method: 'GET',
      headers,
    };
  }

  private buildPhotosRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const fsqId = String(params.fsq_id);
    const qs = new URLSearchParams();

    if (params.limit) qs.set('limit', String(params.limit));
    if (params.sort) qs.set('sort', String(params.sort));
    if (params.classifications) qs.set('classifications', String(params.classifications));

    const query = qs.toString();
    const suffix = query ? `?${query}` : '';

    return {
      url: `${this.baseUrl}/places/${encodeURIComponent(fsqId)}/photos${suffix}`,
      method: 'GET',
      headers,
    };
  }

  private buildAutocompleteRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();

    qs.set('query', String(params.query));
    if (params.ll) qs.set('ll', String(params.ll));
    if (params.radius) qs.set('radius', String(params.radius));
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.types) qs.set('types', String(params.types));

    return {
      url: `${this.baseUrl}/autocomplete?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }
}
