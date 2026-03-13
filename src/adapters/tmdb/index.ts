import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  TmdbSearchMultiResponse,
  TmdbMovieDetails,
  TmdbDiscoverResponse,
  TmdbTrendingResponse,
  TmdbPersonSearchResponse,
  TmdbPerson,
  TmdbWatchProvidersResponse,
} from './types';

/**
 * TMDB (The Movie Database) API v3 adapter (UC-010).
 *
 * Supported tools (Phase 1, all read-only):
 *   tmdb.movie_search        → GET /search/multi
 *   tmdb.movie_details       → GET /movie/{id}?append_to_response=credits,videos,watch/providers
 *   tmdb.movie_discover      → GET /discover/movie or /discover/tv
 *   tmdb.movie_trending      → GET /trending/{type}/{window}
 *   tmdb.movie_similar       → GET /movie/{id}/recommendations
 *   tmdb.movie_person        → GET /search/person or /person/{id}?append_to_response=combined_credits
 *   tmdb.movie_where_to_watch → GET /movie/{id}/watch/providers or /tv/{id}/watch/providers
 *
 * Auth: Bearer token (v4 Read Access Token).
 * Rate limit: ~50 req/sec, no daily cap.
 * Base URL: https://api.themoviedb.org/3
 */
export class TmdbAdapter extends BaseAdapter {
  private readonly accessToken: string;

  constructor(accessToken: string) {
    super({
      provider: 'tmdb',
      baseUrl: 'https://api.themoviedb.org/3',
    });
    this.accessToken = accessToken;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: 'application/json',
    };

    switch (req.toolId) {
      case 'tmdb.movie_search':
        return this.buildSearchRequest(params, headers);
      case 'tmdb.movie_details':
        return this.buildDetailsRequest(params, headers);
      case 'tmdb.movie_discover':
        return this.buildDiscoverRequest(params, headers);
      case 'tmdb.movie_trending':
        return this.buildTrendingRequest(params, headers);
      case 'tmdb.movie_similar':
        return this.buildSimilarRequest(params, headers);
      case 'tmdb.movie_person':
        return this.buildPersonRequest(params, headers);
      case 'tmdb.movie_where_to_watch':
        return this.buildWhereToWatchRequest(params, headers);
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
      case 'tmdb.movie_search': {
        const data = body as TmdbSearchMultiResponse;
        if (!data.results) {
          throw new Error('Missing results in search response');
        }
        return data;
      }
      case 'tmdb.movie_details': {
        const data = body as TmdbMovieDetails;
        if (!data.id || !data.title) {
          throw new Error('Missing required fields in movie details response');
        }
        return data;
      }
      case 'tmdb.movie_discover': {
        const data = body as TmdbDiscoverResponse;
        if (!data.results) {
          throw new Error('Missing results in discover response');
        }
        return data;
      }
      case 'tmdb.movie_trending': {
        const data = body as TmdbTrendingResponse;
        if (!data.results) {
          throw new Error('Missing results in trending response');
        }
        return data;
      }
      case 'tmdb.movie_similar': {
        const data = body as TmdbDiscoverResponse;
        if (!data.results) {
          throw new Error('Missing results in similar/recommendations response');
        }
        return data;
      }
      case 'tmdb.movie_person': {
        // Could be either search results or single person details
        if (Array.isArray((body as TmdbPersonSearchResponse).results)) {
          return body;
        }
        const person = body as TmdbPerson;
        if (!person.id || !person.name) {
          throw new Error('Missing required fields in person response');
        }
        return person;
      }
      case 'tmdb.movie_where_to_watch': {
        const data = body as TmdbWatchProvidersResponse;
        if (!data.results) {
          throw new Error('Missing results in watch providers response');
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

  /** GET /search/multi — multi-search across movies, TV, people */
  private buildSearchRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();

    qs.set('query', String(params.query));
    if (params.language) qs.set('language', String(params.language));
    if (params.page) qs.set('page', String(params.page));
    if (params.include_adult) qs.set('include_adult', String(params.include_adult));

    return {
      url: `${this.baseUrl}/search/multi?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  /** GET /movie/{id}?append_to_response=credits,videos,watch/providers */
  private buildDetailsRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const movieId = String(params.id);
    const qs = new URLSearchParams();

    qs.set('append_to_response', 'credits,videos,watch/providers');
    if (params.language) qs.set('language', String(params.language));

    return {
      url: `${this.baseUrl}/movie/${encodeURIComponent(movieId)}?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  /** GET /discover/movie or /discover/tv */
  private buildDiscoverRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const type = params.type === 'tv' ? 'tv' : 'movie';
    const qs = new URLSearchParams();

    if (params.language) qs.set('language', String(params.language));
    if (params.page) qs.set('page', String(params.page));
    if (params.sort_by) qs.set('sort_by', String(params.sort_by));
    if (params.with_genres) qs.set('with_genres', String(params.with_genres));
    if (params.year) qs.set('year', String(params.year));
    if (params.primary_release_year) qs.set('primary_release_year', String(params.primary_release_year));
    if (params.first_air_date_year) qs.set('first_air_date_year', String(params.first_air_date_year));
    if (params.vote_average_gte) qs.set('vote_average.gte', String(params.vote_average_gte));
    if (params.vote_average_lte) qs.set('vote_average.lte', String(params.vote_average_lte));
    if (params.with_original_language) qs.set('with_original_language', String(params.with_original_language));
    if (params.region) qs.set('region', String(params.region));
    if (params.include_adult) qs.set('include_adult', String(params.include_adult));

    return {
      url: `${this.baseUrl}/discover/${type}?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  /** GET /trending/{type}/{window} */
  private buildTrendingRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const type = params.type ? String(params.type) : 'movie';
    const window = params.window ? String(params.window) : 'week';
    const qs = new URLSearchParams();

    if (params.language) qs.set('language', String(params.language));
    if (params.page) qs.set('page', String(params.page));

    return {
      url: `${this.baseUrl}/trending/${encodeURIComponent(type)}/${encodeURIComponent(window)}?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  /** GET /movie/{id}/recommendations */
  private buildSimilarRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const movieId = String(params.id);
    const qs = new URLSearchParams();

    if (params.language) qs.set('language', String(params.language));
    if (params.page) qs.set('page', String(params.page));

    return {
      url: `${this.baseUrl}/movie/${encodeURIComponent(movieId)}/recommendations?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  /** GET /search/person or /person/{id}?append_to_response=combined_credits */
  private buildPersonRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    // If id is provided, fetch person details with filmography
    if (params.id) {
      const personId = String(params.id);
      const qs = new URLSearchParams();
      qs.set('append_to_response', 'combined_credits');
      if (params.language) qs.set('language', String(params.language));

      return {
        url: `${this.baseUrl}/person/${encodeURIComponent(personId)}?${qs.toString()}`,
        method: 'GET',
        headers,
      };
    }

    // Otherwise, search by name
    const qs = new URLSearchParams();
    qs.set('query', String(params.query));
    if (params.language) qs.set('language', String(params.language));
    if (params.page) qs.set('page', String(params.page));
    if (params.include_adult) qs.set('include_adult', String(params.include_adult));

    return {
      url: `${this.baseUrl}/search/person?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  /** GET /movie/{id}/watch/providers or /tv/{id}/watch/providers */
  private buildWhereToWatchRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const contentId = String(params.id);
    const type = params.type === 'tv' ? 'tv' : 'movie';

    return {
      url: `${this.baseUrl}/${type}/${encodeURIComponent(contentId)}/watch/providers`,
      method: 'GET',
      headers,
    };
  }
}
