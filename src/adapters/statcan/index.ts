import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  StatCanCubeListItem,
  StatCanCubeMetadata,
  StatCanSeriesInfo,
  StatCanVectorData,
  StatCanApiResponse,
  StatCanTableEntry,
  StatCanSeriesDataOutput,
} from './types';

const API_BASE = 'https://www150.statcan.gc.ca/t1/wds/rest';

// Frequency code → human-readable label
const FREQ_LABELS: Record<number, string> = {
  1: 'occasional',
  2: 'daily',
  6: 'monthly',
  9: 'quarterly',
  11: 'semi-annual',
  12: 'annual',
  13: 'every_2_years',
  14: 'every_3_years',
  15: 'every_4_years',
  16: 'every_5_years',
  17: 'every_10_years',
  18: 'decennial',
  19: 'occasional_2',
  20: 'weekly',
};

function freqLabel(code: number | undefined): string {
  if (!code) return 'unknown';
  return FREQ_LABELS[code] ?? `code_${code}`;
}

function isoDate(raw: string | undefined): string {
  if (!raw) return '';
  return raw.slice(0, 10);
}

/**
 * Statistics Canada Web Data Service (WDS) adapter (UC-539).
 *
 * Provides 5 tools backed by the StatCan WDS REST API at
 * https://www150.statcan.gc.ca/t1/wds/rest
 * No authentication required. Canada Open Licence (COL).
 *
 * Tools:
 *   statcan.catalogue.search  → Search/filter available tables by keyword
 *   statcan.table.metadata    → Full metadata for a table (productId)
 *   statcan.series.info       → Series info from a vector ID
 *   statcan.series.data       → Latest N data points for a vector
 *   statcan.table.data        → Data from table by productId + coordinate
 */
export class StatCanAdapter extends BaseAdapter {
  // Cached cube list (populated on first catalogue.search call)
  private cubeList: StatCanCubeListItem[] | null = null;

  constructor() {
    super({ provider: 'statcan', baseUrl: API_BASE, maxResponseBytes: 8_000_000 });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const p = req.params as Record<string, unknown>;
    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    switch (req.toolId) {
      case 'statcan.catalogue_search': {
        // Catalogue search fetches the full list and filters client-side.
        // No path params — the URL is always getAllCubesListLite.
        return { url: `${API_BASE}/getAllCubesListLite`, method: 'GET', headers };
      }

      case 'statcan.table_metadata': {
        const productId = Number(p.product_id ?? p.productId ?? 0);
        return {
          url: `${API_BASE}/getCubeMetadata`,
          method: 'POST',
          headers,
          body: JSON.stringify([{ productId }]),
        };
      }

      case 'statcan.series_info': {
        const vectorId = Number(p.vector_id ?? p.vectorId ?? 0);
        return {
          url: `${API_BASE}/getSeriesInfoFromVector`,
          method: 'POST',
          headers,
          body: JSON.stringify([{ vectorId }]),
        };
      }

      case 'statcan.series_data': {
        const vectorId = Number(p.vector_id ?? p.vectorId ?? 0);
        const latestN = Math.min(Number(p.latest_n ?? p.latestN ?? 10), 100);
        return {
          url: `${API_BASE}/getDataFromVectorsAndLatestNPeriods`,
          method: 'POST',
          headers,
          body: JSON.stringify([{ vectorId, latestN }]),
        };
      }

      case 'statcan.table_data': {
        const productId = Number(p.product_id ?? p.productId ?? 0);
        const coordinate = String(p.coordinate ?? '');
        const latestN = Math.min(Number(p.latest_n ?? p.latestN ?? 10), 100);
        return {
          url: `${API_BASE}/getDataFromCubePidCoordAndLatestNPeriods/${productId}/${encodeURIComponent(coordinate)}/${latestN}`,
          method: 'GET',
          headers,
        };
      }

      default:
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 502,
          message: `Unsupported StatCan tool: ${req.toolId}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
        };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const p = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'statcan.catalogue_search': {
        const body = raw.body as StatCanCubeListItem[];
        this.cubeList = body;

        const query = String(p.query ?? '').toLowerCase();
        const subjectFilter = p.subject_code ? String(p.subject_code) : undefined;
        const archivedOnly = p.archived === true || p.archived === 'true';
        const activeOnly = !archivedOnly && p.archived !== 'all';
        const limit = Math.min(Number(p.limit ?? 20), 100);

        let results = body;

        if (query) {
          results = results.filter((c) => c.cubeTitleEn.toLowerCase().includes(query));
        }
        if (subjectFilter) {
          results = results.filter((c) => c.subjectCode?.includes(subjectFilter));
        }
        if (activeOnly) {
          results = results.filter((c) => c.archived === '0' || c.archived === undefined);
        } else if (archivedOnly) {
          results = results.filter((c) => c.archived === '1');
        }

        const tables: StatCanTableEntry[] = results.slice(0, limit).map((c) => ({
          product_id: c.productId,
          cansim_id: c.cansimId ?? '',
          title: c.cubeTitleEn,
          start_date: isoDate(c.cubeStartDate),
          end_date: isoDate(c.cubeEndDate),
          archived: c.archived === '1',
          frequency: freqLabel(c.frequencyCode),
          subjects: c.subjectCode ?? [],
        }));

        return {
          query: query || null,
          total_available: body.length,
          total_matched: results.length,
          returned: tables.length,
          tables,
        };
      }

      case 'statcan.table_metadata': {
        const body = raw.body as StatCanApiResponse<StatCanCubeMetadata>[];
        const item = body[0];
        if (!item || item.status !== 'SUCCESS') {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: `StatCan metadata error: ${item?.status ?? 'no response'}`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        const meta = item.object;
        return {
          product_id: meta.productId,
          cansim_id: meta.cansimId ?? '',
          title: meta.cubeTitleEn,
          start_date: isoDate(meta.cubeStartDate),
          end_date: isoDate(meta.cubeEndDate),
          release_time: meta.releaseTime ?? '',
          archived: meta.archived === '1',
          frequency: freqLabel(meta.frequencyCode),
          subjects: meta.subjectCode ?? [],
          surveys: meta.surveyCode ?? [],
          dimensions: (meta.dimension ?? []).map((d) => ({
            position: d.dimensionPositionId,
            name: d.dimensionNameEn ?? '',
            has_uom: d.hasUom === 1,
            members: (d.member ?? []).slice(0, 50).map((m) => ({
              id: m.memberId,
              name: m.memberNameEn ?? '',
              parent_id: m.parentMemberId?.[0] ?? null,
              terminated: m.terminated === 1,
            })),
          })),
        };
      }

      case 'statcan.series_info': {
        const body = raw.body as StatCanApiResponse<StatCanSeriesInfo>[];
        const item = body[0];
        if (!item || item.status !== 'SUCCESS') {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: `StatCan series info error: ${item?.status ?? 'no response'}`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        const info = item.object;
        return {
          vector_id: info.vectorId,
          product_id: info.productId,
          coordinate: info.coordinate ?? '',
          title: info.SeriesTitleEn ?? '',
          frequency: freqLabel(info.frequencyCode),
          decimals: info.decimals ?? 0,
          terminated: info.terminated === 1,
        };
      }

      case 'statcan.series_data': {
        const body = raw.body as StatCanApiResponse<StatCanVectorData>[];
        const item = body[0];
        if (!item || item.status !== 'SUCCESS') {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: `StatCan series data error: ${item?.status ?? 'no response'}`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        const vdata = item.object;
        const obs = (vdata.vectorDataPoint ?? []).map((dp) => ({
          ref_period: dp.refPer,
          value: dp.value,
          release_time: dp.releaseTime ?? undefined,
        }));
        const result: StatCanSeriesDataOutput = {
          vector_id: vdata.vectorId,
          product_id: vdata.productId ?? 0,
          coordinate: vdata.coordinate ?? '',
          title: '',
          observations: obs,
          periods_returned: obs.length,
        };
        return result;
      }

      case 'statcan.table_data': {
        const body = raw.body as StatCanApiResponse<StatCanVectorData>[];
        const item = body[0];
        if (!item || item.status !== 'SUCCESS') {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: `StatCan table data error: ${item?.status ?? 'no response'}`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        const vdata = item.object;
        const obs = (vdata.vectorDataPoint ?? []).map((dp) => ({
          ref_period: dp.refPer,
          value: dp.value,
          release_time: dp.releaseTime ?? undefined,
        }));
        return {
          vector_id: vdata.vectorId,
          product_id: vdata.productId ?? 0,
          coordinate: vdata.coordinate ?? '',
          observations: obs,
          periods_returned: obs.length,
        };
      }

      default:
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 502,
          message: `Unsupported StatCan tool: ${req.toolId}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
        };
    }
  }
}
