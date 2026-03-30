import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import { stripHtml } from '../../utils/strip-html';
import type {
  LNSearchResponse,
  LNPodcast,
  LNBestResponse,
  SearchOutput,
  PodcastOutput,
  BestOutput,
} from './types';

/**
 * Listen Notes Podcast Search adapter (UC-225).
 *
 * Supported tools:
 *   listennotes.search  → GET /search (full-text search episodes/podcasts)
 *   listennotes.podcast → GET /podcasts/{id} (podcast details)
 *   listennotes.best    → GET /best_podcasts (curated by genre)
 *
 * Auth: X-ListenAPI-Key header. Free: 50 req/month.
 * 3.7M+ podcasts, 186M+ episodes.
 */
export class ListenNotesAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'listennotes',
      baseUrl: 'https://listen-api.listennotes.com/api/v2',
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
      'X-ListenAPI-Key': this.apiKey,
    };

    switch (req.toolId) {
      case 'listennotes.search': {
        const qp = new URLSearchParams();
        qp.set('q', String(params.q));
        qp.set('type', String(params.type ?? 'episode'));
        if (params.language) qp.set('language', String(params.language));
        if (params.genre_ids) qp.set('genre_ids', String(params.genre_ids));
        if (params.sort_by_date != null)
          qp.set('sort_by_date', String(params.sort_by_date ? 1 : 0));
        qp.set('page_size', String(Math.min(Number(params.limit) || 10, 10)));
        if (params.offset) qp.set('offset', String(params.offset));
        return {
          url: `${this.baseUrl}/search?${qp.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'listennotes.podcast':
        return {
          url: `${this.baseUrl}/podcasts/${encodeURIComponent(String(params.id))}`,
          method: 'GET',
          headers,
        };

      case 'listennotes.best': {
        const qp = new URLSearchParams();
        if (params.genre_id) qp.set('genre_id', String(params.genre_id));
        if (params.page) qp.set('page', String(params.page));
        return {
          url: `${this.baseUrl}/best_podcasts?${qp.toString()}`,
          method: 'GET',
          headers,
        };
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
    const body = raw.body as Record<string, unknown>;

    switch (req.toolId) {
      case 'listennotes.search':
        return this.parseSearch(body as unknown as LNSearchResponse);
      case 'listennotes.podcast':
        return this.parsePodcast(body as unknown as LNPodcast);
      case 'listennotes.best':
        return this.parseBest(body as unknown as LNBestResponse);
      default:
        return body;
    }
  }

  private parseSearch(body: LNSearchResponse): SearchOutput {
    return {
      results: (body.results ?? []).map((r) => ({
        episode_id: r.id,
        episode_title: r.title_original ?? '',
        podcast_title: r.podcast_title_original ?? r.podcast?.title_original ?? '',
        publisher: r.publisher_original ?? '',
        duration_sec: r.audio_length_sec ?? 0,
        published: r.pub_date_ms ? new Date(r.pub_date_ms).toISOString() : '',
        audio_url: r.audio ?? '',
        listen_url: r.listennotes_url ?? '',
      })),
      total: body.total ?? 0,
      count: body.count ?? 0,
    };
  }

  private parsePodcast(body: LNPodcast): PodcastOutput {
    return {
      id: body.id,
      title: body.title ?? '',
      publisher: body.publisher ?? '',
      description: stripHtml(body.description ?? '').slice(0, 500),
      language: body.language ?? '',
      country: body.country ?? '',
      website: body.website ?? '',
      total_episodes: body.total_episodes ?? 0,
      listen_url: body.listennotes_url ?? '',
      image: body.image ?? '',
      latest_published: body.latest_pub_date_ms
        ? new Date(body.latest_pub_date_ms).toISOString()
        : '',
      genres: body.genre_ids ?? [],
    };
  }

  private parseBest(body: LNBestResponse): BestOutput {
    return {
      genre: body.name ?? '',
      total: body.total ?? 0,
      has_next: body.has_next ?? false,
      page: body.page_number ?? 1,
      podcasts: (body.podcasts ?? []).map((p) => ({
        id: p.id,
        title: p.title ?? '',
        publisher: p.publisher ?? '',
        total_episodes: p.total_episodes ?? 0,
        listen_url: p.listennotes_url ?? '',
        description: stripHtml(p.description ?? '').slice(0, 200),
      })),
    };
  }
}
