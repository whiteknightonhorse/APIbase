import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  JikanSearchResponse,
  JikanDetailResponse,
  JikanMangaDetailResponse,
  JikanCharactersResponse,
} from './types';

/**
 * Jikan (MyAnimeList) adapter (UC-051).
 *
 * Supported tools (read-only):
 *   anime.search     → GET /v4/anime?q={query}
 *   anime.details    → GET /v4/anime/{id}
 *   manga.details    → GET /v4/manga/{id}
 *   anime.characters → GET /v4/anime/{id}/characters
 *   anime.top        → GET /v4/top/anime
 *
 * Auth: None (open access, MIT licensed).
 * Rate limit: 3 req/sec, 60 req/min.
 */
export class JikanAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'jikan',
      baseUrl: 'https://api.jikan.moe/v4',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'anime.search':
        return this.buildAnimeSearch(params, headers);
      case 'anime.details':
        return this.buildAnimeDetails(params, headers);
      case 'manga.details':
        return this.buildMangaDetails(params, headers);
      case 'anime.characters':
        return this.buildCharacters(params, headers);
      case 'anime.top':
        return this.buildTop(params, headers);
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

    switch (req.toolId) {
      case 'anime.search':
      case 'anime.top': {
        const data = body as unknown as JikanSearchResponse;
        return {
          total: data.pagination?.items?.total ?? 0,
          page: data.pagination?.last_visible_page ?? 1,
          has_next: data.pagination?.has_next_page ?? false,
          results: (data.data ?? []).map(a => ({
            mal_id: a.mal_id,
            title: a.title,
            title_english: a.title_english,
            type: a.type,
            episodes: a.episodes,
            status: a.status,
            score: a.score,
            rank: a.rank,
            year: a.year,
            season: a.season,
            genres: a.genres?.map(g => g.name) ?? [],
            image: a.images?.jpg?.image_url ?? null,
            url: a.url,
          })),
        };
      }
      case 'anime.details': {
        const data = body as unknown as JikanDetailResponse;
        const a = data.data;
        return {
          mal_id: a.mal_id,
          title: a.title,
          title_english: a.title_english,
          title_japanese: a.title_japanese,
          type: a.type,
          source: a.source,
          episodes: a.episodes,
          status: a.status,
          duration: a.duration,
          rating: a.rating,
          score: a.score,
          rank: a.rank,
          popularity: a.popularity,
          members: a.members,
          favorites: a.favorites,
          synopsis: a.synopsis,
          year: a.year,
          season: a.season,
          genres: a.genres?.map(g => g.name) ?? [],
          themes: a.themes?.map(t => t.name) ?? [],
          demographics: a.demographics?.map(d => d.name) ?? [],
          studios: a.studios?.map(s => s.name) ?? [],
          image: a.images?.jpg?.large_image_url ?? a.images?.jpg?.image_url ?? null,
          url: a.url,
        };
      }
      case 'manga.details': {
        const data = body as unknown as JikanMangaDetailResponse;
        const m = data.data;
        return {
          mal_id: m.mal_id,
          title: m.title,
          title_english: m.title_english,
          title_japanese: m.title_japanese,
          type: m.type,
          chapters: m.chapters,
          volumes: m.volumes,
          status: m.status,
          score: m.score,
          rank: m.rank,
          popularity: m.popularity,
          members: m.members,
          synopsis: m.synopsis,
          genres: m.genres?.map(g => g.name) ?? [],
          themes: m.themes?.map(t => t.name) ?? [],
          authors: m.authors?.map(a => a.name) ?? [],
          image: m.images?.jpg?.large_image_url ?? m.images?.jpg?.image_url ?? null,
          url: m.url,
        };
      }
      case 'anime.characters': {
        const data = body as unknown as JikanCharactersResponse;
        return {
          count: data.data?.length ?? 0,
          characters: (data.data ?? []).slice(0, 25).map(c => ({
            name: c.character.name,
            mal_id: c.character.mal_id,
            role: c.role,
            image: c.character.images?.jpg?.image_url ?? null,
            voice_actors: (c.voice_actors ?? [])
              .filter(va => va.language === 'Japanese')
              .slice(0, 1)
              .map(va => ({ name: va.person.name, language: va.language })),
          })),
        };
      }
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildAnimeSearch(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    if (params.query) qs.set('q', String(params.query));
    if (params.type) qs.set('type', String(params.type));
    if (params.status) qs.set('status', String(params.status));
    if (params.rating) qs.set('rating', String(params.rating));
    if (params.genre) qs.set('genres', String(params.genre));
    if (params.order_by) qs.set('order_by', String(params.order_by));
    if (params.sort) qs.set('sort', String(params.sort));
    if (params.page) qs.set('page', String(params.page));
    qs.set('limit', String(params.limit ?? 10));

    return { url: `${this.baseUrl}/anime?${qs.toString()}`, method: 'GET', headers };
  }

  private buildAnimeDetails(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    return { url: `${this.baseUrl}/anime/${params.id}`, method: 'GET', headers };
  }

  private buildMangaDetails(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    return { url: `${this.baseUrl}/manga/${params.id}`, method: 'GET', headers };
  }

  private buildCharacters(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    return { url: `${this.baseUrl}/anime/${params.id}/characters`, method: 'GET', headers };
  }

  private buildTop(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    if (params.type) qs.set('type', String(params.type));
    if (params.filter) qs.set('filter', String(params.filter));
    if (params.page) qs.set('page', String(params.page));
    qs.set('limit', String(params.limit ?? 10));

    return { url: `${this.baseUrl}/top/anime?${qs.toString()}`, method: 'GET', headers };
  }
}
