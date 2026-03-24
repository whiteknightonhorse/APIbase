import { BaseAdapter } from '../base.adapter';
import type { ProviderRequest, ProviderRawResponse } from '../../types/provider';

export class PexelsAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({ timeout: 10_000, maxRetries: 2, maxResponseSize: 512_000 });
    this.apiKey = apiKey;
  }

  buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = (req.params ?? {}) as Record<string, unknown>;
    const headers = { 'Authorization': this.apiKey };

    switch (req.toolId) {
      case 'pexels.search_photos': {
        const qs = new URLSearchParams();
        qs.set('query', String(params.query ?? ''));
        qs.set('per_page', String(params.limit ?? 10));
        if (params.orientation) qs.set('orientation', String(params.orientation));
        if (params.color) qs.set('color', String(params.color));
        if (params.size) qs.set('size', String(params.size));
        if (params.page) qs.set('page', String(params.page));
        return { url: `https://api.pexels.com/v1/search?${qs}`, method: 'GET', headers };
      }

      case 'pexels.search_videos': {
        const qs = new URLSearchParams();
        qs.set('query', String(params.query ?? ''));
        qs.set('per_page', String(params.limit ?? 10));
        if (params.orientation) qs.set('orientation', String(params.orientation));
        if (params.size) qs.set('size', String(params.size));
        return { url: `https://api.pexels.com/videos/search?${qs}`, method: 'GET', headers };
      }

      case 'pexels.curated': {
        const qs = new URLSearchParams();
        qs.set('per_page', String(params.limit ?? 10));
        if (params.page) qs.set('page', String(params.page));
        return { url: `https://api.pexels.com/v1/curated?${qs}`, method: 'GET', headers };
      }

      default:
        throw new Error(`Unknown tool: ${req.toolId}`);
    }
  }

  parseResponse(raw: ProviderRawResponse, req: ProviderRequest): ProviderRawResponse {
    const body = typeof raw.body === 'string' ? JSON.parse(raw.body) : raw.body;

    if (body?.error) {
      return { ...raw, status: 502, body: { error: body.error } };
    }

    if (req.toolId === 'pexels.search_photos' || req.toolId === 'pexels.curated') {
      const photos = (body.photos ?? []).map((p: Record<string, unknown>) => {
        const src = p.src as Record<string, unknown>;
        return {
          id: p.id,
          photographer: p.photographer,
          width: p.width,
          height: p.height,
          alt: p.alt,
          url_original: src?.original,
          url_large: src?.large2x,
          url_medium: src?.medium,
          url_small: src?.small,
          url_portrait: src?.portrait,
          url_landscape: src?.landscape,
          pexels_url: p.url,
        };
      });
      return { ...raw, body: { photos, total: body.total_results ?? photos.length, count: photos.length } };
    }

    if (req.toolId === 'pexels.search_videos') {
      const videos = (body.videos ?? []).map((v: Record<string, unknown>) => {
        const files = (v.video_files as Array<Record<string, unknown>> ?? [])
          .filter((f: Record<string, unknown>) => f.quality === 'hd' || f.quality === 'sd')
          .slice(0, 3)
          .map((f: Record<string, unknown>) => ({
            quality: f.quality,
            width: f.width,
            height: f.height,
            url: f.link,
            file_type: f.file_type,
          }));
        return {
          id: v.id,
          width: v.width,
          height: v.height,
          duration: v.duration,
          user: (v.user as Record<string, unknown>)?.name,
          video_files: files,
          pexels_url: v.url,
        };
      });
      return { ...raw, body: { videos, total: body.total_results ?? videos.length, count: videos.length } };
    }

    return raw;
  }
}
