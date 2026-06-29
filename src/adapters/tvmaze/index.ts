import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import { stripHtml } from '../../utils/strip-html';
import type {
  TvMazeSearchResult,
  TvMazeShow,
  TvMazeEpisode,
  TvMazeCastMember,
  TvMazeScheduleEpisode,
} from './types';

/**
 * TVMaze adapter (UC-520).
 *
 * Supported tools (read-only):
 *   tvmaze.show_search   → GET /search/shows?q={query}
 *   tvmaze.show_details  → GET /shows/{id}
 *   tvmaze.show_episodes → GET /shows/{id}/episodes
 *   tvmaze.show_cast     → GET /shows/{id}/cast
 *   tvmaze.schedule      → GET /schedule?country={code}&date={date}
 *
 * Auth: None (CC BY-SA, attribution required).
 * Rate limit: 20 req/10s per IP.
 */
export class TvMazeAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'tvmaze',
      baseUrl: 'https://api.tvmaze.com',
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
      'User-Agent': 'APIbase/1.0 (https://apibase.pro)',
    };

    switch (req.toolId) {
      case 'tvmaze.show_search': {
        const q = encodeURIComponent(String(params.query ?? ''));
        return { url: `${this.baseUrl}/search/shows?q=${q}`, method: 'GET', headers };
      }
      case 'tvmaze.show_details': {
        const id = encodeURIComponent(String(params.id ?? ''));
        return { url: `${this.baseUrl}/shows/${id}`, method: 'GET', headers };
      }
      case 'tvmaze.show_episodes': {
        const id = encodeURIComponent(String(params.id ?? ''));
        const qs = new URLSearchParams();
        if (params.specials === true) qs.set('specials', '1');
        const q = qs.toString();
        return {
          url: `${this.baseUrl}/shows/${id}/episodes${q ? `?${q}` : ''}`,
          method: 'GET',
          headers,
        };
      }
      case 'tvmaze.show_cast': {
        const id = encodeURIComponent(String(params.id ?? ''));
        return { url: `${this.baseUrl}/shows/${id}/cast`, method: 'GET', headers };
      }
      case 'tvmaze.schedule': {
        const qs = new URLSearchParams();
        if (params.country) qs.set('country', String(params.country));
        if (params.date) qs.set('date', String(params.date));
        const streaming = params.streaming === true;
        const base = streaming ? `${this.baseUrl}/schedule/web` : `${this.baseUrl}/schedule`;
        return { url: `${base}?${qs.toString()}`, method: 'GET', headers };
      }
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
    const body = raw.body as unknown;

    switch (req.toolId) {
      case 'tvmaze.show_search':
        return this.parseSearch(body as TvMazeSearchResult[]);
      case 'tvmaze.show_details':
        return this.parseShowDetails(body as TvMazeShow);
      case 'tvmaze.show_episodes':
        return this.parseEpisodes(body as TvMazeEpisode[], req.params as Record<string, unknown>);
      case 'tvmaze.show_cast':
        return this.parseCast(body as TvMazeCastMember[]);
      case 'tvmaze.schedule':
        return this.parseSchedule(body as TvMazeScheduleEpisode[]);
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // Parsers
  // ---------------------------------------------------------------------------

  private parseSearch(data: TvMazeSearchResult[]): unknown {
    return {
      count: data.length,
      attribution: 'Data provided by TVmaze.com (CC BY-SA)',
      results: data.map((item) => this.mapShow(item.show, item.score)),
    };
  }

  private parseShowDetails(show: TvMazeShow): unknown {
    return {
      ...this.mapShow(show),
      attribution: 'Data provided by TVmaze.com (CC BY-SA)',
    };
  }

  private parseEpisodes(episodes: TvMazeEpisode[], params: Record<string, unknown>): unknown {
    const season = params.season as number | undefined;
    const filtered = season ? episodes.filter((e) => e.season === season) : episodes;
    return {
      count: filtered.length,
      attribution: 'Data provided by TVmaze.com (CC BY-SA)',
      episodes: filtered.map((e) => ({
        id: e.id,
        season: e.season,
        number: e.number,
        name: e.name,
        type: e.type,
        airdate: e.airdate,
        airtime: e.airtime,
        runtime: e.runtime,
        rating: e.rating?.average ?? null,
        image: e.image?.medium ?? null,
        summary: e.summary ? stripHtml(e.summary) : null,
        url: e.url,
      })),
    };
  }

  private parseCast(cast: TvMazeCastMember[]): unknown {
    return {
      count: cast.length,
      attribution: 'Data provided by TVmaze.com (CC BY-SA)',
      cast: cast.map((c) => ({
        person: {
          id: c.person.id,
          name: c.person.name,
          birthday: c.person.birthday,
          gender: c.person.gender,
          country: c.person.country?.name ?? null,
          image: c.person.image?.medium ?? null,
          url: c.person.url,
        },
        character: {
          id: c.character.id,
          name: c.character.name,
          image: c.character.image?.medium ?? null,
        },
        self: c.self,
        voice: c.voice,
      })),
    };
  }

  private parseSchedule(episodes: TvMazeScheduleEpisode[]): unknown {
    return {
      count: episodes.length,
      attribution: 'Data provided by TVmaze.com (CC BY-SA)',
      episodes: episodes.map((e) => {
        const show = e._embedded?.show ?? e.show;
        return {
          episode_id: e.id,
          episode_name: e.name,
          season: e.season,
          number: e.number,
          airdate: e.airdate,
          airtime: e.airtime,
          runtime: e.runtime,
          show: show
            ? {
                id: show.id,
                name: show.name,
                type: show.type,
                genres: show.genres,
                status: show.status,
                language: show.language,
                rating: show.rating?.average ?? null,
                network: show.network?.name ?? show.webChannel?.name ?? null,
                image: show.image?.medium ?? null,
                url: show.url,
              }
            : null,
          url: e.url,
        };
      }),
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private mapShow(show: TvMazeShow, score?: number): Record<string, unknown> {
    const mapped: Record<string, unknown> = {
      id: show.id,
      name: show.name,
      type: show.type,
      language: show.language,
      genres: show.genres,
      status: show.status,
      runtime: show.runtime ?? show.averageRuntime,
      premiered: show.premiered,
      ended: show.ended,
      rating: show.rating?.average ?? null,
      weight: show.weight,
      network: show.network?.name ?? null,
      network_country: show.network?.country?.name ?? null,
      web_channel: show.webChannel?.name ?? null,
      schedule: {
        time: show.schedule?.time ?? null,
        days: show.schedule?.days ?? [],
      },
      summary: show.summary ? stripHtml(show.summary) : null,
      image: show.image?.medium ?? null,
      imdb: show.externals?.imdb ?? null,
      thetvdb: show.externals?.thetvdb ?? null,
      official_site: show.officialSite,
      url: show.url,
    };
    if (score !== undefined) mapped['relevance_score'] = score;
    return mapped;
  }
}
