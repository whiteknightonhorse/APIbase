import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { WikidataSearchResult, WikidataSearchOutput, WikidataEntityOutput } from './types';

/**
 * Wikidata adapter (UC-323).
 *
 * Supported tools:
 *   wikidata.search → MediaWiki wbsearchentities
 *   wikidata.entity → REST API /entities/items/{id}
 *
 * Auth: None. CC-0 public domain. 100M+ entities.
 */
export class WikidataAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'wikidata',
      baseUrl: 'https://www.wikidata.org',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'APIbase-MCP/1.0 (https://apibase.pro)',
    };

    switch (req.toolId) {
      case 'wikidata.search': {
        const query = encodeURIComponent(String(params.query));
        const lang = String(params.language || 'en');
        const limit = Math.min(Number(params.limit) || 10, 20);
        return {
          url: `${this.baseUrl}/w/api.php?action=wbsearchentities&search=${query}&language=${lang}&limit=${limit}&format=json`,
          method: 'GET',
          headers,
        };
      }

      case 'wikidata.entity': {
        const id = encodeURIComponent(String(params.id));
        return {
          url: `${this.baseUrl}/w/rest.php/wikibase/v1/entities/items/${id}`,
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
      case 'wikidata.search':
        return this.parseSearch(body);
      case 'wikidata.entity':
        return this.parseEntity(body);
      default:
        return body;
    }
  }

  private parseSearch(body: Record<string, unknown>): WikidataSearchOutput {
    const results = (body.search ?? []) as WikidataSearchResult[];
    return {
      results: results.map((r) => ({
        id: r.id ?? '',
        label: r.label ?? '',
        description: r.description ?? '',
        url: r.url ? `https://www.wikidata.org/wiki/${r.id}` : '',
      })),
      count: results.length,
    };
  }

  private parseEntity(body: Record<string, unknown>): WikidataEntityOutput {
    const id = String(body.id ?? '');
    const labels = (body.labels ?? {}) as Record<string, string>;
    const descriptions = (body.descriptions ?? {}) as Record<string, string>;
    const aliases = (body.aliases ?? {}) as Record<string, string[]>;
    const statements = (body.statements ?? {}) as Record<string, unknown>;

    // Extract top 20 statement property IDs (full statements too large)
    const propKeys = Object.keys(statements).slice(0, 20);
    const props: Record<string, unknown> = {};
    for (const key of propKeys) {
      props[key] = statements[key];
    }

    return {
      id,
      label: labels.en ?? Object.values(labels)[0] ?? '',
      description: descriptions.en ?? Object.values(descriptions)[0] ?? '',
      aliases: aliases.en ?? Object.values(aliases)[0] ?? [],
      properties: props,
      url: `https://www.wikidata.org/wiki/${id}`,
    };
  }
}
