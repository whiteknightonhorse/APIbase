import { BaseAdapter } from '../base.adapter';
import { type ProviderRequest, type ProviderRawResponse, ProviderErrorCode } from '../../types/provider';

/**
 * Mastodon adapter (UC-081).
 * Fediverse social media — trending posts and hashtags.
 * Auth: None required for trending endpoints.
 * $0 upstream cost. AGPL-3.0 open source.
 */
export class MastodonAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'mastodon', baseUrl: 'https://mastodon.social/api/v1' });
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const h: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'mastodon.trending': {
        const limit = Math.min(Number(p.limit ?? 10), 40);
        return { url: `${this.baseUrl}/trends/statuses?limit=${limit}`, method: 'GET', headers: h };
      }
      case 'mastodon.trending_tags': {
        const limit = Math.min(Number(p.limit ?? 10), 20);
        return { url: `${this.baseUrl}/trends/tags?limit=${limit}`, method: 'GET', headers: h };
      }
      default:
        throw { code: ProviderErrorCode.INVALID_RESPONSE, httpStatus: 502, message: `Unsupported: ${req.toolId}`, provider: this.provider, toolId: req.toolId, durationMs: 0 };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as unknown[];

    if (req.toolId === 'mastodon.trending') {
      const posts = (Array.isArray(body) ? body : []) as Array<Record<string, unknown>>;
      return {
        count: posts.length,
        posts: posts.map((s) => {
          const acct = (s.account as Record<string, unknown>) ?? {};
          const content = String(s.content ?? '').replace(/<[^>]*>/g, '').slice(0, 500);
          return {
            id: s.id,
            content,
            author: acct.acct ?? acct.username,
            author_display: acct.display_name,
            url: s.url,
            reblogs: s.reblogs_count,
            favourites: s.favourites_count,
            replies: s.replies_count,
            created_at: s.created_at,
            language: s.language,
          };
        }),
      };
    }

    // trending_tags
    const tags = (Array.isArray(body) ? body : []) as Array<Record<string, unknown>>;
    return {
      count: tags.length,
      tags: tags.map((t) => {
        const history = (t.history as Array<Record<string, unknown>> ?? []);
        const todayUses = history.length > 0 ? Number(history[0].uses ?? 0) : 0;
        const todayAccounts = history.length > 0 ? Number(history[0].accounts ?? 0) : 0;
        return {
          name: t.name,
          url: t.url,
          uses_today: todayUses,
          accounts_today: todayAccounts,
        };
      }),
    };
  }
}
