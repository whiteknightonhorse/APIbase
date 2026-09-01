import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  EaHydrologyStationsResponse,
  EaHydrologyMeasuresResponse,
  EaHydrologyReadingsResponse,
} from './types';

const EA_HYDROLOGY_BASE = 'https://environment.data.gov.uk/hydrology';

/**
 * Environment Agency Hydrology API adapter (UC-654).
 *
 * Public, no-auth UK river/groundwater/rainfall monitoring network
 * (environment.data.gov.uk/hydrology, OGL v3.0). Three-step drill-down like
 * bank-of-england/oecd-data: search stations -> list a station's measures ->
 * fetch readings for one measure.
 *   ea-hydrology.station_search  -> GET /id/stations.json?riverName=&search=&observedProperty=&_limit=
 *   ea-hydrology.station_measures -> GET /id/measures.json?station=&parameter=
 *   ea-hydrology.readings_latest -> GET /id/measures/{measure}/readings.json?latest&_limit=1
 *   ea-hydrology.readings_range  -> GET /id/measures/{measure}/readings.json?min-date=&max-date=&_limit=
 *
 * Invalid station/measure IDs return HTTP 200 with an empty `items` array
 * (silent-empty, same class as world-bank-cckp/bank-of-england) rather than
 * a 404 — callers must obtain valid IDs from station_search/station_measures
 * first. The upstream `parameter` filter on /id/measures.json is
 * case-sensitive: 'flow' | 'level' | 'rainfall' lowercase but 'TEMPERATURE'
 * uppercase — confirmed live, not a typo.
 */
export class EaHydrologyAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'ea-hydrology', baseUrl: EA_HYDROLOGY_BASE, maxResponseBytes: 1_000_000 });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'ea-hydrology.station_search': {
        const qs = new URLSearchParams();
        const riverName = String(params.river_name || '').trim();
        const search = String(params.search || '').trim();
        const observedProperty = String(params.observed_property || '').trim();
        if (riverName) qs.set('riverName', riverName);
        if (search) qs.set('search', search);
        if (observedProperty) qs.set('observedProperty', observedProperty);
        const limit = Math.min(Math.max(Number(params.limit) || 20, 1), 200);
        qs.set('_limit', String(limit));
        return {
          url: `${EA_HYDROLOGY_BASE}/id/stations.json?${qs.toString()}`,
          method: 'GET',
          headers: { Accept: 'application/json' },
        };
      }

      case 'ea-hydrology.station_measures': {
        const stationId = String(params.station_id || '').trim();
        if (!stationId) {
          throw this.invalidInput(req.toolId, 'station_id is required');
        }
        const qs = new URLSearchParams();
        qs.set('station', stationId);
        const parameter = String(params.parameter || '').trim();
        if (parameter) qs.set('parameter', parameter);
        return {
          url: `${EA_HYDROLOGY_BASE}/id/measures.json?${qs.toString()}`,
          method: 'GET',
          headers: { Accept: 'application/json' },
        };
      }

      case 'ea-hydrology.readings_latest': {
        const measureId = String(params.measure_id || '').trim();
        if (!measureId) {
          throw this.invalidInput(req.toolId, 'measure_id is required');
        }
        return {
          url: `${EA_HYDROLOGY_BASE}/id/measures/${encodeURIComponent(measureId)}/readings.json?latest&_limit=1`,
          method: 'GET',
          headers: { Accept: 'application/json' },
        };
      }

      case 'ea-hydrology.readings_range': {
        const measureId = String(params.measure_id || '').trim();
        const minDate = String(params.min_date || '').trim();
        const maxDate = String(params.max_date || '').trim();
        if (!measureId || !minDate || !maxDate) {
          throw this.invalidInput(req.toolId, 'measure_id, min_date, and max_date are required');
        }
        const qs = new URLSearchParams();
        qs.set('min-date', minDate);
        qs.set('max-date', maxDate);
        const limit = Math.min(Math.max(Number(params.limit) || 500, 1), 2000);
        qs.set('_limit', String(limit));
        return {
          url: `${EA_HYDROLOGY_BASE}/id/measures/${encodeURIComponent(measureId)}/readings.json?${qs.toString()}`,
          method: 'GET',
          headers: { Accept: 'application/json' },
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
    switch (req.toolId) {
      case 'ea-hydrology.station_search': {
        const msg = raw.body as EaHydrologyStationsResponse;
        const items = msg.items ?? [];
        return {
          returned: items.length,
          stations: items.map((s) => ({
            station_id: s.notation,
            label: s.label,
            river_name: s.riverName ?? null,
            catchment_name: s.catchmentName ?? null,
            lat: s.lat ?? null,
            long: s.long ?? null,
            wiski_id: s.wiskiID ?? null,
            date_opened: s.dateOpened ?? null,
            status: Array.isArray(s.status) ? s.status[0]?.label : (s.status?.label ?? null),
            observed_properties: (Array.isArray(s.observedProperty)
              ? s.observedProperty
              : s.observedProperty
                ? [s.observedProperty]
                : []
            ).map((p) => p['@id'].split('/').pop()),
            measure_count: s.measures?.length ?? 0,
          })),
        };
      }

      case 'ea-hydrology.station_measures': {
        const msg = raw.body as EaHydrologyMeasuresResponse;
        const items = msg.items ?? [];
        return {
          station_id: (req.params as Record<string, unknown>).station_id,
          returned: items.length,
          measures: items.map((m) => ({
            measure_id: m.notation,
            label: m.label ?? null,
            parameter: m.parameter ?? null,
            period_seconds: m.period ?? null,
            period_name: m.periodName ?? null,
            value_type: m.valueType ?? null,
            unit: m.unitName ?? null,
          })),
        };
      }

      case 'ea-hydrology.readings_latest': {
        const msg = raw.body as EaHydrologyReadingsResponse;
        const reading = msg.items?.[0] ?? null;
        return {
          measure_id: (req.params as Record<string, unknown>).measure_id,
          reading: reading
            ? {
                date: reading.date ?? null,
                date_time: reading.dateTime ?? null,
                value: reading.value,
                quality: reading.quality ?? null,
              }
            : null,
        };
      }

      case 'ea-hydrology.readings_range': {
        const msg = raw.body as EaHydrologyReadingsResponse;
        const items = msg.items ?? [];
        return {
          measure_id: (req.params as Record<string, unknown>).measure_id,
          returned: items.length,
          readings: items.map((r) => ({
            date: r.date ?? null,
            date_time: r.dateTime ?? null,
            value: r.value,
            quality: r.quality ?? null,
            completeness: r.completeness ?? null,
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
