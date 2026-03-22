import { createHash } from 'node:crypto';
import { BaseAdapter } from '../base.adapter';
import type { ProviderRequest, ProviderRawResponse } from '../../types/provider';

export class PodcastIndexAdapter extends BaseAdapter {
  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor(apiKey: string, apiSecret: string) {
    super({ timeout: 10_000, maxRetries: 2, maxResponseSize: 512_000 });
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  private authHeaders(): Record<string, string> {
    const ts = Math.floor(Date.now() / 1000).toString();
    const hash = createHash('sha1')
      .update(this.apiKey + this.apiSecret + ts)
      .digest('hex');
    return {
      'X-Auth-Key': this.apiKey,
      'X-Auth-Date': ts,
      'Authorization': hash,
      'User-Agent': 'APIbase/1.0',
    };
  }

  buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = (req.params ?? {}) as Record<string, unknown>;
    const base = 'https://api.podcastindex.org/api/1.0';

    switch (req.toolId) {
      case 'podcast.search': {
        const qs = new URLSearchParams();
        qs.set('q', String(params.q ?? ''));
        if (params.max) qs.set('max', String(params.max));
        if (params.lang) qs.set('lang', String(params.lang));
        if (params.cat) qs.set('cat', String(params.cat));
        return { url: `${base}/search/byterm?${qs}`, method: 'GET', headers: this.authHeaders() };
      }

      case 'podcast.trending': {
        const qs = new URLSearchParams();
        if (params.max) qs.set('max', String(params.max));
        if (params.lang) qs.set('lang', String(params.lang));
        if (params.cat) qs.set('cat', String(params.cat));
        if (params.since) qs.set('since', String(params.since));
        return { url: `${base}/podcasts/trending?${qs}`, method: 'GET', headers: this.authHeaders() };
      }

      case 'podcast.episodes': {
        const qs = new URLSearchParams();
        qs.set('id', String(params.id ?? ''));
        if (params.max) qs.set('max', String(params.max));
        if (params.since) qs.set('since', String(params.since));
        return { url: `${base}/episodes/byfeedid?${qs}`, method: 'GET', headers: this.authHeaders() };
      }

      case 'podcast.by_feed': {
        const id = String(params.id ?? '');
        return { url: `${base}/podcasts/byfeedid?id=${id}`, method: 'GET', headers: this.authHeaders() };
      }

      default:
        throw new Error(`Unknown tool: ${req.toolId}`);
    }
  }

  parseResponse(raw: ProviderRawResponse, req: ProviderRequest): ProviderRawResponse {
    const body =
      typeof raw.body === 'string' ? JSON.parse(raw.body) : raw.body;

    if (body?.status === 'false' || body?.status === false) {
      return { ...raw, status: 502, body: { error: body?.description ?? 'PodcastIndex request failed' } };
    }

    // search + trending → feeds[]
    if (req.toolId === 'podcast.search' || req.toolId === 'podcast.trending') {
      const feeds = (body?.feeds ?? []).map((f: Record<string, unknown>) => ({
        id: f.id,
        title: f.title,
        author: f.author,
        description: String(f.description ?? '').slice(0, 500),
        url: f.url,
        link: f.link,
        artwork: f.artwork,
        language: f.language,
        categories: f.categories,
        episode_count: f.episodeCount,
        explicit: f.explicit,
        trending_score: f.trendScore ?? null,
      }));
      return { ...raw, body: { feeds, count: body?.count ?? feeds.length } };
    }

    // episodes → items[]
    if (req.toolId === 'podcast.episodes') {
      const items = (body?.items ?? []).map((e: Record<string, unknown>) => ({
        id: e.id,
        title: e.title,
        description: String(e.description ?? '').slice(0, 500),
        date_published: e.datePublished,
        duration: e.duration,
        audio_url: e.enclosureUrl,
        audio_type: e.enclosureType,
        audio_size_bytes: e.enclosureLength,
        episode: e.episode,
        season: e.season,
        explicit: e.explicit,
      }));
      return { ...raw, body: { episodes: items, count: body?.count ?? items.length } };
    }

    // by_feed → feed{}
    if (req.toolId === 'podcast.by_feed') {
      const f = body?.feed ?? {};
      return {
        ...raw,
        body: {
          id: f.id,
          title: f.title,
          author: f.author,
          description: String(f.description ?? '').slice(0, 500),
          url: f.url,
          link: f.link,
          artwork: f.artwork,
          language: f.language,
          categories: f.categories,
          episode_count: f.episodeCount,
          last_update: f.lastUpdateTime,
          explicit: f.explicit,
          funding: f.funding,
        },
      };
    }

    return raw;
  }
}
