import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  SmhiForecastResponse,
  SmhiFireResponse,
  SmhiWarning,
  SmhiObservationResponse,
} from './types';

const FORECAST_BASE = 'https://opendata-download-metfcst.smhi.se';
const WARNINGS_BASE = 'https://opendata-download-warnings.smhi.se';
const METOBS_BASE = 'https://opendata-download-metobs.smhi.se/api/version/1.0';

const SMHI_HEADERS: Record<string, string> = {
  Accept: 'application/json',
  'User-Agent': '(apibase.pro, support@apibase.pro)',
};

/**
 * SMHI Open Data adapter (UC-573).
 *
 * Swedish Meteorological and Hydrological Institute — open data CC BY 4.0.
 * No auth required.
 *
 * Tools:
 *   smhi.forecast     → GET snow1g point forecast (82-step hourly, ~10 days)
 *   smhi.fire_risk    → GET fwif1g fire weather index (7-day daily)
 *   smhi.warnings     → GET ibww active warnings for Sweden
 *   smhi.observations → GET metobs latest-hour at a specific station
 */
export class SmhiAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'smhi',
      baseUrl: FORECAST_BASE,
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const p = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'smhi.forecast': {
        const lon = encodeURIComponent(String(p.longitude));
        const lat = encodeURIComponent(String(p.latitude));
        return {
          url: `${FORECAST_BASE}/api/category/snow1g/version/1/geotype/point/lon/${lon}/lat/${lat}/data.json`,
          method: 'GET',
          headers: SMHI_HEADERS,
        };
      }

      case 'smhi.fire_risk': {
        const lon = encodeURIComponent(String(p.longitude));
        const lat = encodeURIComponent(String(p.latitude));
        const period = String(p.period ?? 'daily');
        const safePeriod = period === 'hourly' ? 'hourly' : 'daily';
        return {
          url: `${FORECAST_BASE}/api/category/fwif1g/version/1/${safePeriod}/geotype/point/lon/${lon}/lat/${lat}/data.json`,
          method: 'GET',
          headers: SMHI_HEADERS,
        };
      }

      case 'smhi.warnings': {
        return {
          url: `${WARNINGS_BASE}/ibww/api/version/1/warning.json`,
          method: 'GET',
          headers: SMHI_HEADERS,
        };
      }

      case 'smhi.observations': {
        const paramId = encodeURIComponent(String(p.parameter_id ?? '1'));
        const stationId = encodeURIComponent(String(p.station_id));
        const period = String(p.period ?? 'latest-day');
        const validPeriods = ['latest-hour', 'latest-day', 'latest-months'];
        const safePeriod = validPeriods.includes(period) ? period : 'latest-day';
        return {
          url: `${METOBS_BASE}/parameter/${paramId}/station/${stationId}/period/${safePeriod}/data.json`,
          method: 'GET',
          headers: SMHI_HEADERS,
        };
      }

      default:
        throw new Error(`Unknown SMHI toolId: ${req.toolId}`);
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): Record<string, unknown> {
    if (raw.status === 404) {
      return {
        error: {
          code: ProviderErrorCode.INPUT_REJECTED,
          message:
            req.toolId === 'smhi.observations'
              ? 'SMHI: station or parameter not found. ' +
                'Verify station_id (e.g. "97400" for Stockholm-Arlanda) and parameter_id (e.g. "1" for temperature).'
              : 'SMHI: coordinates may be out of range. ' +
                'snow1g covers most of Europe; fire_risk covers Sweden. ' +
                'Ensure longitude is decimal (e.g. 18.0686) and latitude is decimal (e.g. 59.3293).',
        },
      };
    }

    const p = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'smhi.forecast': {
        const d = raw.body as SmhiForecastResponse;
        const steps = (d.timeSeries ?? []).map((ts) => ({
          time: ts.time,
          data: ts.data,
        }));
        return {
          created_time: d.createdTime,
          reference_time: d.referenceTime,
          longitude: d.geometry?.coordinates?.[0]?.[0],
          latitude: d.geometry?.coordinates?.[0]?.[1],
          steps_count: steps.length,
          forecast: steps,
        };
      }

      case 'smhi.fire_risk': {
        const d = raw.body as SmhiFireResponse;
        const days = (d.timeSeries ?? []).map((ts) => {
          const params: Record<string, number | null> = {};
          for (const p of ts.parameters) {
            params[p.name] = p.values?.[0] ?? null;
          }
          return { valid_time: ts.validTime, ...params };
        });
        return {
          approved_time: d.approvedTime,
          reference_time: d.referenceTime,
          longitude: d.geometry?.coordinates?.[0]?.[0],
          latitude: d.geometry?.coordinates?.[0]?.[1],
          period: String(p.period ?? 'daily'),
          days_count: days.length,
          fire_risk: days,
        };
      }

      case 'smhi.warnings': {
        const warnings = raw.body as SmhiWarning[];
        if (!Array.isArray(warnings)) {
          return { warnings: [], count: 0, note: 'No active warnings' };
        }
        return {
          count: warnings.length,
          warnings: warnings.map((w) => ({
            id: w.id,
            event_en: w.event?.en ?? null,
            event_code: w.event?.code ?? null,
            normal_probability: w.normalProbability,
            areas: (w.warningAreas ?? []).map((a) => ({
              warning_level: a.warningLevel?.en ?? null,
              warning_level_code: a.warningLevel?.code ?? null,
              event_description: a.eventDescription?.en ?? null,
              approximate_start: a.approximateStart ?? null,
              approximate_end: a.approximateEnd ?? null,
              published: a.published ?? null,
              affected_areas: (a.affectedAreas ?? []).map((area) => ({
                name_en: area.en ?? null,
              })),
            })),
          })),
        };
      }

      case 'smhi.observations': {
        const d = raw.body as SmhiObservationResponse;
        return {
          station_id: String(p.station_id),
          station_name: d.station?.name ?? null,
          latitude: d.station?.latitude ?? null,
          longitude: d.station?.longitude ?? null,
          height_m: d.station?.height ?? null,
          parameter: {
            id: d.parameter?.key ?? null,
            name: d.parameter?.name ?? null,
            unit: d.parameter?.unit ?? null,
          },
          period: d.period?.key ?? null,
          period_summary: d.period?.summary ?? null,
          values: (d.value ?? []).map((v) => ({
            timestamp_ms: v.date,
            value: parseFloat(v.value),
            quality: v.quality,
          })),
          count: (d.value ?? []).length,
          updated_ms: d.updated,
        };
      }

      default:
        return { error: { code: ProviderErrorCode.INVALID_RESPONSE, message: 'Unknown tool' } };
    }
  }
}
