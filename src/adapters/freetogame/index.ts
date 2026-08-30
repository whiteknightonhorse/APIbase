import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { GameListResponse, GameDetailResponse, FilterResponse } from './types';

/**
 * FreeToGame adapter (UC-636).
 *
 * Supported tools (read-only):
 *   freetogame.game_list    → GET /api/games   (platform/category/sort-by filters)
 *   freetogame.game_detail  → GET /api/game    (single game by id)
 *   freetogame.filter_by_tag → GET /api/filter (tag + platform + sort-by combined filter)
 *
 * Auth: none. Free tier: unlimited, no documented rate limit.
 */
export class FreetogameAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'freetogame',
      baseUrl: 'https://www.freetogame.com/api',
    });
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
      case 'freetogame.game_list':
        return this.buildGameListRequest(params, headers);
      case 'freetogame.game_detail':
        return this.buildGameDetailRequest(params, headers);
      case 'freetogame.filter_by_tag':
        return this.buildFilterRequest(params, headers);
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
      case 'freetogame.game_list': {
        const data = body as GameListResponse;
        if (!Array.isArray(data)) {
          throw new Error('Expected array in game list response');
        }
        return data;
      }
      case 'freetogame.game_detail': {
        const data = body as GameDetailResponse;
        if (!data.id) {
          throw new Error('Missing id in game detail response');
        }
        return data;
      }
      case 'freetogame.filter_by_tag': {
        const data = body as FilterResponse;
        if (!Array.isArray(data)) {
          throw new Error('Expected array in filter response');
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

  private buildGameListRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    if (params.platform) qs.set('platform', String(params.platform));
    if (params.category) qs.set('category', String(params.category));
    if (params.sort_by) qs.set('sort-by', String(params.sort_by));

    const query = qs.toString();
    return {
      url: `${this.baseUrl}/games${query ? `?${query}` : ''}`,
      method: 'GET',
      headers,
    };
  }

  private buildGameDetailRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('id', String(params.id));

    return {
      url: `${this.baseUrl}/game?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildFilterRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('tag', String(params.tag));
    if (params.platform) qs.set('platform', String(params.platform));
    if (params.sort_by) qs.set('sort-by', String(params.sort_by));

    return {
      url: `${this.baseUrl}/filter?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }
}
