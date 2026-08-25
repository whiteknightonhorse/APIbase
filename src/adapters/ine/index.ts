import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { IneOperation, IneTable, IneSeriesMetadata, IneSeriesData } from './types';

const INE_BASE = 'https://servicios.ine.es/wstempus/js';

/**
 * INE (Instituto Nacional de Estadística, Spain) Tempus3 adapter (UC-596).
 *
 * Official Spanish national statistics API. No auth, no rate limit documented.
 * `tip=A`/`tip=AM` requests the "friendly" response variant (human-readable
 * labels + ISO dates instead of raw FK_* ids and epoch millis).
 *   ine.operations       -> OPERACIONES_DISPONIBLES, client-side filtered by query
 *   ine.tables           -> TABLAS_OPERACION/{operation_code}
 *   ine.series_metadata  -> SERIE/{series_code}?det=2
 *   ine.series_data      -> DATOS_SERIE/{series_code}
 */
export class IneAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'ine', baseUrl: INE_BASE, maxResponseBytes: 2_000_000 });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'ine.operations':
        return { url: `${INE_BASE}/ES/OPERACIONES_DISPONIBLES`, method: 'GET', headers };

      case 'ine.tables': {
        const operationCode = String(params.operation_code || '').trim();
        if (!operationCode) {
          throw this.invalidInput(req.toolId, 'operation_code is required');
        }
        return {
          url: `${INE_BASE}/ES/TABLAS_OPERACION/${encodeURIComponent(operationCode)}?tip=A`,
          method: 'GET',
          headers,
        };
      }

      case 'ine.series_metadata': {
        const seriesCode = String(params.series_code || '').trim();
        if (!seriesCode) {
          throw this.invalidInput(req.toolId, 'series_code is required');
        }
        return {
          url: `${INE_BASE}/ES/SERIE/${encodeURIComponent(seriesCode)}?det=2&tip=A`,
          method: 'GET',
          headers,
        };
      }

      case 'ine.series_data': {
        const seriesCode = String(params.series_code || '').trim();
        if (!seriesCode) {
          throw this.invalidInput(req.toolId, 'series_code is required');
        }
        const qs = new URLSearchParams();
        qs.set('tip', 'AM');
        if (params.start_date || params.end_date) {
          const start = String(params.start_date || '19000101');
          const end = String(params.end_date || '99991231');
          qs.set('date', `${start}:${end}`);
        } else {
          const lastN = Math.min(Math.max(Number(params.last_n) || 10, 1), 100);
          qs.set('nult', String(lastN));
        }
        return {
          url: `${INE_BASE}/ES/DATOS_SERIE/${encodeURIComponent(seriesCode)}?${qs.toString()}`,
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
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'ine.operations': {
        const operations = raw.body as IneOperation[];
        const query = String(params.query || '')
          .trim()
          .toLowerCase();
        const filtered = query
          ? operations.filter(
              (op) =>
                op.Nombre.toLowerCase().includes(query) || op.Codigo.toLowerCase().includes(query),
            )
          : operations;
        return {
          total: filtered.length,
          operations: filtered.map((op) => ({
            code: op.Codigo,
            name: op.Nombre,
            ioe_code: op.Cod_IOE ?? null,
          })),
        };
      }

      case 'ine.tables': {
        const tables = raw.body as IneTable[];
        return {
          operation_code: params.operation_code,
          total: tables.length,
          tables: tables.map((t) => ({
            id: t.Id,
            code: t.Codigo,
            name: t.Nombre,
            periodicity: t.T3_Periodicidad ?? null,
            publication: t.T3_Publicacion ?? null,
            period_start: t.Anyo_Periodo_ini
              ? `${t.T3_Periodo_ini ?? ''} ${t.Anyo_Periodo_ini}`.trim()
              : null,
            last_modified: t.Ultima_Modificacion ?? null,
          })),
        };
      }

      case 'ine.series_metadata': {
        const s = raw.body as IneSeriesMetadata;
        return {
          series_code: s.COD,
          name: s.Nombre,
          decimals: s.Decimales ?? null,
          operation: s.Operacion?.Nombre ?? null,
          operation_code: s.Operacion?.Codigo ?? null,
          periodicity: s.Periodicidad?.Nombre ?? null,
          publication: s.Publicacion?.Nombre ?? null,
        };
      }

      case 'ine.series_data': {
        const s = raw.body as IneSeriesData;
        return {
          series_code: s.COD,
          name: s.Nombre,
          unit: s.T3_Unidad ?? null,
          data: (s.Data ?? []).map((d) => ({
            date: d.Fecha,
            period: d.T3_Periodo ?? null,
            year: d.Anyo ?? null,
            value: d.Valor,
            provisional: d.T3_TipoDato !== 'Definitivo',
          })),
        };
      }

      default:
        return raw.body;
    }
  }

  private invalidInput(toolId: string, message: string): never {
    throw {
      code: ProviderErrorCode.INPUT_REJECTED,
      httpStatus: 422,
      message,
      provider: this.provider,
      toolId,
      durationMs: 0,
    };
  }
}
