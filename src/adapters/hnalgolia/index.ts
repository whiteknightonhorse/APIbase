import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { HnaSearchResult, HnaStoryHit, HnaCommentHit, HnaItem, HnaUser } from './types';
import { stripHtml } from '../../utils/strip-html';

const HNA_BASE = 'https://hn.algolia.com/api/v1';
const HNA_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'APIbase/1.0 (https://apibase.pro)',
};

/**
 * HackerNews Algolia adapter (UC-522).
 *
 * Supported tools (read-only):
 *   hnalgolia.search         → GET /api/v1/search       (relevance-ranked)
 *   hnalgolia.search_recent  → GET /api/v1/search_by_date (date-ranked)
 *   hnalgolia.search_comments → GET /api/v1/search?tags=comment
 *   hnalgolia.item_details   → GET /api/v1/items/{id}
 *   hnalgolia.user_profile   → GET /api/v1/users/{username}
 *
 * Auth: None (CC BY 3.0, no rate limits documented).
 */
export class HnAlgoliaAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'hnalgolia',
      baseUrl: HNA_BASE,
    });
  }

  protected buildRequest(_req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    throw new Error('HnAlgoliaAdapter.buildRequest() should not be called directly');
  }

  protected parseResponse(raw: ProviderRawResponse): unknown {
    return raw.body;
  }

  override async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    const start = performance.now();
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'hnalgolia.search':
      case 'hnalgolia.search_recent': {
        const query = String(params.query ?? '').trim();
        const limit = Math.min(Math.max(1, Number(params.limit ?? 10)), 30);
        const page = Math.max(0, Number(params.page ?? 0));
        const type = String(params.type ?? 'story').toLowerCase();

        const tagMap: Record<string, string> = {
          story: 'story',
          comment: 'comment',
          job: 'job',
          poll: 'poll',
          ask: 'ask_hn',
          show: 'show_hn',
        };
        const tag = tagMap[type] ?? 'story';

        const endpoint = req.toolId === 'hnalgolia.search' ? 'search' : 'search_by_date';
        const qs = new URLSearchParams({
          query,
          hitsPerPage: String(limit),
          page: String(page),
          tags: tag,
        });

        const raw = await this.fetchJson<HnaSearchResult>(
          `${HNA_BASE}/${endpoint}?${qs.toString()}`,
          req,
          start,
        );

        const hits = raw.hits as HnaStoryHit[];
        const stories = hits.map((h) => ({
          id: h.objectID,
          title: h.title ?? null,
          url: h.url ?? null,
          author: h.author,
          score: h.points ?? 0,
          comment_count: h.num_comments ?? 0,
          created_at: h.created_at,
          hn_url: `https://news.ycombinator.com/item?id=${h.objectID}`,
          type:
            (h._tags ?? []).find((t) =>
              ['story', 'comment', 'job', 'poll', 'ask_hn', 'show_hn'].includes(t),
            ) ?? 'story',
        }));

        const body = {
          query,
          total_hits: raw.nbHits,
          page: raw.page,
          total_pages: raw.nbPages,
          hits_per_page: raw.hitsPerPage,
          results: stories,
        };

        return {
          status: 200,
          headers: {},
          body,
          durationMs: Math.round(performance.now() - start),
          byteLength: JSON.stringify(body).length,
        };
      }

      case 'hnalgolia.search_comments': {
        const query = String(params.query ?? '').trim();
        const limit = Math.min(Math.max(1, Number(params.limit ?? 10)), 30);
        const page = Math.max(0, Number(params.page ?? 0));

        const qs = new URLSearchParams({
          query,
          hitsPerPage: String(limit),
          page: String(page),
          tags: 'comment',
        });

        const raw = await this.fetchJson<HnaSearchResult>(
          `${HNA_BASE}/search?${qs.toString()}`,
          req,
          start,
        );

        const hits = raw.hits as HnaCommentHit[];
        const comments = hits.map((h) => ({
          id: h.objectID,
          author: h.author,
          text: stripHtml(h.comment_text ?? ''),
          story_id: h.story_id ?? null,
          story_title: h.story_title ?? null,
          story_url: h.story_url ?? null,
          parent_id: h.parent_id ?? null,
          created_at: h.created_at,
          hn_url: `https://news.ycombinator.com/item?id=${h.objectID}`,
        }));

        const body = {
          query,
          total_hits: raw.nbHits,
          page: raw.page,
          total_pages: raw.nbPages,
          hits_per_page: raw.hitsPerPage,
          results: comments,
        };

        return {
          status: 200,
          headers: {},
          body,
          durationMs: Math.round(performance.now() - start),
          byteLength: JSON.stringify(body).length,
        };
      }

      case 'hnalgolia.item_details': {
        const id = Number(params.id);
        if (!id || id <= 0 || !Number.isInteger(id)) {
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message: 'Parameter "id" must be a positive integer (HackerNews item ID)',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }

        const item = await this.fetchJson<HnaItem>(`${HNA_BASE}/items/${id}`, req, start);

        const body = this.formatItem(item);

        return {
          status: 200,
          headers: {},
          body,
          durationMs: Math.round(performance.now() - start),
          byteLength: JSON.stringify(body).length,
        };
      }

      case 'hnalgolia.user_profile': {
        const username = String(params.username ?? '').trim();
        if (!username) {
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message: 'Parameter "username" is required',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }

        const user = await this.fetchJson<HnaUser>(
          `${HNA_BASE}/users/${encodeURIComponent(username)}`,
          req,
          start,
        );

        const body = {
          username: user.username,
          karma: user.karma,
          about: user.about ? stripHtml(user.about) : null,
        };

        return {
          status: 200,
          headers: {},
          body,
          durationMs: Math.round(performance.now() - start),
          byteLength: JSON.stringify(body).length,
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

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private formatItem(item: HnaItem): Record<string, unknown> {
    return {
      id: item.id,
      type: item.type,
      title: item.title ?? null,
      url: item.url ?? null,
      author: item.author ?? null,
      score: item.points ?? null,
      text: item.text ? stripHtml(item.text) : null,
      story_id: item.story_id ?? null,
      parent_id: item.parent_id ?? null,
      created_at: item.created_at,
      hn_url: `https://news.ycombinator.com/item?id=${item.id}`,
      comment_count: item.children?.length ?? 0,
      top_comments: (item.children ?? []).slice(0, 5).map((c) => ({
        id: c.id,
        author: c.author,
        text: c.text ? stripHtml(c.text) : null,
        created_at: c.created_at,
      })),
    };
  }

  private async fetchJson<T>(url: string, req: ProviderRequest, start: number): Promise<T> {
    const response = await fetch(url, {
      method: 'GET',
      headers: HNA_HEADERS,
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (response.status === 404) {
      throw {
        code: ProviderErrorCode.INPUT_REJECTED,
        httpStatus: 422,
        message: `Resource not found: ${url}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: Math.round(performance.now() - start),
      };
    }

    if (response.status >= 400 && response.status < 500) {
      throw {
        code: ProviderErrorCode.INPUT_REJECTED,
        httpStatus: 422,
        message: `HN Algolia rejected request: ${response.status}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: Math.round(performance.now() - start),
      };
    }

    if (response.status >= 500) {
      throw {
        code: ProviderErrorCode.UNAVAILABLE,
        httpStatus: 502,
        message: `HN Algolia returned ${response.status}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: Math.round(performance.now() - start),
      };
    }

    return response.json() as Promise<T>;
  }
}
