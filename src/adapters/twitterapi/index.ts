import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';

/**
 * TwitterAPI.io adapter (UC-198).
 *
 * Supported tools:
 *   twitter.search    → GET /twitter/tweet/advanced_search
 *   twitter.user      → GET /twitter/user/info
 *   twitter.followers → GET /twitter/user/followers
 *   twitter.trending  → GET /twitter/trends
 *
 * Auth: X-API-Key header. Pay-as-you-go $0.15/1K tweets.
 */
export class TwitterApiAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'twitterapi',
      baseUrl: 'https://api.twitterapi.io',
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
      Accept: 'application/json',
      'X-API-Key': this.apiKey,
    };

    switch (req.toolId) {
      case 'twitter.search': {
        const qs = new URLSearchParams();
        qs.set('query', String(params.query || 'news'));
        qs.set('queryType', String(params.sort_order === 'relevancy' ? 'Top' : 'Latest'));
        if (params.cursor) qs.set('cursor', String(params.cursor));
        return { url: `${this.baseUrl}/twitter/tweet/advanced_search?${qs.toString()}`, method: 'GET', headers };
      }

      case 'twitter.user': {
        const qs = new URLSearchParams();
        if (params.username) qs.set('userName', String(params.username));
        else if (params.user_id) qs.set('userId', String(params.user_id));
        return { url: `${this.baseUrl}/twitter/user/info?${qs.toString()}`, method: 'GET', headers };
      }

      case 'twitter.followers': {
        const qs = new URLSearchParams();
        qs.set('userName', String(params.username));
        if (params.cursor) qs.set('cursor', String(params.cursor));
        return { url: `${this.baseUrl}/twitter/user/followers?${qs.toString()}`, method: 'GET', headers };
      }

      case 'twitter.trending': {
        const qs = new URLSearchParams();
        qs.set('woeid', String(params.woeid || 1)); // 1 = worldwide
        return { url: `${this.baseUrl}/twitter/trends?${qs.toString()}`, method: 'GET', headers };
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
      case 'twitter.search': {
        const tweets = (body.tweets as Array<Record<string, unknown>>) ?? [];
        return {
          total: tweets.length,
          has_next: body.has_next_page ?? false,
          next_cursor: body.next_cursor ?? null,
          tweets: tweets.map((t) => {
            const author = t.author as Record<string, unknown> | undefined;
            return {
              id: t.id,
              text: t.text,
              created_at: t.createdAt,
              author: author ? {
                username: author.userName,
                name: author.name,
                followers: author.followers,
                verified: author.isBlueVerified,
              } : null,
              likes: t.likeCount,
              retweets: t.retweetCount,
              replies: t.replyCount,
              quotes: t.quoteCount,
              views: t.viewCount,
              lang: t.lang,
            };
          }),
        };
      }

      case 'twitter.user': {
        const u = body.data as Record<string, unknown> | undefined;
        if (!u) return body;
        return {
          username: u.userName,
          name: u.name,
          id: u.id,
          bio: u.description,
          location: u.location,
          followers: u.followers,
          following: u.following,
          tweets_count: u.statusesCount,
          verified: u.isBlueVerified,
          profile_image: u.profileImageUrl,
          created_at: u.createdAt,
        };
      }

      case 'twitter.followers': {
        const followers = (body.followers as Array<Record<string, unknown>>) ?? [];
        return {
          total: followers.length,
          has_next: body.has_next_page ?? false,
          next_cursor: body.next_cursor ?? null,
          followers: followers.map((f) => ({
            username: f.userName,
            name: f.name,
            bio: f.description,
            followers: f.followers,
            verified: f.isBlueVerified,
          })),
        };
      }

      case 'twitter.trending': {
        const trends = (body.trends as Array<Record<string, unknown>>) ?? [];
        return {
          total: trends.length,
          trends: trends.map((t) => {
            const trend = t.trend as Record<string, unknown> | undefined;
            return {
              name: trend?.name,
              query: (trend?.target as Record<string, unknown>)?.query,
              rank: trend?.rank,
            };
          }),
        };
      }

      default:
        return body;
    }
  }
}
