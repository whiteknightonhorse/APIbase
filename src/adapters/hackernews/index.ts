import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
  PROVIDER_BACKOFF_BASE_MS,
} from '../../types/provider';
import type { HnItem, HnUser } from './types';

const HN_BASE = 'https://hacker-news.firebaseio.com/v0';
const HN_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'APIbase/1.0 (https://apibase.pro)',
};
const STORY_LIST_MAX = 20;

/**
 * HackerNews Firebase adapter (UC-521).
 *
 * Supported tools (read-only):
 *   hackernews.top_stories  → GET /v0/topstories.json + item details
 *   hackernews.new_stories  → GET /v0/newstories.json + item details
 *   hackernews.best_stories → GET /v0/beststories.json + item details
 *   hackernews.item_details → GET /v0/item/{id}.json
 *   hackernews.user_profile → GET /v0/user/{id}.json
 *
 * Auth: None (public Firebase endpoint, CC BY 3.0).
 * Rate limit: None documented.
 */
export class HackernewsAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'hackernews',
      baseUrl: HN_BASE,
    });
  }

  // All logic lives in call() — buildRequest/parseResponse are required stubs.
  protected buildRequest(_req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    throw new Error('HackernewsAdapter.buildRequest() should not be called directly');
  }

  protected parseResponse(raw: ProviderRawResponse): unknown {
    return raw.body;
  }

  override async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    const start = performance.now();
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'hackernews.top_stories':
      case 'hackernews.new_stories':
      case 'hackernews.best_stories': {
        const limit = Math.min(Number(params.limit ?? 10), STORY_LIST_MAX);
        const endpoint = {
          'hackernews.top_stories': 'topstories',
          'hackernews.new_stories': 'newstories',
          'hackernews.best_stories': 'beststories',
        }[req.toolId];

        const ids = await this.fetchJson<number[]>(`${HN_BASE}/${endpoint}.json`, req, start);

        const topIds = ids.slice(0, limit);
        const items = await Promise.all(topIds.map((id) => this.fetchItem(id, req, start)));

        const stories = items
          .filter(
            (item): item is HnItem =>
              item !== null && item.type === 'story' && !item.deleted && !item.dead,
          )
          .map((item) => this.formatItem(item));

        const body = {
          count: stories.length,
          stories,
        };

        return {
          status: 200,
          headers: {},
          body,
          durationMs: Math.round(performance.now() - start),
          byteLength: JSON.stringify(body).length,
        };
      }

      case 'hackernews.item_details': {
        const id = Number(params.id);
        if (!id || id <= 0) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 400,
            message: 'Parameter "id" must be a positive integer (HackerNews item ID)',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        const item = await this.fetchJson<HnItem | null>(`${HN_BASE}/item/${id}.json`, req, start);
        if (!item) {
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message: `Item ${id} not found on HackerNews`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs: Math.round(performance.now() - start),
          };
        }
        const body = this.formatItem(item);
        return {
          status: 200,
          headers: {},
          body,
          durationMs: Math.round(performance.now() - start),
          byteLength: JSON.stringify(body).length,
        };
      }

      case 'hackernews.user_profile': {
        const username = String(params.username ?? '').trim();
        if (!username) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 400,
            message: 'Parameter "username" is required',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        const user = await this.fetchJson<HnUser | null>(
          `${HN_BASE}/user/${encodeURIComponent(username)}.json`,
          req,
          start,
        );
        if (!user) {
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message: `User "${username}" not found on HackerNews`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs: Math.round(performance.now() - start),
          };
        }
        const body = {
          username: user.id,
          karma: user.karma,
          created_at: new Date(user.created * 1000).toISOString(),
          about: user.about ?? null,
          submission_count: user.submitted?.length ?? 0,
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

  private formatItem(item: HnItem): Record<string, unknown> {
    return {
      id: item.id,
      type: item.type,
      title: item.title ?? null,
      url: item.url ?? null,
      by: item.by ?? null,
      score: item.score ?? null,
      comment_count: item.descendants ?? null,
      time: item.time ? new Date(item.time * 1000).toISOString() : null,
      text: item.text ?? null,
      kids: item.kids?.slice(0, 10) ?? [],
      hn_url: `https://news.ycombinator.com/item?id=${item.id}`,
    };
  }

  private async fetchItem(id: number, req: ProviderRequest, start: number): Promise<HnItem | null> {
    try {
      return await this.fetchJson<HnItem | null>(`${HN_BASE}/item/${id}.json`, req, start);
    } catch {
      return null;
    }
  }

  private async fetchJson<T>(url: string, req: ProviderRequest, start: number): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        await sleep(PROVIDER_BACKOFF_BASE_MS * Math.pow(2, attempt - 1));
      }

      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: HN_HEADERS,
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (response.status >= 500) {
          throw {
            code: ProviderErrorCode.UNAVAILABLE,
            httpStatus: 502,
            message: `HackerNews Firebase returned ${response.status}`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs: Math.round(performance.now() - start),
          };
        }

        const text = await response.text();
        if (text === 'null') return null as T;
        return JSON.parse(text) as T;
      } catch (error) {
        const err = error as { code?: string };
        if (err.code === 'UNAVAILABLE') {
          lastError = error;
          continue;
        }
        // Non-retryable errors (parse errors, 4xx, etc.) throw immediately
        throw error;
      }
    }

    throw lastError;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
