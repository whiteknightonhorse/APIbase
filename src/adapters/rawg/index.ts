import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  GameSearchResponse,
  GameDetailsResponse,
  ScreenshotsResponse,
  StoreLinksResponse,
  GameSeriesResponse,
} from './types';

/**
 * RAWG Video Games Database adapter (UC-037).
 *
 * Supported tools (Phase 1, read-only):
 *   rawg.game_search  → GET /games
 *   rawg.game_details → GET /games/{id}
 *   rawg.screenshots  → GET /games/{id}/screenshots
 *   rawg.store_links  → GET /games/{id}/stores
 *   rawg.game_series  → GET /games/{id}/game-series
 *
 * Auth: query param key=KEY.
 * Free tier: unlimited (fair use).
 */
export class RawgAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'rawg',
      baseUrl: 'https://api.rawg.io/api',
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
      case 'rawg.game_search':
        return this.buildGameSearchRequest(params, headers);
      case 'rawg.game_details':
        return this.buildGameDetailsRequest(params, headers);
      case 'rawg.screenshots':
        return this.buildScreenshotsRequest(params, headers);
      case 'rawg.store_links':
        return this.buildStoreLinksRequest(params, headers);
      case 'rawg.game_series':
        return this.buildGameSeriesRequest(params, headers);
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
      case 'rawg.game_search': {
        const data = body as GameSearchResponse;
        if (!data.results) {
          throw new Error('Missing results in game search response');
        }
        return data;
      }
      case 'rawg.game_details': {
        const data = body as GameDetailsResponse;
        if (!data.id) {
          throw new Error('Missing id in game details response');
        }
        return data;
      }
      case 'rawg.screenshots': {
        const data = body as ScreenshotsResponse;
        if (!data.results) {
          throw new Error('Missing results in screenshots response');
        }
        return data;
      }
      case 'rawg.store_links': {
        const data = body as StoreLinksResponse;
        if (!data.results) {
          throw new Error('Missing results in store links response');
        }
        return data;
      }
      case 'rawg.game_series': {
        const data = body as GameSeriesResponse;
        if (!data.results) {
          throw new Error('Missing results in game series response');
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

  private buildGameSearchRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('key', this.apiKey);
    if (params.search) qs.set('search', String(params.search));
    if (params.genres) qs.set('genres', String(params.genres));
    if (params.platforms) qs.set('platforms', String(params.platforms));
    if (params.dates) qs.set('dates', String(params.dates));
    if (params.ordering) qs.set('ordering', String(params.ordering));
    if (params.metacritic) qs.set('metacritic', String(params.metacritic));
    if (params.page_size) qs.set('page_size', String(params.page_size));
    else qs.set('page_size', '20');
    if (params.page) qs.set('page', String(params.page));

    return {
      url: `${this.baseUrl}/games?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildGameDetailsRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const id = String(params.id);
    const qs = new URLSearchParams();
    qs.set('key', this.apiKey);

    return {
      url: `${this.baseUrl}/games/${id}?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildScreenshotsRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const id = String(params.id);
    const qs = new URLSearchParams();
    qs.set('key', this.apiKey);
    if (params.page) qs.set('page', String(params.page));
    if (params.page_size) qs.set('page_size', String(params.page_size));
    else qs.set('page_size', '20');

    return {
      url: `${this.baseUrl}/games/${id}/screenshots?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildStoreLinksRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const id = String(params.id);
    const qs = new URLSearchParams();
    qs.set('key', this.apiKey);

    return {
      url: `${this.baseUrl}/games/${id}/stores?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildGameSeriesRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const id = String(params.id);
    const qs = new URLSearchParams();
    qs.set('key', this.apiKey);
    if (params.page) qs.set('page', String(params.page));
    if (params.page_size) qs.set('page_size', String(params.page_size));
    else qs.set('page_size', '20');

    return {
      url: `${this.baseUrl}/games/${id}/game-series?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }
}
