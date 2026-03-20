import { BaseAdapter } from '../base.adapter';
import { type ProviderRequest, type ProviderRawResponse, ProviderErrorCode } from '../../types/provider';

/**
 * GDELT adapter (UC-107).
 * Global events and news. No auth. Free, unlimited.
 */
export class GdeltAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'gdelt', baseUrl: 'https://api.gdeltproject.org/api/v2' });
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const h: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'gdelt.search': {
        const qs = new URLSearchParams();
        qs.set('query', String(p.query));
        qs.set('mode', 'ArtList');
        qs.set('format', 'json');
        qs.set('maxrecords', String(Math.min(Number(p.limit ?? 10), 75)));
        if (p.timespan) qs.set('timespan', String(p.timespan));
        if (p.sort) qs.set('sort', String(p.sort));
        if (p.language) qs.set('sourcelang', String(p.language));
        return { url: `${this.baseUrl}/doc/doc?${qs}`, method: 'GET', headers: h };
      }
      case 'gdelt.timeline': {
        const qs = new URLSearchParams();
        qs.set('query', String(p.query));
        qs.set('mode', 'TimelineVol');
        qs.set('format', 'json');
        if (p.timespan) qs.set('timespan', String(p.timespan));
        return { url: `${this.baseUrl}/doc/doc?${qs}`, method: 'GET', headers: h };
      }
      default:
        throw { code: ProviderErrorCode.INVALID_RESPONSE, httpStatus: 502, message: `Unsupported: ${req.toolId}`, provider: this.provider, toolId: req.toolId, durationMs: 0 };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as Record<string, unknown>;

    if (req.toolId === 'gdelt.search') {
      const articles = (body.articles ?? []) as Array<Record<string, unknown>>;
      return {
        count: articles.length,
        articles: articles.map((a) => ({
          title: a.title,
          url: a.url,
          domain: a.domain,
          language: a.language,
          country: a.sourcecountry,
          image: a.socialimage || null,
          seen_date: a.seendate,
        })),
      };
    }

    // timeline
    const timeline = (body.timeline ?? []) as Array<Record<string, unknown>>;
    return {
      series: timeline.map((t) => ({
        date: t.date,
        value: t.value,
      })),
    };
  }
}
