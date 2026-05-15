import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  ScbCatalogResponse,
  ScbTableMetadata,
  ScbQueryResponse,
  ScbQueryFilter,
} from './types';

/**
 * Statistics Sweden (SCB) PXWeb API adapter (UC-431).
 *
 * Supported tools:
 *   scb.catalog        → GET  /OV0104/v1/doris/en/ssd/{path}   (browse taxonomy)
 *   scb.table_metadata → GET  /OV0104/v1/doris/en/ssd/{table_path}  (leaf metadata)
 *   scb.table_query    → POST /OV0104/v1/doris/en/ssd/{table_path}  (run query)
 *
 * Auth: none — open public data, commercial use OK.
 * Path params are segment-encoded per flywheel [2026-04-05]:
 *   split on '/', encodeURIComponent each segment, rejoin.
 *   Sanitize: reject paths containing '..' or '//'.
 */
export class ScbAdapter extends BaseAdapter {
  private static readonly SCB_BASE = 'https://api.scb.se/OV0104/v1/doris/en/ssd';

  constructor() {
    super({
      provider: 'scb',
      baseUrl: ScbAdapter.SCB_BASE,
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    switch (req.toolId) {
      case 'scb.catalog':
        return this.buildCatalog(req.params as Record<string, unknown>);
      case 'scb.table_metadata':
        return this.buildTableMetadata(req.params as Record<string, unknown>);
      case 'scb.table_query':
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
    // Check for SCB error field in 200 responses
    const body = raw.body as Record<string, unknown>;
    if (body && typeof body === 'object' && !Array.isArray(body) && body['error']) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `SCB API error: ${String(body['error'])}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: raw.durationMs,
      };
    }

    switch (req.toolId) {
      case 'scb.catalog': {
        const data = raw.body as ScbCatalogResponse;
        if (!Array.isArray(data)) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: 'SCB catalog: expected array of nodes',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        return data;
      }
      case 'scb.table_metadata': {
        const data = raw.body as ScbTableMetadata;
        if (!data || typeof data !== 'object' || !data.title || !Array.isArray(data.variables)) {
          // If it looks like a catalog list, the path was not a leaf table
          if (Array.isArray(raw.body)) {
            return raw.body; // Return as-is (subcategory list)
          }
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message:
              'SCB table metadata: expected table with title + variables. Is this a leaf table path?',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        return data;
      }
      case 'scb.table_query': {
        const data = raw.body as ScbQueryResponse;
        if (!data || typeof data !== 'object') {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: 'SCB table query: unexpected response shape',
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

  private scbHeaders(): Record<string, string> {
    return {
      Accept: 'application/json',
      'User-Agent': 'APIbase-Gateway/1.0',
    };
  }

  /**
   * Encode a hierarchical SCB path by encoding each segment individually.
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
        toolId: 'scb',
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
    const url = encodedPath ? `${ScbAdapter.SCB_BASE}/${encodedPath}` : `${ScbAdapter.SCB_BASE}/`;

    return {
      url,
      method: 'GET',
      headers: this.scbHeaders(),
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
        message: 'scb.table_metadata: table_path is required',
        provider: this.provider,
        toolId: 'scb.table_metadata',
        durationMs: 0,
      };
    }

    const encodedPath = this.encodePath(rawPath);
    return {
      url: `${ScbAdapter.SCB_BASE}/${encodedPath}`,
      method: 'GET',
      headers: this.scbHeaders(),
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
        message: 'scb.table_query: table_path is required',
        provider: this.provider,
        toolId: 'scb.table_query',
        durationMs: 0,
      };
    }

    const encodedPath = this.encodePath(rawPath);

    const query = params.query as ScbQueryFilter[];
    if (!Array.isArray(query)) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'scb.table_query: query must be an array of dimension filters',
        provider: this.provider,
        toolId: 'scb.table_query',
        durationMs: 0,
      };
    }

    const postBody = {
      query,
      response: { format: 'json-stat2' },
    };

    return {
      url: `${ScbAdapter.SCB_BASE}/${encodedPath}`,
      method: 'POST',
      headers: {
        ...this.scbHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(postBody),
    };
  }
}
