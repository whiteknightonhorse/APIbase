import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  WikimediaPageviewsAggregateResponse,
  WikimediaPageviewsAggregateOutput,
  WikimediaPageviewsTopResponse,
  WikimediaPageviewsTopOutput,
  WikimediaPerArticleResponse,
  WikimediaPerArticleOutput,
  WikimediaEditsAggregateResponse,
  WikimediaEditsAggregateOutput,
} from './types';

const ANALYTICS_API = 'https://wikimedia.org/api/rest_v1/metrics';
const USER_AGENT = 'APIbase/1.0 (https://apibase.pro; contact@apibase.pro)';
const DATE_RE = /^\d{8}$/;

function requireDate(toolId: string, value: unknown, field: string): string {
  const str = String(value ?? '').trim();
  if (!DATE_RE.test(str)) {
    throw {
      code: ProviderErrorCode.INPUT_REJECTED,
      httpStatus: 422,
      message: `${field} must be in YYYYMMDD format`,
      provider: 'wikimedia-analytics',
      toolId,
      durationMs: 0,
    };
  }
  return str;
}

function requireProject(toolId: string, value: unknown): string {
  const project = String(value ?? '').trim();
  if (!project) {
    throw {
      code: ProviderErrorCode.INPUT_REJECTED,
      httpStatus: 422,
      message: 'project is required (e.g. en.wikipedia, de.wikipedia, commons.wikimedia)',
      provider: 'wikimedia-analytics',
      toolId,
      durationMs: 0,
    };
  }
  return project;
}

/**
 * Wikimedia Analytics REST API adapter (UC-632).
 *
 * Supported tools:
 *   wikimedia-analytics.pageviews_aggregate   -> /pageviews/aggregate (total views over a date range)
 *   wikimedia-analytics.pageviews_top         -> /pageviews/top (top-viewed articles for one day)
 *   wikimedia-analytics.pageviews_per_article -> /pageviews/per-article (views for one article over time)
 *   wikimedia-analytics.edits_aggregate       -> /edits/aggregate (edit count over a date range)
 *
 * Auth: None. Public, Cloudflare-cached REST API (wikimedia.org/api/rest_v1), CC0 data.
 * Wikimedia's User-Agent policy requires a descriptive UA with contact info — same
 * pattern as the existing wikimedia-commons adapter (UC-599).
 */
export class WikimediaAnalyticsAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'wikimedia-analytics', baseUrl: ANALYTICS_API });
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
      case 'wikimedia-analytics.pageviews_aggregate': {
        const project = requireProject(req.toolId, params.project);
        const access = String(params.access ?? 'all-access');
        const agent = String(params.agent ?? 'all-agents');
        const granularity = String(params.granularity ?? 'daily');
        const start = requireDate(req.toolId, params.start, 'start');
        const end = requireDate(req.toolId, params.end, 'end');
        const url = `${ANALYTICS_API}/pageviews/aggregate/${encodeURIComponent(project)}/${access}/${agent}/${granularity}/${start}/${end}`;
        return { url, method: 'GET', headers };
      }

      case 'wikimedia-analytics.pageviews_top': {
        const project = requireProject(req.toolId, params.project);
        const access = String(params.access ?? 'all-access');
        const year = String(params.year ?? '').trim();
        const month = String(params.month ?? '').trim();
        const day = String(params.day ?? '').trim();
        if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^(\d{2}|all-days)$/.test(day)) {
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message: 'year must be YYYY, month must be MM, day must be DD or "all-days"',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        const url = `${ANALYTICS_API}/pageviews/top/${encodeURIComponent(project)}/${access}/${year}/${month}/${day}`;
        return { url, method: 'GET', headers };
      }

      case 'wikimedia-analytics.pageviews_per_article': {
        const project = requireProject(req.toolId, params.project);
        const article = String(params.article ?? '').trim();
        if (!article) {
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message: 'article is required (e.g. Albert_Einstein)',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        const access = String(params.access ?? 'all-access');
        const agent = String(params.agent ?? 'all-agents');
        const granularity = String(params.granularity ?? 'daily');
        const start = requireDate(req.toolId, params.start, 'start');
        const end = requireDate(req.toolId, params.end, 'end');
        const url = `${ANALYTICS_API}/pageviews/per-article/${encodeURIComponent(project)}/${access}/${agent}/${encodeURIComponent(article.replace(/ /g, '_'))}/${granularity}/${start}/${end}`;
        return { url, method: 'GET', headers };
      }

      case 'wikimedia-analytics.edits_aggregate': {
        const project = requireProject(req.toolId, params.project);
        const editorType = String(params.editor_type ?? 'all-editor-types');
        const pageType = String(params.page_type ?? 'all-page-types');
        const granularity = String(params.granularity ?? 'monthly');
        const start = requireDate(req.toolId, params.start, 'start');
        const end = requireDate(req.toolId, params.end, 'end');
        const url = `${ANALYTICS_API}/edits/aggregate/${encodeURIComponent(project)}/${editorType}/${pageType}/${granularity}/${start}/${end}`;
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
      case 'wikimedia-analytics.pageviews_aggregate':
        return this.parsePageviewsAggregate(raw.body as WikimediaPageviewsAggregateResponse);
      case 'wikimedia-analytics.pageviews_top':
        return this.parsePageviewsTop(raw.body as WikimediaPageviewsTopResponse);
      case 'wikimedia-analytics.pageviews_per_article':
        return this.parsePerArticle(raw.body as WikimediaPerArticleResponse);
      case 'wikimedia-analytics.edits_aggregate':
        return this.parseEditsAggregate(raw.body as WikimediaEditsAggregateResponse);
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

  private parsePageviewsAggregate(
    body: WikimediaPageviewsAggregateResponse,
  ): WikimediaPageviewsAggregateOutput {
    const items = body.items ?? [];
    const first = items[0];
    return {
      project: first?.project ?? '',
      access: first?.access ?? '',
      agent: first?.agent ?? '',
      granularity: first?.granularity ?? '',
      data_points: items.map((i) => ({ timestamp: i.timestamp, views: i.views })),
    };
  }

  private parsePageviewsTop(body: WikimediaPageviewsTopResponse): WikimediaPageviewsTopOutput {
    const entry = (body.items ?? [])[0];
    return {
      project: entry?.project ?? '',
      access: entry?.access ?? '',
      date: entry ? `${entry.year}-${entry.month}-${entry.day}` : '',
      articles: (entry?.articles ?? []).map((a) => ({
        article: a.article,
        views: a.views,
        rank: a.rank,
      })),
    };
  }

  private parsePerArticle(body: WikimediaPerArticleResponse): WikimediaPerArticleOutput {
    const items = body.items ?? [];
    const first = items[0];
    return {
      project: first?.project ?? '',
      article: first?.article ?? '',
      access: first?.access ?? '',
      agent: first?.agent ?? '',
      granularity: first?.granularity ?? '',
      data_points: items.map((i) => ({ timestamp: i.timestamp, views: i.views })),
    };
  }

  private parseEditsAggregate(
    body: WikimediaEditsAggregateResponse,
  ): WikimediaEditsAggregateOutput {
    const entry = (body.items ?? [])[0];
    return {
      project: entry?.project ?? '',
      editor_type: entry?.['editor-type'] ?? '',
      page_type: entry?.['page-type'] ?? '',
      granularity: entry?.granularity ?? '',
      data_points: (entry?.results ?? []).map((r) => ({ timestamp: r.timestamp, edits: r.edits })),
    };
  }
}
