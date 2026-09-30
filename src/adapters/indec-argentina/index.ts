import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { SeriesDataResponse, SeriesSearchResponse } from './types';

const SERIES_BASE = 'https://apis.datos.gob.ar/series/api';

const VALID_COLLAPSE = new Set(['day', 'month', 'quarter', 'semester', 'year']);
const VALID_AGGREGATION = new Set(['avg', 'sum', 'end_of_period', 'min', 'max']);

/**
 * Argentina Government Series de Tiempo adapter (UC-776).
 *
 * Official Argentine open-data API for economic and social statistics time
 * series (published by Subsecretaría de Programación Macroeconómica /
 * datos.gob.ar; INDEC is the primary contributing source for employment,
 * prices, and national accounts series). Published at apis.datos.gob.ar — no
 * auth, no documented rate limit.
 *   indec-argentina.search_series -> GET /search?q=
 *   indec-argentina.get_series    -> GET /series?ids=&start_date=&end_date=&collapse=&collapse_aggregation=&limit=
 */
export class IndecArgentinaAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'indec-argentina', baseUrl: SERIES_BASE, timeoutMs: 15_000 });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'indec-argentina.search_series': {
        const query = String(params.query || '').trim();
        if (!query) throw this.invalidInput(req.toolId, 'query is required');
        const limit = Math.min(Math.max(Number(params.limit) || 10, 1), 50);
        const qs = new URLSearchParams({ q: query, limit: String(limit) });
        return { url: `${SERIES_BASE}/search/?${qs.toString()}`, method: 'GET', headers };
      }

      case 'indec-argentina.get_series': {
        const seriesId = String(params.series_id || '').trim();
        if (!seriesId) throw this.invalidInput(req.toolId, 'series_id is required');
        const ids = seriesId
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
          .slice(0, 5);
        if (ids.length === 0) throw this.invalidInput(req.toolId, 'series_id is required');

        const limit = Math.min(Math.max(Number(params.limit) || 100, 1), 1000);
        const qs = new URLSearchParams({ ids: ids.join(','), limit: String(limit) });

        const startDate = String(params.start_date || '').trim();
        if (startDate) qs.set('start_date', startDate);
        const endDate = String(params.end_date || '').trim();
        if (endDate) qs.set('end_date', endDate);

        const collapse = String(params.collapse || '').trim();
        if (collapse) {
          if (!VALID_COLLAPSE.has(collapse)) {
            throw this.invalidInput(
              req.toolId,
              `collapse must be one of: ${Array.from(VALID_COLLAPSE).join(', ')}`,
            );
          }
          qs.set('collapse', collapse);
        }

        const collapseAggregation = String(params.collapse_aggregation || '').trim();
        if (collapseAggregation) {
          if (!VALID_AGGREGATION.has(collapseAggregation)) {
            throw this.invalidInput(
              req.toolId,
              `collapse_aggregation must be one of: ${Array.from(VALID_AGGREGATION).join(', ')}`,
            );
          }
          qs.set('collapse_aggregation', collapseAggregation);
        }

        return { url: `${SERIES_BASE}/series/?${qs.toString()}`, method: 'GET', headers };
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
    switch (req.toolId) {
      case 'indec-argentina.search_series': {
        const body = raw.body as SeriesSearchResponse;
        return {
          count: body.count,
          results: (body.data ?? []).map((r) => ({
            series_id: r.field.id,
            title: r.field.title ?? null,
            description: r.field.description ?? null,
            frequency: r.field.frequency ?? null,
            units: r.field.units ?? null,
            start_date: r.field.time_index_start ?? null,
            end_date: r.field.time_index_end ?? null,
            dataset: r.dataset?.title ?? null,
            source: r.dataset?.source ?? null,
          })),
        };
      }

      case 'indec-argentina.get_series': {
        const body = raw.body as SeriesDataResponse;
        if (body.errors && body.errors.length > 0) {
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message: body.errors.map((e) => e.error).join('; '),
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        const rangeMeta = body.meta?.[0];
        const seriesMeta = (body.meta?.slice(1) ?? []) as Array<{
          field?: { id: string; description?: string; units?: string };
          dataset?: { title?: string; source?: string };
        }>;
        return {
          count: body.count,
          frequency: rangeMeta?.frequency ?? null,
          start_date: rangeMeta?.start_date ?? null,
          end_date: rangeMeta?.end_date ?? null,
          series: seriesMeta.map((m) => ({
            series_id: m.field?.id ?? null,
            description: m.field?.description ?? null,
            units: m.field?.units ?? null,
            dataset: m.dataset?.title ?? null,
            source: m.dataset?.source ?? null,
          })),
          data: body.data ?? [],
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
