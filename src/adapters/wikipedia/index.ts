import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  WikiSummaryResponse,
  WikiSearchResponse,
  WikiMediaListResponse,
  WikiFeedFeaturedResponse,
  WikiOnThisDayResponse,
} from './types';

/**
 * Wikipedia REST API adapter (UC-523).
 *
 * Supported tools:
 *   wikipedia.article.summary   → GET /api/rest_v1/page/summary/{title}
 *   wikipedia.search.pages      → GET /w/rest.php/v1/search/page
 *   wikipedia.article.media     → GET /api/rest_v1/page/media-list/{title}
 *   wikipedia.feed.featured     → GET /api/rest_v1/feed/featured/{year}/{mm}/{dd}
 *   wikipedia.feed.on_this_day  → GET /api/rest_v1/feed/onthisday/events/{mm}/{dd}
 *
 * Auth: None. Attribution required per CC BY-SA 4.0.
 * User-Agent header is required by Wikimedia policy to avoid rate limiting.
 */
export class WikipediaAdapter extends BaseAdapter {
  private static readonly SUMMARY_BASE = 'https://en.wikipedia.org/api/rest_v1';
  private static readonly SEARCH_BASE = 'https://en.wikipedia.org/w/rest.php/v1';

  constructor() {
    super({
      provider: 'wikipedia',
      baseUrl: 'https://en.wikipedia.org',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json; charset=utf-8',
      'User-Agent': 'APIbase/1.0 (https://apibase.pro; contact@apibase.pro)',
    };

    switch (req.toolId) {
      case 'wikipedia.article.summary':
        return this.buildSummaryRequest(params, headers);
      case 'wikipedia.search.pages':
        return this.buildSearchRequest(params, headers);
      case 'wikipedia.article.media':
        return this.buildMediaRequest(params, headers);
      case 'wikipedia.feed.featured':
        return this.buildFeaturedRequest(params, headers);
      case 'wikipedia.feed.on_this_day':
        return this.buildOnThisDayRequest(params, headers);
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
      case 'wikipedia.article.summary': {
        const d = body as WikiSummaryResponse;
        return {
          title: d.title,
          displaytitle: d.displaytitle,
          description: d.description,
          extract: d.extract,
          thumbnail: d.thumbnail
            ? { source: d.thumbnail.source, width: d.thumbnail.width, height: d.thumbnail.height }
            : null,
          pageid: d.pageid,
          lang: d.lang,
          timestamp: d.timestamp,
          wikibase_item: d.wikibase_item,
          page_url: d.content_urls?.desktop?.page ?? null,
          attribution: 'Wikipedia contributors, CC BY-SA 4.0, https://en.wikipedia.org',
        };
      }

      case 'wikipedia.search.pages': {
        const d = body as unknown as WikiSearchResponse;
        return {
          results: (d.pages ?? []).map((p) => ({
            title: p.title,
            key: p.key,
            description: p.description ?? null,
            excerpt: p.excerpt ?? null,
            thumbnail: p.thumbnail
              ? { source: p.thumbnail.source, width: p.thumbnail.width }
              : null,
          })),
          count: (d.pages ?? []).length,
          attribution: 'Wikipedia contributors, CC BY-SA 4.0, https://en.wikipedia.org',
        };
      }

      case 'wikipedia.article.media': {
        const d = body as unknown as WikiMediaListResponse;
        return {
          items: (d.items ?? []).map((item) => ({
            title: item.title,
            type: item.type,
            lead_image: item.leadImage ?? false,
            show_in_gallery: item.showInGallery ?? false,
            srcset: (item.srcset ?? []).map((s) => ({ src: s.src, scale: s.scale })),
            caption: item.caption?.text ?? null,
          })),
          count: (d.items ?? []).length,
          attribution: 'Wikipedia contributors, CC BY-SA 4.0, https://en.wikipedia.org',
        };
      }

      case 'wikipedia.feed.featured': {
        const d = body as WikiFeedFeaturedResponse;
        return {
          today_featured: d.tfa
            ? {
                title: d.tfa.title,
                description: d.tfa.description,
                extract: d.tfa.extract,
                thumbnail: d.tfa.thumbnail ?? null,
                page_url: d.tfa.content_urls?.desktop?.page ?? null,
              }
            : null,
          featured_image: d.image
            ? {
                title: d.image.title,
                thumbnail: d.image.thumbnail ?? null,
                description: d.image.description?.text ?? null,
                artist: d.image.artist?.text ?? null,
                file_page: d.image.file_page ?? null,
              }
            : null,
          most_read: d.mostread
            ? {
                date: d.mostread.date,
                articles: (d.mostread.articles ?? []).slice(0, 10).map((a) => ({
                  title: a.title,
                  views: a.views,
                  rank: a.rank,
                  page_url: a.content_urls?.desktop?.page ?? null,
                })),
              }
            : null,
          news_count: (d.news ?? []).length,
          attribution: 'Wikipedia contributors, CC BY-SA 4.0, https://en.wikipedia.org',
        };
      }

      case 'wikipedia.feed.on_this_day': {
        const d = body as unknown as WikiOnThisDayResponse;
        return {
          events: (d.events ?? []).map((e) => ({
            year: e.year,
            text: e.text,
            pages: (e.pages ?? []).slice(0, 3).map((p) => ({
              title: p.title,
              description: p.description ?? null,
              page_url: p.content_urls?.desktop?.page ?? null,
            })),
          })),
          count: (d.events ?? []).length,
          attribution: 'Wikipedia contributors, CC BY-SA 4.0, https://en.wikipedia.org',
        };
      }

      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildSummaryRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const title = encodeURIComponent(String(params.title ?? ''));
    const lang = params.language ? String(params.language) : 'en';
    const base = `https://${lang}.wikipedia.org/api/rest_v1`;
    return {
      url: `${base}/page/summary/${title}`,
      method: 'GET',
      headers,
    };
  }

  private buildSearchRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('q', String(params.query ?? ''));
    if (params.limit) qs.set('limit', String(Math.min(Number(params.limit), 50)));
    else qs.set('limit', '10');
    const lang = params.language ? String(params.language) : 'en';
    const base = `https://${lang}.wikipedia.org/w/rest.php/v1`;
    return {
      url: `${base}/search/page?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildMediaRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const title = encodeURIComponent(String(params.title ?? ''));
    const lang = params.language ? String(params.language) : 'en';
    const base = `https://${lang}.wikipedia.org/api/rest_v1`;
    return {
      url: `${base}/page/media-list/${title}`,
      method: 'GET',
      headers,
    };
  }

  private buildFeaturedRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const date = String(params.date ?? new Date().toISOString().slice(0, 10));
    const [year, mm, dd] = date.split('-');
    return {
      url: `${WikipediaAdapter.SUMMARY_BASE}/feed/featured/${year}/${mm}/${dd}`,
      method: 'GET',
      headers,
    };
  }

  private buildOnThisDayRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const date = String(params.date ?? new Date().toISOString().slice(0, 10));
    const [, mm, dd] = date.split('-');
    return {
      url: `${WikipediaAdapter.SUMMARY_BASE}/feed/onthisday/events/${mm}/${dd}`,
      method: 'GET',
      headers,
    };
  }
}
