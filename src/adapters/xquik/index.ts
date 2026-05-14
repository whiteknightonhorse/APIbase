import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRawResponse,
  type ProviderRequest,
  ProviderErrorCode,
} from '../../types/provider';

/**
 * Xquik adapter.
 *
 * Supported tools:
 *   xquik.search_tweets  -> GET /api/v1/x/tweets/search
 *   xquik.user           -> GET /api/v1/x/users/{id}
 *   xquik.followers      -> GET /api/v1/x/users/{id}/followers
 *   xquik.trends         -> GET /api/v1/x/trends
 *
 * Auth: x-api-key header.
 */
export class XquikAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'xquik',
      baseUrl: 'https://xquik.com/api/v1',
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
      'x-api-key': this.apiKey,
    };

    switch (req.toolId) {
      case 'xquik.search_tweets': {
        const qs = new URLSearchParams();
        qs.set('q', String(params.query ?? 'news'));
        qs.set('queryType', params.sort_order === 'top' ? 'Top' : 'Latest');
        if (params.cursor) qs.set('cursor', String(params.cursor));
        if (params.since_time) qs.set('sinceTime', String(params.since_time));
        if (params.until_time) qs.set('untilTime', String(params.until_time));
        if (params.limit) qs.set('limit', String(params.limit));
        return {
          url: `${this.baseUrl}/x/tweets/search?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'xquik.user': {
        const userId = this.getUserId(params);
        return {
          url: `${this.baseUrl}/x/users/${encodeURIComponent(userId)}`,
          method: 'GET',
          headers,
        };
      }

      case 'xquik.followers': {
        const qs = new URLSearchParams();
        const userId = this.getUserId(params);
        if (params.cursor) qs.set('cursor', String(params.cursor));
        if (params.page_size) qs.set('pageSize', String(params.page_size));
        const suffix = qs.toString();
        return {
          url: `${this.baseUrl}/x/users/${encodeURIComponent(userId)}/followers${suffix ? `?${suffix}` : ''}`,
          method: 'GET',
          headers,
        };
      }

      case 'xquik.trends': {
        const qs = new URLSearchParams();
        qs.set('woeid', String(params.woeid ?? 1));
        if (params.count) qs.set('count', String(params.count));
        return {
          url: `${this.baseUrl}/x/trends?${qs.toString()}`,
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
      case 'xquik.search_tweets': {
        const tweets = (body.tweets as Array<Record<string, unknown>>) ?? [];
        return {
          total: tweets.length,
          has_next: body.has_next_page ?? false,
          next_cursor: body.next_cursor ?? null,
          tweets: tweets.map((tweet) => this.mapTweet(tweet)),
        };
      }

      case 'xquik.user':
        return this.mapUser(body);

      case 'xquik.followers': {
        const users = (body.users as Array<Record<string, unknown>>) ?? [];
        return {
          total: users.length,
          has_next: body.has_next_page ?? false,
          next_cursor: body.next_cursor ?? null,
          followers: users.map((user) => this.mapUser(user)),
        };
      }

      case 'xquik.trends': {
        const trends = (body.trends as Array<Record<string, unknown>>) ?? [];
        return {
          total: body.count ?? trends.length,
          woeid: body.woeid,
          trends: trends.map((trend) => ({
            name: trend.name,
            description: trend.description,
            query: trend.query,
            rank: trend.rank,
          })),
        };
      }

      default:
        return body;
    }
  }

  private getUserId(params: Record<string, unknown>): string {
    return String(params.username ?? params.user_id ?? '');
  }

  private mapTweet(tweet: Record<string, unknown>): Record<string, unknown> {
    const author = tweet.author as Record<string, unknown> | undefined;
    return {
      id: tweet.id,
      text: tweet.text,
      created_at: tweet.createdAt,
      author: author ? this.mapUser(author) : null,
      likes: tweet.likeCount,
      retweets: tweet.retweetCount,
      replies: tweet.replyCount,
      quotes: tweet.quoteCount,
      views: tweet.viewCount,
      bookmarks: tweet.bookmarkCount,
      lang: tweet.lang,
    };
  }

  private mapUser(user: Record<string, unknown>): Record<string, unknown> {
    return {
      id: user.id,
      username: user.username,
      name: user.name,
      bio: user.description,
      location: user.location,
      followers: user.followers,
      following: user.following,
      tweets_count: user.statusesCount,
      verified: user.verified,
      verified_type: user.verifiedType,
      profile_image: user.profilePicture,
      profile_banner: user.coverPicture,
      created_at: user.createdAt,
    };
  }
}
