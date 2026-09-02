import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  EstoniaCatalogResponse,
  EstoniaTableMetadata,
  EstoniaQueryResponse,
  EstoniaQueryFilter,
} from './types';

/**
 * Statistics Estonia (Statistikaamet) PXWeb API adapter (UC-670).
 *
 * Supported tools:
 *   estonia-statistics.catalog        → GET  /api/v1/en/stat/{path}       (browse taxonomy)
 *   estonia-statistics.table_metadata → GET  /api/v1/en/stat/{table_path} (leaf metadata)
 *   estonia-statistics.table_query    → POST /api/v1/en/stat/{table_path} (run query)
 *
 * Auth: none — Statistics Estonia publishes the database as open data under
 * CC BY-SA 4.0, reuse for commercial and non-commercial purposes explicitly
 * permitted with attribution and share-alike (stat.ee/en/statistics-estonia/
 * about-us/strategy/principles-dissemination-official-statistics). No
 * documented rate limits. Path params are segment-encoded per flywheel
 * [2026-04-05]: split on '/', encodeURIComponent each segment, rejoin.
 * Sanitize: reject paths containing '..' or '//'.
 *
 * Same PXWeb v1 API shape as Statistics Sweden (src/adapters/scb), Latvia
 * (src/adapters/latvia-statistics, UC-668), and Iceland
 * (src/adapters/iceland-statistics, UC-669) — verified identical response
 * structure live before writing this adapter. Unlike Iceland, the root path
 * ('') here already returns the standard `id`/`type` node shape (no `dbid`
 * quirk observed) — no special-casing needed, the catalog tool returns the
 * array as-is at any depth.
 */
export class EstoniaStatisticsAdapter extends BaseAdapter {
  private static readonly ESTONIA_BASE = 'https://andmed.stat.ee/api/v1/en/stat';

  constructor() {
    super({
      provider: 'estonia-statistics',
      baseUrl: EstoniaStatisticsAdapter.ESTONIA_BASE,
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    switch (req.toolId) {
      case 'estonia-statistics.catalog':
        return this.buildCatalog(req.params as Record<string, unknown>);
      case 'estonia-statistics.table_metadata':
        return this.buildTableMetadata(req.params as Record<string, unknown>);
      case 'estonia-statistics.table_query':
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
        message: `Estonia statistics API error: ${String(body['error'])}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: raw.durationMs,
      };
    }

    switch (req.toolId) {
      case 'estonia-statistics.catalog': {
        const data = raw.body as EstoniaCatalogResponse;
        if (!Array.isArray(data)) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: 'Estonia statistics catalog: expected array of nodes',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        return data;
      }
      case 'estonia-statistics.table_metadata': {
        const data = raw.body as EstoniaTableMetadata;
        if (!data || typeof data !== 'object' || !data.title || !Array.isArray(data.variables)) {
          // If it looks like a catalog list, the path was not a leaf table
          if (Array.isArray(raw.body)) {
            return raw.body; // Return as-is (subcategory list)
          }
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message:
              'Estonia statistics table metadata: expected table with title + variables. Is this a leaf table path?',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        return data;
      }
      case 'estonia-statistics.table_query': {
        const data = raw.body as EstoniaQueryResponse;
        if (!data || typeof data !== 'object') {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: 'Estonia statistics table query: unexpected response shape',
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

  private estoniaHeaders(): Record<string, string> {
    return {
      Accept: 'application/json',
      'User-Agent': 'APIbase-Gateway/1.0',
    };
  }

  /**
   * Encode a hierarchical Estonia PXWeb path by encoding each segment individually.
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
        toolId: 'estonia-statistics',
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
      ? `${EstoniaStatisticsAdapter.ESTONIA_BASE}/${encodedPath}`
      : `${EstoniaStatisticsAdapter.ESTONIA_BASE}/`;

    return {
      url,
      method: 'GET',
      headers: this.estoniaHeaders(),
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
        message: 'estonia-statistics.table_metadata: table_path is required',
        provider: this.provider,
        toolId: 'estonia-statistics.table_metadata',
        durationMs: 0,
      };
    }

    const encodedPath = this.encodePath(rawPath);
    return {
      url: `${EstoniaStatisticsAdapter.ESTONIA_BASE}/${encodedPath}`,
      method: 'GET',
      headers: this.estoniaHeaders(),
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
        message: 'estonia-statistics.table_query: table_path is required',
        provider: this.provider,
        toolId: 'estonia-statistics.table_query',
        durationMs: 0,
      };
    }

    const encodedPath = this.encodePath(rawPath);

    const query = params.query as EstoniaQueryFilter[];
    if (!Array.isArray(query)) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'estonia-statistics.table_query: query must be an array of dimension filters',
        provider: this.provider,
        toolId: 'estonia-statistics.table_query',
        durationMs: 0,
      };
    }

    const postBody = {
      query,
      response: { format: 'json-stat2' },
    };

    return {
      url: `${EstoniaStatisticsAdapter.ESTONIA_BASE}/${encodedPath}`,
      method: 'POST',
      headers: {
        ...this.estoniaHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(postBody),
    };
  }
}
