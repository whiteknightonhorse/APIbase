import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { CbsCatalogResponse, CbsTableMetadataResponse, CbsDataResponse } from './types';

/**
 * Statistics Netherlands (CBS) OData v3 API adapter (UC-432).
 *
 * Supported tools:
 *   cbs.catalog_search  → GET /ODataApi/odata/CBS.Tables?$filter=substringof(...)  (catalog search)
 *   cbs.table_metadata  → GET /ODataApi/odata/{table_id}/TableInfos                (table metadata)
 *   cbs.table_data      → GET /ODataApi/odata/{table_id}/TypedDataSet?$top=...     (data rows)
 *
 * Auth: none — CC0 public domain, commercial use OK.
 * table_id is validated against /^[a-zA-Z0-9_]+$/ (CBS IDs are strictly alphanumeric).
 * query params are URL-encoded per flywheel [2026-04-05].
 */
export class CbsAdapter extends BaseAdapter {
  private static readonly CBS_BASE = 'https://opendata.cbs.nl/ODataApi/odata';

  constructor() {
    super({
      provider: 'cbs',
      baseUrl: CbsAdapter.CBS_BASE,
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    switch (req.toolId) {
      case 'cbs.catalog_search':
        return this.buildCatalogSearch(req.params as Record<string, unknown>);
      case 'cbs.table_metadata':
        return this.buildTableMetadata(req.params as Record<string, unknown>);
      case 'cbs.table_data':
        return this.buildTableData(req.params as Record<string, unknown>);
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
    switch (req.toolId) {
      case 'cbs.catalog_search': {
        const data = raw.body as CbsCatalogResponse;
        if (!data || !Array.isArray(data.value)) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: 'CBS catalog search: expected OData envelope with value array',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        // Return the OData envelope (includes value array and metadata link)
        return data;
      }
      case 'cbs.table_metadata': {
        const data = raw.body as CbsTableMetadataResponse;
        if (!data || !Array.isArray(data.value)) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message:
              'CBS table metadata: expected OData envelope with value array. Check that the table_id is valid — use cbs.catalog_search to find valid identifiers.',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        return data;
      }
      case 'cbs.table_data': {
        const data = raw.body as CbsDataResponse;
        if (!data || !Array.isArray(data.value)) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message:
              'CBS table data: expected OData envelope with value array. Check that the table_id is valid — use cbs.catalog_search to find valid identifiers.',
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

  private cbsHeaders(): Record<string, string> {
    return {
      Accept: 'application/json',
      'User-Agent': 'APIbase-Gateway/1.0',
    };
  }

  /**
   * Validate a CBS table ID against the allowed pattern.
   * CBS identifiers are strictly alphanumeric (e.g. '85619NED', 'NLV06', '83765NED').
   * Underscore is allowed for compound IDs.
   * Prevents path injection attacks.
   */
  private validateTableId(tableId: string, toolId: string): void {
    if (!tableId || !/^[a-zA-Z0-9_]+$/.test(tableId)) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `Invalid table_id '${tableId}': CBS identifiers must be strictly alphanumeric (e.g. '85619NED', '83765NED'). Use cbs.catalog_search to find valid identifiers.`,
        provider: this.provider,
        toolId,
        durationMs: 0,
      };
    }
  }

  private buildCatalogSearch(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const query = String(params.query ?? '');
    if (!query) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'cbs.catalog_search: query is required',
        provider: this.provider,
        toolId: 'cbs.catalog_search',
        durationMs: 0,
      };
    }

    const top = Math.min(Math.max(1, Number(params.top ?? 25)), 100);
    // OData v3 substringof filter — encode the query value
    const encodedQuery = encodeURIComponent(query);
    const filter = `substringof('${encodedQuery}',Title)+or+substringof('${encodedQuery}',ShortDescription)`;
    const url = `${CbsAdapter.CBS_BASE}/CBS.Tables?$filter=${filter}&$top=${top}`;

    return {
      url,
      method: 'GET',
      headers: this.cbsHeaders(),
    };
  }

  private buildTableMetadata(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const tableId = String(params.table_id ?? '');
    this.validateTableId(tableId, 'cbs.table_metadata');

    return {
      url: `${CbsAdapter.CBS_BASE}/${tableId}/TableInfos`,
      method: 'GET',
      headers: this.cbsHeaders(),
    };
  }

  private buildTableData(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const tableId = String(params.table_id ?? '');
    this.validateTableId(tableId, 'cbs.table_data');

    const top = Math.min(Math.max(1, Number(params.top ?? 100)), 1000);
    const skip = Math.max(0, Number(params.skip ?? 0));

    const queryParts: string[] = [`$top=${top}`];
    if (skip > 0) {
      queryParts.push(`$skip=${skip}`);
    }

    const filter = params.filter ? String(params.filter) : '';
    if (filter) {
      // Encode the OData filter expression value
      queryParts.push(`$filter=${encodeURIComponent(filter)}`);
    }

    const url = `${CbsAdapter.CBS_BASE}/${tableId}/TypedDataSet?${queryParts.join('&')}`;

    return {
      url,
      method: 'GET',
      headers: this.cbsHeaders(),
    };
  }
}
