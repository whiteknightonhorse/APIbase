import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { SsbSearchResult, SsbTableMetadata, SsbQueryFilter, SsbQueryResponse } from './types';

const SSB_BASE = 'https://data.ssb.no/api/v0/en';

/**
 * Statistics Norway (SSB) PXWeb API adapter (UC-459).
 *
 * Norwegian national statistics: population, GDP, employment, energy, prices.
 * 300K+ time-series tables. No auth — open government data (NLOD 2.0).
 *
 * Supported tools:
 *   ssbnorway.search     → GET  /table/?query=<term>   (search tables)
 *   ssbnorway.metadata   → GET  /table/<id>            (table variables + value codes)
 *   ssbnorway.query      → POST /table/<id>            (fetch data, JSON-stat2 response)
 *   ssbnorway.population → POST /table/07459           (population shortcut, simplified params)
 */
export class SsbNorwayAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'ssbnorway', baseUrl: SSB_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    switch (req.toolId) {
      case 'ssbnorway.search':
        return this.buildSearch(req.params as Record<string, unknown>);
      case 'ssbnorway.metadata':
        return this.buildMetadata(req.params as Record<string, unknown>);
      case 'ssbnorway.query':
        return this.buildQuery(req.params as Record<string, unknown>);
      case 'ssbnorway.population':
        return this.buildPopulation(req.params as Record<string, unknown>);
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

    // SSB returns error field inside 200 responses
    if (body && typeof body === 'object' && !Array.isArray(body) && body['error']) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `SSB API error: ${String(body['error'])}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: raw.durationMs,
      };
    }

    switch (req.toolId) {
      case 'ssbnorway.search': {
        const results = raw.body as SsbSearchResult[];
        if (!Array.isArray(results)) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: 'SSB search: expected array of table results',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        return results.map((r) => ({
          id: r.id,
          title: r.title,
          path: r.path ?? null,
          score: r.score ?? null,
          published: r.published ?? null,
        }));
      }

      case 'ssbnorway.metadata': {
        const meta = raw.body as SsbTableMetadata;
        if (!meta || typeof meta !== 'object' || !meta.title || !Array.isArray(meta.variables)) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message:
              'SSB metadata: expected table object with title and variables. Check that the table_id is a valid SSB numeric table ID (e.g. "07459").',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        return {
          title: meta.title,
          updated: meta.updated ?? null,
          variables: meta.variables.map((v) => ({
            code: v.code,
            text: v.text,
            time: v.time ?? false,
            elimination: v.elimination ?? false,
            eliminationValue: v.eliminationValue ?? null,
            values: v.values,
            valueTexts: v.valueTexts ?? [],
          })),
          footnotes: meta.footnotes ?? [],
        };
      }

      case 'ssbnorway.query':
      case 'ssbnorway.population': {
        const data = raw.body as SsbQueryResponse;
        if (!data || typeof data !== 'object' || !data.version) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: 'SSB query: unexpected response — expected JSON-stat2 dataset',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        return data;
      }

      default:
        return raw.body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private ssbHeaders(): Record<string, string> {
    return {
      Accept: 'application/json',
      'User-Agent': 'APIbase-Gateway/1.0 (https://apibase.pro)',
    };
  }

  private buildSearch(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const query = encodeURIComponent(String(params.query ?? ''));
    const limit = Math.min(Number(params.limit) || 10, 50);
    return {
      url: `${SSB_BASE}/table/?query=${query}&limit=${limit}`,
      method: 'GET',
      headers: this.ssbHeaders(),
    };
  }

  private buildMetadata(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const tableId = encodeURIComponent(String(params.table_id ?? ''));
    if (!tableId) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'ssbnorway.metadata: table_id is required',
        provider: this.provider,
        toolId: 'ssbnorway.metadata',
        durationMs: 0,
      };
    }
    return {
      url: `${SSB_BASE}/table/${tableId}`,
      method: 'GET',
      headers: this.ssbHeaders(),
    };
  }

  private buildQuery(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string;
  } {
    const tableId = encodeURIComponent(String(params.table_id ?? ''));
    if (!tableId) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'ssbnorway.query: table_id is required',
        provider: this.provider,
        toolId: 'ssbnorway.query',
        durationMs: 0,
      };
    }
    const query = params.query as SsbQueryFilter[];
    if (!Array.isArray(query)) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'ssbnorway.query: query must be an array of dimension filters',
        provider: this.provider,
        toolId: 'ssbnorway.query',
        durationMs: 0,
      };
    }
    return {
      url: `${SSB_BASE}/table/${tableId}`,
      method: 'POST',
      headers: {
        ...this.ssbHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, response: { format: 'json-stat2' } }),
    };
  }

  private buildPopulation(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string;
  } {
    // Table 07459: Population by region, sex, age, year
    // region_code "0" = The whole country. Default to national total.
    const regionCode = String(params.region_code ?? '0');
    const years = Math.min(Number(params.years) || 5, 20);
    const query: SsbQueryFilter[] = [
      {
        code: 'Region',
        selection: { filter: 'item', values: [regionCode] },
      },
      {
        code: 'ContentsCode',
        selection: { filter: 'item', values: ['Personer1'] },
      },
      {
        code: 'Tid',
        selection: { filter: 'top', values: [String(years)] },
      },
    ];
    return {
      url: `${SSB_BASE}/table/07459`,
      method: 'POST',
      headers: {
        ...this.ssbHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, response: { format: 'json-stat2' } }),
    };
  }
}
