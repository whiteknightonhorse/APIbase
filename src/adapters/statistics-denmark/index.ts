import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { DkSubject, DkTableListItem, DkTableInfo, DkDataResponse } from './types';

const DK_BASE = 'https://api.statbank.dk/v1';

/**
 * Statistics Denmark (StatBank) API adapter (UC-594).
 *
 * Danish national statistics: population, labour, economy, social conditions,
 * education, business, transport, culture, environment. 2,000+ time-series
 * tables. No auth — open government data.
 *
 * Supported tools:
 *   statistics-denmark.subjects   → GET  /subjects              (topic tree)
 *   statistics-denmark.tables     → GET  /tables                (search/list tables)
 *   statistics-denmark.table_info → GET  /tableinfo              (dimensions + valid codes)
 *   statistics-denmark.data       → POST /data                  (fetch data, JSON-stat dataset)
 */
export class StatisticsDenmarkAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'statistics-denmark', baseUrl: DK_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    switch (req.toolId) {
      case 'statistics-denmark.subjects':
        return this.buildSubjects(req.params as Record<string, unknown>);
      case 'statistics-denmark.tables':
        return this.buildTables(req.params as Record<string, unknown>);
      case 'statistics-denmark.table_info':
        return this.buildTableInfo(req.params as Record<string, unknown>);
      case 'statistics-denmark.data':
        return this.buildData(req.params as Record<string, unknown>);
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
      case 'statistics-denmark.subjects': {
        const subjects = raw.body as DkSubject[];
        if (!Array.isArray(subjects)) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: 'statistics-denmark.subjects: expected array of subject nodes',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        return subjects;
      }

      case 'statistics-denmark.tables': {
        const tables = raw.body as DkTableListItem[];
        if (!Array.isArray(tables)) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: 'statistics-denmark.tables: expected array of table results',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        return tables.map((t) => ({
          id: t.id,
          text: t.text,
          unit: t.unit ?? null,
          updated: t.updated ?? null,
          first_period: t.firstPeriod ?? null,
          latest_period: t.latestPeriod ?? null,
          variables: t.variables ?? [],
        }));
      }

      case 'statistics-denmark.table_info': {
        const info = raw.body as DkTableInfo;
        if (!info || typeof info !== 'object' || !Array.isArray(info.variables)) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message:
              'statistics-denmark.table_info: expected table object with variables. ' +
              'Check that table_id is a valid StatBank table ID (e.g. "FOLK1A"), obtained from statistics-denmark.tables.',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        return {
          id: info.id,
          text: info.text,
          description: info.description ?? null,
          unit: info.unit ?? null,
          updated: info.updated ?? null,
          variables: info.variables.map((v) => ({
            code: v.id,
            text: v.text,
            time: v.time ?? false,
            elimination: v.elimination ?? false,
            values: v.values ?? [],
          })),
        };
      }

      case 'statistics-denmark.data': {
        const data = raw.body as DkDataResponse;
        if (!data || typeof data !== 'object' || !data.dataset) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: 'statistics-denmark.data: unexpected response — expected a JSON-stat dataset',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        return data.dataset;
      }

      default:
        return raw.body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private dkHeaders(): Record<string, string> {
    return {
      Accept: 'application/json',
      'User-Agent': 'APIbase-Gateway/1.0 (https://apibase.pro)',
    };
  }

  private buildSubjects(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const qs = new URLSearchParams();
    qs.set('lang', 'en');
    if (params.recursive) qs.set('recursive', 'true');
    return {
      url: `${DK_BASE}/subjects?${qs.toString()}`,
      method: 'GET',
      headers: this.dkHeaders(),
    };
  }

  private buildTables(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const qs = new URLSearchParams();
    qs.set('lang', 'en');
    if (params.query) qs.set('query', String(params.query));
    if (params.subjects) qs.set('subjects', String(params.subjects));
    return {
      url: `${DK_BASE}/tables?${qs.toString()}`,
      method: 'GET',
      headers: this.dkHeaders(),
    };
  }

  private buildTableInfo(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const tableId = String(params.table_id ?? '');
    if (!tableId) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'statistics-denmark.table_info: table_id is required',
        provider: this.provider,
        toolId: 'statistics-denmark.table_info',
        durationMs: 0,
      };
    }
    const qs = new URLSearchParams();
    qs.set('id', tableId);
    qs.set('lang', 'en');
    return {
      url: `${DK_BASE}/tableinfo?${qs.toString()}`,
      method: 'GET',
      headers: this.dkHeaders(),
    };
  }

  private buildData(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string;
  } {
    const tableId = String(params.table_id ?? '');
    if (!tableId) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'statistics-denmark.data: table_id is required',
        provider: this.provider,
        toolId: 'statistics-denmark.data',
        durationMs: 0,
      };
    }
    const variables = params.variables as Array<{ code: string; values: string[] }>;
    if (!Array.isArray(variables) || variables.length === 0) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'statistics-denmark.data: variables must be a non-empty array of {code, values}',
        provider: this.provider,
        toolId: 'statistics-denmark.data',
        durationMs: 0,
      };
    }
    return {
      url: `${DK_BASE}/data`,
      method: 'POST',
      headers: {
        ...this.dkHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        table: tableId,
        format: 'JSONSTAT',
        lang: 'en',
        valuePresentation: 'Code',
        variables,
      }),
    };
  }
}
