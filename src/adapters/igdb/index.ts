import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import { IgdbAuth } from './auth';
import type { IgdbGame, IgdbCompany, IgdbPlatform } from './types';

/**
 * IGDB (Internet Games Database by Twitch) adapter (UC-039).
 *
 * Supported tools (Phase 1, read-only):
 *   igdb.game_search   → POST /games      (Apicalypse: search + fields)
 *   igdb.game_details  → POST /games      (Apicalypse: where id = N; fields *)
 *   igdb.company_info  → POST /companies  (Apicalypse: where id = N or search)
 *   igdb.platform_info → POST /platforms  (Apicalypse: where id = N or search)
 *   igdb.game_media    → POST /games      (Apicalypse: where id = N; fields videos.*,cover.*)
 *
 * Auth: OAuth2 Twitch Client Credentials + Client-ID header on every request.
 * All endpoints use POST with Content-Type: text/plain (Apicalypse query body).
 * Rate limit: 4 req/sec, unlimited free.
 */
export class IgdbAdapter extends BaseAdapter {
  private readonly auth: IgdbAuth;
  private readonly clientId: string;
  private currentToken: string = '';

  constructor(clientId: string, clientSecret: string) {
    super({
      provider: 'igdb',
      baseUrl: 'https://api.igdb.com/v4',
    });
    this.clientId = clientId;
    this.auth = new IgdbAuth(clientId, clientSecret);
  }

  /**
   * Override call() to inject OAuth2 token before buildRequest() runs.
   */
  async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    this.currentToken = await this.auth.getToken();
    return super.call(req);
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      'Client-ID': this.clientId,
      'Authorization': `Bearer ${this.currentToken}`,
      'Content-Type': 'text/plain',
    };

    switch (req.toolId) {
      case 'igdb.game_search':
        return this.buildGameSearchRequest(params, headers);
      case 'igdb.game_details':
        return this.buildGameDetailsRequest(params, headers);
      case 'igdb.company_info':
        return this.buildCompanyInfoRequest(params, headers);
      case 'igdb.platform_info':
        return this.buildPlatformInfoRequest(params, headers);
      case 'igdb.game_media':
        return this.buildGameMediaRequest(params, headers);
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

    // IGDB returns JSON arrays for all endpoints
    if (!Array.isArray(body)) {
      throw new Error('IGDB response is not an array');
    }

    switch (req.toolId) {
      case 'igdb.game_search': {
        const data = body as IgdbGame[];
        return data;
      }
      case 'igdb.game_details': {
        const data = body as IgdbGame[];
        if (data.length === 0) {
          throw new Error('Game not found');
        }
        return data[0];
      }
      case 'igdb.company_info': {
        const data = body as IgdbCompany[];
        if (data.length === 0) {
          throw new Error('Company not found');
        }
        return data.length === 1 ? data[0] : data;
      }
      case 'igdb.platform_info': {
        const data = body as IgdbPlatform[];
        if (data.length === 0) {
          throw new Error('Platform not found');
        }
        return data.length === 1 ? data[0] : data;
      }
      case 'igdb.game_media': {
        const data = body as IgdbGame[];
        if (data.length === 0) {
          throw new Error('Game not found');
        }
        return {
          id: data[0].id,
          name: data[0].name,
          cover: data[0].cover,
          screenshots: data[0].screenshots,
          videos: data[0].videos,
        };
      }
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders (Apicalypse query language)
  // ---------------------------------------------------------------------------

  private buildGameSearchRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string>; body: string } {
    const query = String(params.query || '');
    const limit = Math.min(Number(params.limit) || 10, 50);

    const parts: string[] = [];
    if (query) parts.push(`search "${query}"`);
    parts.push('fields name,slug,summary,rating,aggregated_rating,first_release_date,genres.name,platforms.name,platforms.abbreviation,cover.url,cover.image_id');
    parts.push(`limit ${limit}`);

    return {
      url: `${this.baseUrl}/games`,
      method: 'POST',
      headers,
      body: parts.join('; ') + ';',
    };
  }

  private buildGameDetailsRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string>; body: string } {
    const id = Number(params.id);

    return {
      url: `${this.baseUrl}/games`,
      method: 'POST',
      headers,
      body: `where id = ${id}; fields name,slug,summary,storyline,rating,aggregated_rating,total_rating,first_release_date,genres.name,platforms.name,platforms.abbreviation,cover.url,cover.image_id,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,themes.name,game_modes.name,player_perspectives.name,similar_games,url,websites.url,websites.category;`,
    };
  }

  private buildCompanyInfoRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string>; body: string } {
    const parts: string[] = [];

    if (params.id) {
      parts.push(`where id = ${Number(params.id)}`);
    } else if (params.query) {
      parts.push(`search "${String(params.query)}"`);
    }

    parts.push('fields name,slug,description,url,country,start_date,logo.url,logo.image_id,developed,published,websites.url,websites.category');
    const limit = Math.min(Number(params.limit) || 10, 50);
    parts.push(`limit ${limit}`);

    return {
      url: `${this.baseUrl}/companies`,
      method: 'POST',
      headers,
      body: parts.join('; ') + ';',
    };
  }

  private buildPlatformInfoRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string>; body: string } {
    const parts: string[] = [];

    if (params.id) {
      parts.push(`where id = ${Number(params.id)}`);
    } else if (params.query) {
      parts.push(`search "${String(params.query)}"`);
    }

    parts.push('fields name,slug,abbreviation,summary,generation,platform_family.name,platform_logo.url,platform_logo.image_id,versions.name,websites.url,websites.category');
    const limit = Math.min(Number(params.limit) || 10, 50);
    parts.push(`limit ${limit}`);

    return {
      url: `${this.baseUrl}/platforms`,
      method: 'POST',
      headers,
      body: parts.join('; ') + ';',
    };
  }

  private buildGameMediaRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string>; body: string } {
    const id = Number(params.id);

    return {
      url: `${this.baseUrl}/games`,
      method: 'POST',
      headers,
      body: `where id = ${id}; fields name,cover.url,cover.image_id,cover.width,cover.height,screenshots.url,screenshots.image_id,screenshots.width,screenshots.height,videos.name,videos.video_id;`,
    };
  }
}
