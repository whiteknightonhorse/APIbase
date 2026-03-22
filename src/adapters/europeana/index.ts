import { BaseAdapter } from '../base.adapter';
import type { ProviderRequest, ProviderRawResponse } from '../../types/provider';

export class EuropeanaAdapter extends BaseAdapter {
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
    const base = 'https://api.europeana.eu/record/v2';

    switch (req.toolId) {
      case 'europeana.search': {
        const qs = new URLSearchParams();
        qs.set('query', String(params.query ?? ''));
        qs.set('wskey', this.apiKey);
        if (params.rows) qs.set('rows', String(params.rows));
        if (params.start) qs.set('start', String(params.start));
        if (params.media) qs.set('media', 'true');
        if (params.country) qs.set('qf', `COUNTRY:${params.country}`);
        return { url: `${base}/search.json?${qs}`, method: 'GET', headers: {} };
      }

      case 'europeana.record': {
        const id = String(params.id ?? '');
        return {
          url: `${base}${id.startsWith('/') ? '' : '/'}${id}.json?wskey=${this.apiKey}`,
          method: 'GET',
          headers: {},
        };
      }

      default:
        throw new Error(`Unknown tool: ${req.toolId}`);
    }
  }

  parseResponse(raw: ProviderRawResponse, req: ProviderRequest): ProviderRawResponse {
    const body =
      typeof raw.body === 'string' ? JSON.parse(raw.body) : raw.body;

    if (!body?.success) {
      return {
        ...raw,
        status: 502,
        body: { error: body?.error ?? 'Europeana request failed' },
      };
    }

    if (req.toolId === 'europeana.search') {
      const items = (body.items ?? []).map((i: Record<string, unknown>) => ({
        id: i.id,
        title: (i.title as string[])?.[0] ?? null,
        description: ((i.dcDescription as string[]) ?? [])[0]?.slice(0, 500) ?? null,
        creator: ((i.dcCreator as string[]) ?? [])[0] ?? null,
        type: (i.type as string) ?? null,
        country: ((i.country as string[]) ?? [])[0] ?? null,
        provider: ((i.dataProvider as string[]) ?? [])[0] ?? null,
        year: ((i.year as string[]) ?? [])[0] ?? null,
        thumbnail: (i.edmPreview as string[])?.[0] ?? null,
        url: i.guid ?? null,
      }));
      return {
        ...raw,
        body: {
          items,
          total_results: body.totalResults,
          count: body.itemsCount,
        },
      };
    }

    if (req.toolId === 'europeana.record') {
      const obj = body.object ?? {};
      const proxy = (obj.proxies ?? [])[0] ?? {};
      const agg = (obj.aggregations ?? [])[0] ?? {};
      return {
        ...raw,
        body: {
          id: obj.about,
          title: proxy.dcTitle?.def?.[0] ?? proxy.dcTitle?.en?.[0] ?? null,
          description: (proxy.dcDescription?.def?.[0] ?? proxy.dcDescription?.en?.[0] ?? '').slice(0, 1000),
          creator: proxy.dcCreator?.def?.[0] ?? null,
          type: proxy.dcType?.def?.[0] ?? null,
          date: proxy.dctermsCreated?.def?.[0] ?? proxy.dcDate?.def?.[0] ?? null,
          language: proxy.dcLanguage?.def?.[0] ?? null,
          source: proxy.dcSource?.def?.[0] ?? null,
          rights: agg.edmRights?.def?.[0] ?? null,
          image_url: agg.edmIsShownBy ?? null,
          provider: agg.edmDataProvider?.def?.[0] ?? null,
          landing_page: agg.edmIsShownAt ?? null,
        },
      };
    }

    return raw;
  }
}
