import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  LatviaCatalogResponse,
  LatviaTableMetadata,
  LatviaQueryResponse,
  LatviaQueryFilter,
} from './types';

/**
 * Central Statistical Bureau of Latvia PXWeb API adapter (UC-668).
 *
 * Supported tools:
 *   latvia-statistics.catalog        → GET  /api/v1/en/OSP_PUB/{path}       (browse taxonomy)
 *   latvia-statistics.table_metadata → GET  /api/v1/en/OSP_PUB/{table_path} (leaf metadata)
 *   latvia-statistics.table_query    → POST /api/v1/en/OSP_PUB/{table_path} (run query)
 *
 * Auth: none — official statistics are open data, CC BY 4.0, commercial
 * use explicitly permitted with attribution (stat.gov.lv/en/about-osp).
 * Path params are segment-encoded per flywheel [2026-04-05]:
 *   split on '/', encodeURIComponent each segment, rejoin.
 *   Sanitize: reject paths containing '..' or '//'.
 *
 * Same PXWeb v1 API shape as Statistics Sweden (src/adapters/scb) —
 * verified identical response structure live before writing this adapter.
 */
export class LatviaStatisticsAdapter extends BaseAdapter {
  private static readonly LATVIA_BASE = 'https://data.stat.gov.lv/api/v1/en/OSP_PUB';

  constructor() {
    super({
      provider: 'latvia-statistics',
      baseUrl: LatviaStatisticsAdapter.LATVIA_BASE,
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    switch (req.toolId) {
      case 'latvia-statistics.catalog':
        return this.buildCatalog(req.params as Record<string, unknown>);
      case 'latvia-statistics.table_metadata':
        return this.buildTableMetadata(req.params as Record<string, unknown>);
      case 'latvia-statistics.table_query':
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
        message: `Latvia statistics API error: ${String(body['error'])}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: raw.durationMs,
      };
    }

    switch (req.toolId) {
      case 'latvia-statistics.catalog': {
        const data = raw.body as LatviaCatalogResponse;
        if (!Array.isArray(data)) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: 'Latvia statistics catalog: expected array of nodes',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        return data;
      }
      case 'latvia-statistics.table_metadata': {
        const data = raw.body as LatviaTableMetadata;
        if (!data || typeof data !== 'object' || !data.title || !Array.isArray(data.variables)) {
          // If it looks like a catalog list, the path was not a leaf table
          if (Array.isArray(raw.body)) {
            return raw.body; // Return as-is (subcategory list)
          }
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message:
              'Latvia statistics table metadata: expected table with title + variables. Is this a leaf table path?',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        return data;
      }
      case 'latvia-statistics.table_query': {
        const data = raw.body as LatviaQueryResponse;
        if (!data || typeof data !== 'object') {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: 'Latvia statistics table query: unexpected response shape',
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

  private latviaHeaders(): Record<string, string> {
    return {
      Accept: 'application/json',
      'User-Agent': 'APIbase-Gateway/1.0',
    };
  }

  /**
   * Encode a hierarchical Latvia PXWeb path by encoding each segment individually.
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
        toolId: 'latvia-statistics',
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
      ? `${LatviaStatisticsAdapter.LATVIA_BASE}/${encodedPath}`
      : `${LatviaStatisticsAdapter.LATVIA_BASE}/`;

    return {
      url,
      method: 'GET',
      headers: this.latviaHeaders(),
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
        message: 'latvia-statistics.table_metadata: table_path is required',
        provider: this.provider,
        toolId: 'latvia-statistics.table_metadata',
        durationMs: 0,
      };
    }

    const encodedPath = this.encodePath(rawPath);
    return {
      url: `${LatviaStatisticsAdapter.LATVIA_BASE}/${encodedPath}`,
      method: 'GET',
      headers: this.latviaHeaders(),
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
        message: 'latvia-statistics.table_query: table_path is required',
        provider: this.provider,
        toolId: 'latvia-statistics.table_query',
        durationMs: 0,
      };
    }

    const encodedPath = this.encodePath(rawPath);

    const query = params.query as LatviaQueryFilter[];
    if (!Array.isArray(query)) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'latvia-statistics.table_query: query must be an array of dimension filters',
        provider: this.provider,
        toolId: 'latvia-statistics.table_query',
        durationMs: 0,
      };
    }

    const postBody = {
      query,
      response: { format: 'json-stat2' },
    };

    return {
      url: `${LatviaStatisticsAdapter.LATVIA_BASE}/${encodedPath}`,
      method: 'POST',
      headers: {
        ...this.latviaHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(postBody),
    };
  }
}
