import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  IcelandCatalogResponse,
  IcelandTableMetadata,
  IcelandQueryResponse,
  IcelandQueryFilter,
} from './types';

/**
 * Statistics Iceland (Hagstofa Íslands) PXWeb API adapter (UC-669).
 *
 * Supported tools:
 *   iceland-statistics.catalog        → GET  /pxen/api/v1/en/{path}       (browse taxonomy)
 *   iceland-statistics.table_metadata → GET  /pxen/api/v1/en/{table_path} (leaf metadata)
 *   iceland-statistics.table_query    → POST /pxen/api/v1/en/{table_path} (run query)
 *
 * Auth: none — all published statistics are open data, CC BY 4.0, reuse for
 * any purpose (including commercial) explicitly permitted with attribution
 * (statice.is/publications/open-data-access). No documented rate limits.
 * Path params are segment-encoded per flywheel [2026-04-05]:
 *   split on '/', encodeURIComponent each segment, rejoin.
 *   Sanitize: reject paths containing '..' or '//'.
 *
 * Same PXWeb v1 API shape as Statistics Sweden (src/adapters/scb) and Latvia
 * (src/adapters/latvia-statistics, UC-668) — verified identical response
 * structure live before writing this adapter. One quirk: the ROOT path ('')
 * returns a list of databases keyed by `dbid` instead of `id`/`type` — this
 * is folded into the shared catalog node type, no special-casing needed
 * since the catalog tool just returns the array as-is.
 */
export class IcelandStatisticsAdapter extends BaseAdapter {
  private static readonly ICELAND_BASE = 'https://px.hagstofa.is/pxen/api/v1/en';

  constructor() {
    super({
      provider: 'iceland-statistics',
      baseUrl: IcelandStatisticsAdapter.ICELAND_BASE,
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    switch (req.toolId) {
      case 'iceland-statistics.catalog':
        return this.buildCatalog(req.params as Record<string, unknown>);
      case 'iceland-statistics.table_metadata':
        return this.buildTableMetadata(req.params as Record<string, unknown>);
      case 'iceland-statistics.table_query':
        return this.buildTableQuery(req.params as Record<string, unknown>);
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
    // Check for a PXWeb error field in 200 responses
    const body = raw.body as Record<string, unknown>;
    if (body && typeof body === 'object' && !Array.isArray(body) && body['error']) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `Iceland statistics API error: ${String(body['error'])}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: raw.durationMs,
      };
    }

    switch (req.toolId) {
      case 'iceland-statistics.catalog': {
        const data = raw.body as IcelandCatalogResponse;
        if (!Array.isArray(data)) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: 'Iceland statistics catalog: expected array of nodes',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        return data;
      }
      case 'iceland-statistics.table_metadata': {
        const data = raw.body as IcelandTableMetadata;
        if (!data || typeof data !== 'object' || !data.title || !Array.isArray(data.variables)) {
          // If it looks like a catalog list, the path was not a leaf table
          if (Array.isArray(raw.body)) {
            return raw.body; // Return as-is (subcategory list)
          }
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message:
              'Iceland statistics table metadata: expected table with title + variables. Is this a leaf table path?',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        return data;
      }
      case 'iceland-statistics.table_query': {
        const data = raw.body as IcelandQueryResponse;
        if (!data || typeof data !== 'object') {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: 'Iceland statistics table query: unexpected response shape',
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

  private icelandHeaders(): Record<string, string> {
    return {
      Accept: 'application/json',
      'User-Agent': 'APIbase-Gateway/1.0',
    };
  }

  /**
   * Encode a hierarchical Iceland PXWeb path by encoding each segment individually.
   * Preserves the '/' delimiter for the URL path.
   * Rejects '..' and '//' (path traversal guard).
   */
  private encodePath(rawPath: string): string {
    if (rawPath.includes('..') || rawPath.includes('//')) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'Invalid path: path traversal sequences are not allowed',
        provider: this.provider,
        toolId: 'iceland-statistics',
        durationMs: 0,
      };
    }

    if (!rawPath || rawPath === '') {
      return '';
    }

    // Split on '/', encode each segment, rejoin
    return rawPath
      .split('/')
      .map((seg) => encodeURIComponent(seg))
      .join('/');
  }

  private buildCatalog(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const rawPath = String(params.path ?? '');
    const encodedPath = this.encodePath(rawPath);
    const url = encodedPath
      ? `${IcelandStatisticsAdapter.ICELAND_BASE}/${encodedPath}`
      : `${IcelandStatisticsAdapter.ICELAND_BASE}/`;

    return {
      url,
      method: 'GET',
      headers: this.icelandHeaders(),
    };
  }

  private buildTableMetadata(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const rawPath = String(params.table_path ?? '');
    if (!rawPath) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'iceland-statistics.table_metadata: table_path is required',
        provider: this.provider,
        toolId: 'iceland-statistics.table_metadata',
        durationMs: 0,
      };
    }

    const encodedPath = this.encodePath(rawPath);
    return {
      url: `${IcelandStatisticsAdapter.ICELAND_BASE}/${encodedPath}`,
      method: 'GET',
      headers: this.icelandHeaders(),
    };
  }

  private buildTableQuery(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string;
  } {
    const rawPath = String(params.table_path ?? '');
    if (!rawPath) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'iceland-statistics.table_query: table_path is required',
        provider: this.provider,
        toolId: 'iceland-statistics.table_query',
        durationMs: 0,
      };
    }

    const encodedPath = this.encodePath(rawPath);

    const query = params.query as IcelandQueryFilter[];
    if (!Array.isArray(query)) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'iceland-statistics.table_query: query must be an array of dimension filters',
        provider: this.provider,
        toolId: 'iceland-statistics.table_query',
        durationMs: 0,
      };
    }

    const postBody = {
      query,
      response: { format: 'json-stat2' },
    };

    return {
      url: `${IcelandStatisticsAdapter.ICELAND_BASE}/${encodedPath}`,
      method: 'POST',
      headers: {
        ...this.icelandHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(postBody),
    };
  }
}
