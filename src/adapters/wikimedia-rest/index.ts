import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  WikimediaPageSummaryResponse,
  WikimediaPageSummaryOutput,
  WikimediaSearchPageResponse,
  WikimediaSearchPageOutput,
  WikimediaOnThisDayResponse,
  WikimediaOnThisDayOutput,
  WikimediaMediaListResponse,
  WikimediaMediaListOutput,
} from './types';

const USER_AGENT = 'APIbase/1.0 (https://apibase.pro; contact@apibase.pro)';
const LANG_RE = /^[a-z]{2,3}(-[a-z0-9]{1,8})?$/;
const ONTHISDAY_TYPES = new Set(['births', 'deaths', 'events', 'holidays', 'selected']);

function requireLang(toolId: string, provider: string, value: unknown): string {
  const lang = String(value ?? 'en')
    .trim()
    .toLowerCase();
  if (!LANG_RE.test(lang)) {
    throw {
      code: ProviderErrorCode.INPUT_REJECTED,
      httpStatus: 422,
      message: 'lang must be a valid Wikipedia language subdomain code (e.g. en, de, fr, zh-yue)',
      provider,
      toolId,
      durationMs: 0,
    };
  }
  return lang;
}

function requireTitle(toolId: string, provider: string, value: unknown): string {
  const title = String(value ?? '').trim();
  if (!title) {
    throw {
      code: ProviderErrorCode.INPUT_REJECTED,
      httpStatus: 422,
      message: 'title is required (e.g. Albert_Einstein)',
      provider,
      toolId,
      durationMs: 0,
    };
  }
  return title.replace(/ /g, '_');
}

/**
 * Wikimedia REST Content API adapter (UC-635).
 *
 * Supported tools:
 *   wikimedia-rest.page_summary -> /page/summary/{title} (intro extract + thumbnail)
 *   wikimedia-rest.search_page  -> /w/rest.php/v1/search/page (full-text page search)
 *   wikimedia-rest.on_this_day  -> /feed/onthisday/{type}/{mm}/{dd} (historical events by date)
 *   wikimedia-rest.media_list   -> /page/media-list/{title} (images/audio/video on a page)
 *
 * Auth: None. Public per-language Wikipedia REST APIs (en.wikipedia.org/api/rest_v1 and
 * en.wikipedia.org/w/rest.php/v1). Distinct from wikimedia-analytics (UC-632, traffic/edit
 * metrics on wikimedia.org/api/rest_v1/metrics) and wikimedia-commons (UC-599, MediaWiki
 * Action API media search) — this adapter serves live page content instead.
 * `lang` selects the Wikipedia language edition subdomain; validated against a strict
 * allowlist regex before interpolation to prevent host injection.
 */
export class WikimediaRestAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'wikimedia-rest', baseUrl: 'https://en.wikipedia.org' });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    };

    switch (req.toolId) {
      case 'wikimedia-rest.page_summary': {
        const lang = requireLang(req.toolId, this.provider, params.lang);
        const title = requireTitle(req.toolId, this.provider, params.title);
        const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
        return { url, method: 'GET', headers };
      }

      case 'wikimedia-rest.search_page': {
        const lang = requireLang(req.toolId, this.provider, params.lang);
        const query = String(params.query ?? '').trim();
        if (!query) {
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message: 'query is required',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        const limitNum = Number(params.limit ?? 10);
        const limit = Number.isFinite(limitNum)
          ? Math.min(50, Math.max(1, Math.trunc(limitNum)))
          : 10;
        const qs = new URLSearchParams({ q: query, limit: String(limit) });
        const url = `https://${lang}.wikipedia.org/w/rest.php/v1/search/page?${qs.toString()}`;
        return { url, method: 'GET', headers };
      }

      case 'wikimedia-rest.on_this_day': {
        const lang = requireLang(req.toolId, this.provider, params.lang);
        const type = String(params.type ?? '').trim();
        if (!ONTHISDAY_TYPES.has(type)) {
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message: 'type must be one of: births, deaths, events, holidays, selected',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        const month = String(params.month ?? '').trim();
        const day = String(params.day ?? '').trim();
        if (!/^\d{2}$/.test(month) || !/^\d{2}$/.test(day)) {
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message: 'month and day must be 2-digit strings (e.g. month=08, day=30)',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        const url = `https://${lang}.wikipedia.org/api/rest_v1/feed/onthisday/${type}/${month}/${day}`;
        return { url, method: 'GET', headers };
      }

      case 'wikimedia-rest.media_list': {
        const lang = requireLang(req.toolId, this.provider, params.lang);
        const title = requireTitle(req.toolId, this.provider, params.title);
        const url = `https://${lang}.wikipedia.org/api/rest_v1/page/media-list/${encodeURIComponent(title)}`;
        return { url, method: 'GET', headers };
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
    switch (req.toolId) {
      case 'wikimedia-rest.page_summary':
        return this.parsePageSummary(raw.body as WikimediaPageSummaryResponse);
      case 'wikimedia-rest.search_page':
        return this.parseSearchPage(raw.body as WikimediaSearchPageResponse);
      case 'wikimedia-rest.on_this_day':
        return this.parseOnThisDay(raw.body as WikimediaOnThisDayResponse, req);
      case 'wikimedia-rest.media_list':
        return this.parseMediaList(raw.body as WikimediaMediaListResponse);
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

  private parsePageSummary(body: WikimediaPageSummaryResponse): WikimediaPageSummaryOutput {
    return {
      title: body.title ?? '',
      description: body.description ?? '',
      extract: body.extract ?? '',
      page_id: body.pageid ?? 0,
      language: body.lang ?? '',
      last_modified: body.timestamp ?? '',
      thumbnail_url: body.thumbnail?.source ?? '',
      article_url: body.content_urls?.desktop?.page ?? '',
    };
  }

  private parseSearchPage(body: WikimediaSearchPageResponse): WikimediaSearchPageOutput {
    return {
      results: (body.pages ?? []).map((p) => ({
        title: p.title,
        key: p.key,
        excerpt: p.excerpt,
        description: p.description ?? '',
        thumbnail_url: p.thumbnail?.url ?? '',
      })),
    };
  }

  private parseOnThisDay(
    body: WikimediaOnThisDayResponse,
    req: ProviderRequest,
  ): WikimediaOnThisDayOutput {
    const params = req.params as Record<string, unknown>;
    const type = String(params.type ?? '');
    const items =
      (
        body as unknown as Record<
          string,
          Array<{
            text: string;
            year?: number;
            pages?: Array<{ title: string }>;
          }>
        >
      )[type] ?? [];
    return {
      type,
      month: String(params.month ?? ''),
      day: String(params.day ?? ''),
      entries: items.map((i) => ({
        year: typeof i.year === 'number' ? i.year : null,
        text: i.text,
        related_pages: (i.pages ?? []).map((p) => p.title),
      })),
    };
  }

  private parseMediaList(body: WikimediaMediaListResponse): WikimediaMediaListOutput {
    return {
      revision: body.revision ?? '',
      media: (body.items ?? []).map((i) => ({
        title: i.title,
        type: i.type ?? '',
        source_url: i.srcset?.[i.srcset.length - 1]?.src ?? i.srcset?.[0]?.src ?? '',
      })),
    };
  }
}
