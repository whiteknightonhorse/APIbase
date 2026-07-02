import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  CbsCatalogTableRaw,
  CbsCatalogSearchOutput,
  CbsTableInfoRaw,
  CbsTableInfoOutput,
  CbsDataPropertyRaw,
  CbsTablePropertiesOutput,
  CbsTableDataOutput,
} from './types';

const CBS_BASE = 'https://opendata.cbs.nl';

/**
 * CBS Netherlands adapter (UC-582).
 *
 * Statistics Netherlands (Centraal Bureau voor de Statistiek) — 5900+ statistical
 * datasets covering population, economy, labor, health, environment, and more.
 * OData v3 API, no auth, CC BY 4.0, unlimited free access.
 */
export class CbsNetherlandsAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'cbs', baseUrl: CBS_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'cbs.catalog_search': {
        const qp = new URLSearchParams({ $format: 'json' });
        const filters: string[] = [];
        if (params.query) {
          const q = String(params.query).replace(/'/g, "''");
          filters.push(
            `(substringof('${q}',tolower(Title)) or substringof('${q}',tolower(ShortDescription)))`,
          );
        }
        if (params.frequency) {
          const freq = String(params.frequency).replace(/'/g, "''");
          filters.push(`Frequency eq '${freq}'`);
        }
        if (params.language) {
          const lang = String(params.language).replace(/'/g, "''");
          filters.push(`Language eq '${lang}'`);
        }
        if (filters.length > 0) qp.set('$filter', filters.join(' and '));
        qp.set('$top', String(Math.min(Number(params.limit) || 10, 50)));
        if (params.skip) qp.set('$skip', String(Number(params.skip)));
        qp.set(
          '$select',
          'Identifier,Title,ShortTitle,Period,Frequency,Language,RecordCount,Updated,ApiUrl',
        );
        qp.set('$orderby', 'Updated desc');
        return { url: `${CBS_BASE}/ODataCatalog/Tables?${qp.toString()}`, method: 'GET', headers };
      }

      case 'cbs.table_info': {
        const tableId = encodeURIComponent(String(params.table_id));
        return {
          url: `${CBS_BASE}/ODataApi/OData/${tableId}/TableInfos?$format=json`,
          method: 'GET',
          headers,
        };
      }

      case 'cbs.table_properties': {
        const tableId = encodeURIComponent(String(params.table_id));
        const qp = new URLSearchParams({ $format: 'json', $orderby: 'Position' });
        return {
          url: `${CBS_BASE}/ODataApi/OData/${tableId}/DataProperties?${qp.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'cbs.table_data': {
        const tableId = encodeURIComponent(String(params.table_id));
        const qp = new URLSearchParams({ $format: 'json' });
        if (params.filter) qp.set('$filter', String(params.filter));
        if (params.select) qp.set('$select', String(params.select));
        qp.set('$top', String(Math.min(Number(params.limit) || 10, 100)));
        if (params.skip) qp.set('$skip', String(Number(params.skip)));
        return {
          url: `${CBS_BASE}/ODataApi/OData/${tableId}/TypedDataSet?${qp.toString()}`,
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
      case 'cbs.catalog_search':
        return this.parseCatalogSearch(body);
      case 'cbs.table_info':
        return this.parseTableInfo(body);
      case 'cbs.table_properties':
        return this.parseTableProperties(
          body,
          String((req.params as Record<string, unknown>).table_id),
        );
      case 'cbs.table_data':
        return this.parseTableData(body, String((req.params as Record<string, unknown>).table_id));
      default:
        return body;
    }
  }

  private parseCatalogSearch(body: Record<string, unknown>): CbsCatalogSearchOutput {
    const rows = (body.value ?? []) as CbsCatalogTableRaw[];
    return {
      total: rows.length,
      results: rows.map((r) => ({
        identifier: String(r.Identifier ?? ''),
        title: String(r.Title ?? '').trim(),
        short_title: String(r.ShortTitle ?? '').trim(),
        period: String(r.Period ?? ''),
        frequency: String(r.Frequency ?? ''),
        record_count: Number(r.RecordCount ?? 0),
        updated: String(r.Updated ?? ''),
        api_url: String(r.ApiUrl ?? ''),
      })),
    };
  }

  private parseTableInfo(body: Record<string, unknown>): CbsTableInfoOutput {
    const rows = (body.value ?? []) as CbsTableInfoRaw[];
    const r = rows[0] ?? ({} as CbsTableInfoRaw);
    return {
      identifier: String(r.Identifier ?? ''),
      title: String(r.Title ?? '').trim(),
      short_title: String(r.ShortTitle ?? '').trim(),
      description: String(r.ShortDescription ?? '').trim(),
      summary: String(r.Summary ?? '').trim(),
      period: String(r.Period ?? ''),
      frequency: String(r.Frequency ?? ''),
      language: String(r.Language ?? ''),
      source: String(r.Source ?? '').trim(),
      output_status: String(r.OutputStatus ?? ''),
      record_count: Number(r.RecordCount ?? 0),
      column_count: Number(r.ColumnCount ?? 0),
      updated: String(r.Updated ?? ''),
      api_url: String(r.ApiUrl ?? ''),
      default_selection: String(r.DefaultSelection ?? ''),
    };
  }

  private parseTableProperties(
    body: Record<string, unknown>,
    tableId: string,
  ): CbsTablePropertiesOutput {
    const rows = (body.value ?? []) as CbsDataPropertyRaw[];
    return {
      table_id: tableId,
      properties: rows
        .filter(
          (r) =>
            r.Type === 'TimeDimension' ||
            r.Type === 'GeoDimension' ||
            r.Type === 'Topic' ||
            r.Type === 'TopicGroup',
        )
        .map((r) => ({
          position: Number(r.Position ?? 0),
          key: String(r.Key ?? '').trim(),
          type: String(r.Type ?? ''),
          title: String(r.Title ?? '').trim(),
          description: String(r.Description ?? '').trim(),
          unit: String(r.Unit ?? '').trim(),
          decimals: Number(r.Decimals ?? 0),
        })),
    };
  }

  private parseTableData(body: Record<string, unknown>, tableId: string): CbsTableDataOutput {
    const records = (body.value ?? []) as Record<string, unknown>[];
    return {
      table_id: tableId,
      count: records.length,
      records,
    };
  }
}
