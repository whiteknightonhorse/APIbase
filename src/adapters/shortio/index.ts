import { BaseAdapter } from '../base.adapter';
import { type ProviderRequest, type ProviderRawResponse, ProviderErrorCode } from '../../types/provider';

/**
 * Short.io URL shortener adapter (UC-112).
 * Auth: Bearer API key. Free: 1K links/mo.
 */
export class ShortIoAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({ provider: 'shortio', baseUrl: 'https://api.short.io' });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const h: Record<string, string> = { Authorization: this.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' };

    switch (req.toolId) {
      case 'shorturl.create': {
        const body: Record<string, unknown> = {
          originalURL: p.url,
          domain: 'apibase.short.gy',
        };
        if (p.title) body.title = p.title;
        if (p.slug) body.path = p.slug;
        return { url: `${this.baseUrl}/links`, method: 'POST', headers: h, body: JSON.stringify(body) };
      }
      case 'shorturl.stats': {
        return { url: `${this.baseUrl}/links/expand?domain=apibase.short.gy&path=${encodeURIComponent(String(p.path))}`, method: 'GET', headers: h };
      }
      default:
        throw { code: ProviderErrorCode.INVALID_RESPONSE, httpStatus: 502, message: `Unsupported: ${req.toolId}`, provider: this.provider, toolId: req.toolId, durationMs: 0 };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as Record<string, unknown>;
    if (req.toolId === 'shorturl.create') {
      return { short_url: body.shortURL, original_url: body.originalURL, id: body.id, path: body.path, created_at: body.createdAt };
    }
    return { short_url: body.shortURL, original_url: body.originalURL, clicks: body.clicks, created_at: body.createdAt, title: body.title };
  }
}
