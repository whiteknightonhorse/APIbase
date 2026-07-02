import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  DbnomicsProvidersResponse,
  DbnomicsDatasetsResponse,
  DbnomicsSeriesResponse,
  DbnomicsSeries,
} from './types';

const BASE = 'https://api.db.nomics.world/v22';

/**
 * DBnomics adapter (UC-572) — unified gateway to 93+ statistical agencies.
 * Covers IMF, World Bank, OECD, Eurostat, ECB, BIS, and more.
 * CC-BY 4.0 / open data; no auth required.
 * https://api.db.nomics.world/v22
 */
export class DbnomicsAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'dbnomics', baseUrl: BASE });
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'dbnomics.providers': {
        const qs = new URLSearchParams();
        const limit = Math.min(200, Math.max(1, Number(p.limit ?? 100)));
        const offset = Math.max(0, Number(p.offset ?? 0));
        qs.set('limit', String(limit));
        qs.set('offset', String(offset));
        return { url: `${BASE}/providers?${qs.toString()}`, method: 'GET', headers };
      }

      case 'dbnomics.datasets': {
        const providerCode = encodeURIComponent(String(p.provider_code));
        const qs = new URLSearchParams();
        const limit = Math.min(200, Math.max(1, Number(p.limit ?? 50)));
        const offset = Math.max(0, Number(p.offset ?? 0));
        qs.set('limit', String(limit));
        qs.set('offset', String(offset));
        return {
          url: `${BASE}/datasets/${providerCode}?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'dbnomics.series': {
        const providerCode = encodeURIComponent(String(p.provider_code));
        const datasetCode = encodeURIComponent(String(p.dataset_code));
        const qs = new URLSearchParams();
        const limit = Math.min(200, Math.max(1, Number(p.limit ?? 50)));
        const offset = Math.max(0, Number(p.offset ?? 0));
        qs.set('limit', String(limit));
        qs.set('offset', String(offset));
        return {
          url: `${BASE}/series/${providerCode}/${datasetCode}?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'dbnomics.fetch_series': {
        const providerCode = encodeURIComponent(String(p.provider_code));
        const datasetCode = encodeURIComponent(String(p.dataset_code));
        const seriesCode = encodeURIComponent(String(p.series_code));
        const qs = new URLSearchParams({ observations: 'true' });
        const lastN = Number(p.last_n_periods ?? 0);
        if (lastN > 0) qs.set('limit', String(lastN));
        return {
          url: `${BASE}/series/${providerCode}/${datasetCode}/${seriesCode}?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }

      default:
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 502,
          message: `Unsupported toolId: ${req.toolId}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
        };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const p = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'dbnomics.providers': {
        const body = raw.body as DbnomicsProvidersResponse;
        const docs = body.providers?.docs ?? [];
        return {
          total: body.providers?.num_found ?? docs.length,
          returned: docs.length,
          nb_datasets: body.nb_datasets,
          nb_series: body.nb_series,
          providers: docs.map((p) => ({
            code: p.code,
            name: p.name,
            region: p.region,
            website: p.website,
          })),
        };
      }

      case 'dbnomics.datasets': {
        const body = raw.body as DbnomicsDatasetsResponse;
        const docs = body.datasets?.docs ?? [];
        return {
          provider_code: String(p.provider_code),
          total: body.datasets?.num_found ?? docs.length,
          returned: docs.length,
          datasets: docs.map((d) => ({
            code: d.code,
            name: d.name,
            nb_series: d.nb_series,
          })),
        };
      }

      case 'dbnomics.series': {
        const body = raw.body as DbnomicsSeriesResponse;
        const docs = body.series?.docs ?? [];
        return {
          provider_code: String(p.provider_code),
          dataset_code: String(p.dataset_code),
          total: body.series?.num_found ?? docs.length,
          returned: docs.length,
          series: docs.map((s) => ({
            series_code: s.series_code,
            series_name: s.series_name,
            frequency: s['@frequency'],
            dimensions: s.dimensions,
          })),
        };
      }

      case 'dbnomics.fetch_series': {
        const body = raw.body as DbnomicsSeriesResponse;
        const docs = body.series?.docs ?? [];
        if (!docs.length) {
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message: `Series '${p.provider_code}/${p.dataset_code}/${p.series_code}' not found`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        const s: DbnomicsSeries = docs[0];
        const periods = s.period ?? [];
        const values = s.value ?? [];
        const lastN = Number(p.last_n_periods ?? 0);
        const slice = lastN > 0 ? periods.length - lastN : 0;
        const trimPeriods = lastN > 0 ? periods.slice(slice) : periods;
        const trimValues = lastN > 0 ? values.slice(slice) : values;
        // Build paired observations, filtering NA
        const observations = trimPeriods.map((period, i) => ({
          period,
          value: trimValues[i] === 'NA' ? null : (trimValues[i] as number | null),
        }));
        return {
          provider_code: s.provider_code,
          dataset_code: s.dataset_code,
          series_code: s.series_code,
          series_name: s.series_name,
          frequency: s['@frequency'],
          dimensions: s.dimensions,
          total_periods: periods.length,
          returned_periods: observations.length,
          observations,
        };
      }

      default:
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 502,
          message: `Unsupported toolId: ${req.toolId}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: raw.durationMs,
        };
    }
  }
}
