import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  ApodResponse,
  NeoFeedResponse,
  DonkiFlareResponse,
  EpicResponse,
  NasaImageSearchResponse,
} from './types';

/**
 * NASA Open APIs adapter (UC-034).
 *
 * Supported tools (Phase 1, read-only):
 *   nasa.apod          → GET /planetary/apod
 *   nasa.neo_feed      → GET /neo/rest/v1/feed
 *   nasa.donki_flr     → GET /DONKI/FLR
 *   nasa.epic          → GET /EPIC/api/natural/date/{date}
 *   nasa.image_search  → GET images-api.nasa.gov/search (no API key)
 *
 * Auth: query param api_key=KEY (except image_search).
 * Free tier: 1,000 req/hour.
 */
export class NasaAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'nasa',
      baseUrl: 'https://api.nasa.gov',
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
      Accept: 'application/json',
    };

    switch (req.toolId) {
      case 'nasa.apod':
        return this.buildApodRequest(params, headers);
      case 'nasa.neo_feed':
        return this.buildNeoFeedRequest(params, headers);
      case 'nasa.donki_flr':
        return this.buildDonkiFlrRequest(params, headers);
      case 'nasa.epic':
        return this.buildEpicRequest(params, headers);
      case 'nasa.image_search':
        return this.buildImageSearchRequest(params, headers);
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
      case 'nasa.apod': {
        const data = body as ApodResponse;
        if (!data.title) {
          throw new Error('Missing title in APOD response');
        }
        return data;
      }
      case 'nasa.neo_feed': {
        const data = body as NeoFeedResponse;
        if (!data.near_earth_objects) {
          throw new Error('Missing near_earth_objects in NEO feed response');
        }
        return data;
      }
      case 'nasa.donki_flr': {
        const data = body as DonkiFlareResponse;
        if (!Array.isArray(data)) {
          throw new Error('Expected array in DONKI FLR response');
        }
        return data;
      }
      case 'nasa.epic': {
        const data = body as EpicResponse;
        if (!Array.isArray(data)) {
          throw new Error('Expected array in EPIC response');
        }
        return data;
      }
      case 'nasa.image_search': {
        const data = body as NasaImageSearchResponse;
        if (!data.collection) {
          throw new Error('Missing collection in image search response');
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

  private buildApodRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('api_key', this.apiKey);
    if (params.date) qs.set('date', String(params.date));
    if (params.thumbs !== undefined) qs.set('thumbs', String(params.thumbs));

    return {
      url: `${this.baseUrl}/planetary/apod?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildNeoFeedRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('api_key', this.apiKey);
    if (params.start_date) qs.set('start_date', String(params.start_date));
    if (params.end_date) qs.set('end_date', String(params.end_date));

    return {
      url: `${this.baseUrl}/neo/rest/v1/feed?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildDonkiFlrRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('api_key', this.apiKey);
    if (params.start_date) qs.set('startDate', String(params.start_date));
    if (params.end_date) qs.set('endDate', String(params.end_date));

    return {
      url: `${this.baseUrl}/DONKI/FLR?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildEpicRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('api_key', this.apiKey);
    const date = params.date ? String(params.date) : '';

    const path = date
      ? `/EPIC/api/natural/date/${date}`
      : '/EPIC/api/natural';

    return {
      url: `${this.baseUrl}${path}?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildImageSearchRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', String(params.q));
    if (params.media_type) qs.set('media_type', String(params.media_type));
    if (params.year_start) qs.set('year_start', String(params.year_start));
    if (params.year_end) qs.set('year_end', String(params.year_end));
    if (params.page) qs.set('page', String(params.page));
    else qs.set('page', '1');

    return {
      url: `https://images-api.nasa.gov/search?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }
}
