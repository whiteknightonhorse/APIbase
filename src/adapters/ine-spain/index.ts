import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  type ProviderError,
  ProviderErrorCode,
} from '../../types/provider';
import type { IneOperacion, IneTabla, IneSerieDatos, IneTablaDatos } from './types';

const INE_SPAIN_BASE = 'https://servicios.ine.es/wstempus/js';

/**
 * INE Spain (Instituto Nacional de Estadística) Tempus3 API adapter (UC-663).
 *
 * Spain's official statistics office publishes its full time-series catalog as a
 * public, no-auth JSON REST API (servicios.ine.es/wstempus/js) — no registration
 * required. Structure: statistical operation (e.g. IPC = Consumer Price Index) ->
 * published tables -> individual series -> data points.
 *   ine-spain.operations   -> GET /{lang}/OPERACIONES_DISPONIBLES
 *   ine-spain.tables       -> GET /{lang}/TABLAS_OPERACION/{operation_code}
 *   ine-spain.table_data   -> GET /{lang}/DATOS_TABLA/{table_id}?nult=N
 *   ine-spain.series_data  -> GET /{lang}/DATOS_SERIE/{series_code}?nult=N&det=2
 *
 * QUIRK: an unrecognized operation code returns HTTP 200 with an EMPTY body (not an
 * error) — TABLAS_OPERACION/series_code lookups against a bad operation code would
 * otherwise surface as a confusing "invalid JSON" 502. Since the operation-code set
 * is small (109) and rarely changes, ine-spain.tables enum-constrains it in the Zod
 * schema so this can never happen for that tool. table_id is validated for free —
 * an unknown table_id returns a genuine HTTP 404, correctly classified by
 * base.adapter.ts as INPUT_REJECTED/422. series_code has no closed set (100,000+
 * dynamically generated codes) so it is NOT enum-constrained; an unrecognized code
 * still returns an empty 200 body, which base.adapter.ts's JSON.parse('') failure
 * surfaces as INVALID_RESPONSE/502 — documented, not fixable without a base.adapter
 * change (out of scope, see CLAUDE.md §0).
 *
 * QUIRK: DATOS_TABLA has no server-side cap on series count per table — some tables
 * (e.g. EPA labour-force tables) bundle 200+ series. `periods` is capped to 1-6 in
 * the Zod schema to keep worst-case response size bounded; use ine-spain.series_data
 * for a longer single-series history (up to 100 periods).
 */
export class IneSpainAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'ine-spain', baseUrl: INE_SPAIN_BASE, maxResponseBytes: 2_000_000 });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };
    const lang = params.lang === 'EN' ? 'EN' : 'ES';

    switch (req.toolId) {
      case 'ine-spain.operations': {
        return {
          url: `${INE_SPAIN_BASE}/${lang}/OPERACIONES_DISPONIBLES`,
          method: 'GET',
          headers,
        };
      }

      case 'ine-spain.tables': {
        const operationCode = String(params.operation_code ?? '').trim();
        return {
          url: `${INE_SPAIN_BASE}/${lang}/TABLAS_OPERACION/${encodeURIComponent(operationCode)}`,
          method: 'GET',
          headers,
        };
      }

      case 'ine-spain.table_data': {
        const tableId = String(params.table_id ?? '').trim();
        const periods = Math.min(6, Math.max(1, Number(params.periods) || 1));
        const qs = new URLSearchParams({ nult: String(periods) });
        return {
          url: `${INE_SPAIN_BASE}/${lang}/DATOS_TABLA/${encodeURIComponent(tableId)}?${qs}`,
          method: 'GET',
          headers,
        };
      }

      case 'ine-spain.series_data': {
        const seriesCode = String(params.series_code ?? '').trim();
        const periods = Math.min(100, Math.max(1, Number(params.periods) || 12));
        const qs = new URLSearchParams({ nult: String(periods), det: '2' });
        return {
          url: `${INE_SPAIN_BASE}/${lang}/DATOS_SERIE/${encodeURIComponent(seriesCode)}?${qs}`,
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
        } satisfies ProviderError;
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    switch (req.toolId) {
      case 'ine-spain.operations': {
        const body = (raw.body as IneOperacion[]) ?? [];
        const params = req.params as Record<string, unknown>;
        const search =
          params.search !== undefined ? String(params.search).trim().toLowerCase() : '';
        const filtered = search
          ? body.filter((o) => o.Nombre.toLowerCase().includes(search))
          : body;
        return {
          total: filtered.length,
          operations: filtered.map((o) => ({
            operation_code: o.Codigo,
            ioe_code: o.Cod_IOE,
            name: o.Nombre.trim(),
          })),
        };
      }

      case 'ine-spain.tables': {
        const body = (raw.body as IneTabla[]) ?? [];
        return {
          total: body.length,
          tables: body.map((t) => ({
            table_id: t.Id,
            name: t.Nombre.trim(),
            geo_scope: t.Codigo ?? null,
            period_start_year: t.Anyo_Periodo_ini ?? null,
            period_end_year: t.Anyo_Periodo_fin ?? null,
            last_modified: t.Ultima_Modificacion
              ? new Date(t.Ultima_Modificacion).toISOString()
              : null,
          })),
        };
      }

      case 'ine-spain.table_data': {
        const body = (raw.body as IneTablaDatos) ?? [];
        return {
          series_count: body.length,
          series: body.map((s) => this.formatSeries(s)),
        };
      }

      case 'ine-spain.series_data': {
        const body = raw.body as IneSerieDatos;
        return this.formatSeries(body);
      }

      default:
        return raw.body;
    }
  }

  private formatSeries(s: IneSerieDatos): Record<string, unknown> {
    return {
      series_code: s.COD,
      name: s.Nombre?.trim() ?? '',
      unit: s.Unidad?.Nombre ?? null,
      data: (s.Data ?? []).map((d) => ({
        year: d.Anyo,
        period: 'Periodo' in d ? d.Periodo.Nombre_largo : d.FK_Periodo,
        period_code: 'CodigoPeriodo' in d ? d.CodigoPeriodo : null,
        value: d.Valor,
        provisional: 'TipoDato' in d ? d.TipoDato.Codigo !== 'D' : d.FK_TipoDato !== 1,
        confidential: d.Secreto,
      })),
    };
  }
}
