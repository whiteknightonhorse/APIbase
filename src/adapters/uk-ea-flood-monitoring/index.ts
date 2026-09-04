import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  FloodMonitoringFloodsResponse,
  FloodMonitoringStationsResponse,
  FloodMonitoringReadingsResponse,
  FloodMonitoringMeasureRef,
} from './types';

const FLOOD_MONITORING_BASE = 'https://environment.data.gov.uk/flood-monitoring';

function firstLabel(label: string | string[] | undefined): string | null {
  if (!label) return null;
  return Array.isArray(label) ? (label[0] ?? null) : label;
}

function toArray<T>(v: T | T[] | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

/**
 * UK Environment Agency Real Time Flood Monitoring API adapter (UC-683).
 *
 * Public, no-auth flood warning/alert + river-level monitoring network for
 * England (environment.data.gov.uk/flood-monitoring, OGL v3.0). Sibling of
 * ea-hydrology (UC-654) — same publisher/licence, different dataset (live
 * flood warnings + station water levels vs. hydrology archive series).
 *   uk-ea-flood-monitoring.current_warnings -> GET /id/floods.json?min-severity=&county=&lat=&long=&dist=
 *   uk-ea-flood-monitoring.station_search    -> GET /id/stations.json?town=&riverName=&catchmentName=&parameter=&search=&_limit=
 *   uk-ea-flood-monitoring.station_readings  -> GET /id/stations/{id}/readings.json?latest
 *
 * severityLevel is 1 (Severe Flood Warning, danger to life) through 4 (Warning
 * no longer in force) — lower number = more severe. min-severity filters to
 * "this severity or more severe" (i.e. <= the given level).
 */
export class UkEaFloodMonitoringAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'uk-ea-flood-monitoring',
      baseUrl: FLOOD_MONITORING_BASE,
      maxResponseBytes: 1_000_000,
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'uk-ea-flood-monitoring.current_warnings': {
        const qs = new URLSearchParams();
        const minSeverity = Number(params.min_severity);
        if (Number.isFinite(minSeverity) && minSeverity >= 1 && minSeverity <= 4) {
          qs.set('min-severity', String(minSeverity));
        }
        const county = String(params.county || '').trim();
        if (county) qs.set('county', county);
        const lat = Number(params.lat);
        const long = Number(params.long);
        const dist = Number(params.dist);
        if (Number.isFinite(lat) && Number.isFinite(long) && Number.isFinite(dist)) {
          qs.set('lat', String(lat));
          qs.set('long', String(long));
          qs.set('dist', String(dist));
        }
        const qsStr = qs.toString();
        return {
          url: `${FLOOD_MONITORING_BASE}/id/floods.json${qsStr ? `?${qsStr}` : ''}`,
          method: 'GET',
          headers: { Accept: 'application/json' },
        };
      }

      case 'uk-ea-flood-monitoring.station_search': {
        const qs = new URLSearchParams();
        const town = String(params.town || '').trim();
        const riverName = String(params.river_name || '').trim();
        const catchmentName = String(params.catchment_name || '').trim();
        const parameter = String(params.parameter || '').trim();
        const search = String(params.search || '').trim();
        if (town) qs.set('town', town);
        if (riverName) qs.set('riverName', riverName);
        if (catchmentName) qs.set('catchmentName', catchmentName);
        if (parameter) qs.set('parameter', parameter);
        if (search) qs.set('search', search);
        const limit = Math.min(Math.max(Number(params.limit) || 20, 1), 200);
        qs.set('_limit', String(limit));
        return {
          url: `${FLOOD_MONITORING_BASE}/id/stations.json?${qs.toString()}`,
          method: 'GET',
          headers: { Accept: 'application/json' },
        };
      }

      case 'uk-ea-flood-monitoring.station_readings': {
        const stationId = String(params.station_id || '').trim();
        if (!stationId) {
          throw this.invalidInput(req.toolId, 'station_id is required');
        }
        return {
          url: `${FLOOD_MONITORING_BASE}/id/stations/${encodeURIComponent(stationId)}/readings.json?latest`,
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
      case 'uk-ea-flood-monitoring.current_warnings': {
        const msg = raw.body as FloodMonitoringFloodsResponse;
        const items = msg.items ?? [];
        return {
          returned: items.length,
          warnings: items.map((f) => ({
            flood_area_id: f.floodAreaID ?? null,
            description: f.description ?? null,
            severity: f.severity ?? null,
            severity_level: f.severityLevel ?? null,
            is_tidal: f.isTidal ?? null,
            county: f.floodArea?.county ?? null,
            river_or_sea: f.floodArea?.riverOrSea ?? null,
            ea_area_name: f.eaAreaName ?? null,
            message: f.message ?? null,
            time_raised: f.timeRaised ?? null,
            time_severity_changed: f.timeSeverityChanged ?? null,
          })),
        };
      }

      case 'uk-ea-flood-monitoring.station_search': {
        const msg = raw.body as FloodMonitoringStationsResponse;
        const items = msg.items ?? [];
        return {
          returned: items.length,
          stations: items.map((s) => ({
            station_id: s.notation,
            label: firstLabel(s.label),
            river_name: s.riverName ?? null,
            catchment_name: s.catchmentName ?? null,
            town: s.town ?? null,
            lat: s.lat ?? null,
            long: s.long ?? null,
            rloi_id: s.RLOIid ?? null,
            wiski_id: s.wiskiID ?? null,
            date_opened: s.dateOpened ?? null,
            status: s.status ?? null,
            measures: toArray<FloodMonitoringMeasureRef>(s.measures).map((m) => ({
              parameter: m.parameter ?? null,
              parameter_name: m.parameterName ?? null,
              qualifier: m.qualifier ?? null,
              period_seconds: m.period ?? null,
              unit: m.unitName ?? null,
            })),
          })),
        };
      }

      case 'uk-ea-flood-monitoring.station_readings': {
        const msg = raw.body as FloodMonitoringReadingsResponse;
        const items = msg.items ?? [];
        return {
          station_id: (req.params as Record<string, unknown>).station_id,
          returned: items.length,
          readings: items.map((r) => ({
            measure_id: r.measure.split('/').pop() ?? r.measure,
            date_time: r.dateTime ?? null,
            value: r.value,
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
