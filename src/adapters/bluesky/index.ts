import { BaseAdapter } from '../base.adapter';
import type { ProviderRequest, ProviderRawResponse } from '../../types/provider';

export class BlueskyAdapter extends BaseAdapter {
  private readonly handle: string;
  private readonly appPassword: string;
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(handle: string, appPassword: string) {
    super({ timeout: 10_000, maxRetries: 2, maxResponseSize: 512_000 });
    this.handle = handle;
    this.appPassword = appPassword;
  }

  private async getToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }
    const res = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: this.handle, password: this.appPassword }),
    });
    if (!res.ok) throw new Error(`Bluesky auth failed: ${res.status}`);
    const data = (await res.json()) as { accessJwt: string };
    this.accessToken = data.accessJwt;
    // Token valid ~2 hours, refresh at 90 min
    this.tokenExpiresAt = Date.now() + 90 * 60 * 1000;
    return this.accessToken;
  }

  async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    await this.getToken();
    return super.call(req);
  }

  buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = (req.params ?? {}) as Record<string, unknown>;
    const base = 'https://bsky.social/xrpc';
    const headers = {
      'Authorization': `Bearer ${this.accessToken}`,
    };

    switch (req.toolId) {
      case 'bluesky.search_posts': {
        const qs = new URLSearchParams();
        qs.set('q', String(params.q ?? ''));
        if (params.limit) qs.set('limit', String(params.limit));
        if (params.lang) qs.set('lang', String(params.lang));
        if (params.sort) qs.set('sort', String(params.sort));
        return { url: `${base}/app.bsky.feed.searchPosts?${qs}`, method: 'GET', headers };
      }

      case 'bluesky.profile': {
        const actor = String(params.handle ?? '');
        return { url: `${base}/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`, method: 'GET', headers };
      }

      case 'bluesky.feed': {
        const actor = String(params.handle ?? '');
        const limit = params.limit ?? 20;
        return { url: `${base}/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(actor)}&limit=${limit}`, method: 'GET', headers };
      }

      default:
        throw new Error(`Unknown tool: ${req.toolId}`);
    }
  }

  parseResponse(raw: ProviderRawResponse, req: ProviderRequest): ProviderRawResponse {
    const body =
      typeof raw.body === 'string' ? JSON.parse(raw.body) : raw.body;

    if (body?.error) {
      return { ...raw, status: 502, body: { error: body.message ?? body.error } };
    }

    if (req.toolId === 'bluesky.search_posts') {
      const posts = (body.posts ?? []).map((p: Record<string, unknown>) => {
        const author = p.author as Record<string, unknown> | undefined;
        const record = p.record as Record<string, unknown> | undefined;
        return {
          uri: p.uri,
          author_handle: author?.handle,
          author_name: author?.displayName,
          text: record?.text,
          created_at: record?.createdAt,
          like_count: p.likeCount,
          repost_count: p.repostCount,
          reply_count: p.replyCount,
        };
      });
      return { ...raw, body: { posts, count: posts.length, cursor: body.cursor ?? null } };
    }

    if (req.toolId === 'bluesky.profile') {
      return {
        ...raw,
        body: {
          did: body.did,
          handle: body.handle,
          display_name: body.displayName,
          description: body.description?.slice(0, 500),
          avatar: body.avatar,
          followers_count: body.followersCount,
          follows_count: body.followsCount,
          posts_count: body.postsCount,
          created_at: body.createdAt,
        },
      };
    }

    if (req.toolId === 'bluesky.feed') {
      const posts = (body.feed ?? []).map((item: Record<string, unknown>) => {
        const post = item.post as Record<string, unknown> | undefined;
        const author = post?.author as Record<string, unknown> | undefined;
        const record = post?.record as Record<string, unknown> | undefined;
        return {
          uri: post?.uri,
          author_handle: author?.handle,
          text: record?.text,
          created_at: record?.createdAt,
          like_count: post?.likeCount,
          repost_count: post?.repostCount,
        };
      });
      return { ...raw, body: { posts, count: posts.length, cursor: body.cursor ?? null } };
    }

    return raw;
  }
}
