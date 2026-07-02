import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  BrightSkyCurrentWeatherResponse,
  BrightSkyWeatherResponse,
  BrightSkyAlertsResponse,
  BrightSkySourcesResponse,
  BrightSkyWeatherHour,
} from './types';

const BRIGHTSKY_BASE = 'https://api.brightsky.dev';
const BRIGHTSKY_HEADERS: Record<string, string> = {
  Accept: 'application/json',
  'User-Agent': '(apibase.pro, support@apibase.pro)',
};

/**
 * Bright Sky DWD adapter (UC-570).
 *
 * Germany weather data sourced from DWD (Deutscher Wetterdienst).
 * No auth required — open, MIT-licensed.
 *
 * Tools:
 *   brightsky.current      → GET /current_weather?lat&lon
 *   brightsky.observations → GET /weather?lat&lon&date&last_date
 *   brightsky.alerts       → GET /alerts?lat&lon
 *   brightsky.stations     → GET /sources?lat&lon
 */
export class BrightSkyAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'brightsky',
      baseUrl: BRIGHTSKY_BASE,
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const p = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'brightsky.current': {
        const qs = new URLSearchParams({
          lat: String(p.latitude),
          lon: String(p.longitude),
          ...(p.units ? { units: String(p.units) } : {}),
        });
        return {
          url: `${BRIGHTSKY_BASE}/current_weather?${qs}`,
          method: 'GET',
          headers: BRIGHTSKY_HEADERS,
        };
      }
      case 'brightsky.observations': {
        const qs = new URLSearchParams({
          lat: String(p.latitude),
          lon: String(p.longitude),
          date: String(p.date),
          ...(p.last_date ? { last_date: String(p.last_date) } : {}),
          ...(p.units ? { units: String(p.units) } : {}),
        });
        return {
          url: `${BRIGHTSKY_BASE}/weather?${qs}`,
          method: 'GET',
          headers: BRIGHTSKY_HEADERS,
        };
      }
      case 'brightsky.alerts': {
        const qs = new URLSearchParams({
          lat: String(p.latitude),
          lon: String(p.longitude),
        });
        return { url: `${BRIGHTSKY_BASE}/alerts?${qs}`, method: 'GET', headers: BRIGHTSKY_HEADERS };
      }
      case 'brightsky.stations': {
        const qs = new URLSearchParams({
          lat: String(p.latitude),
          lon: String(p.longitude),
          ...(p.max_dist ? { max_dist: String(p.max_dist) } : {}),
        });
        return {
          url: `${BRIGHTSKY_BASE}/sources?${qs}`,
          method: 'GET',
          headers: BRIGHTSKY_HEADERS,
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
      case 'brightsky.current': {
        const data = body as unknown as BrightSkyCurrentWeatherResponse;
        const w = data.weather;
        const src = data.sources?.[0];
        return {
          station_name: src?.station_name ?? null,
          station_id: src?.dwd_station_id ?? null,
          lat: src?.lat ?? null,
          lon: src?.lon ?? null,
          observed_at: w.timestamp,
          condition: w.condition,
          icon: w.icon,
          temperature_c: w.temperature,
          dew_point_c: w.dew_point,
          humidity_pct: w.relative_humidity,
          pressure_hpa: w.pressure_msl,
          cloud_cover_pct: w.cloud_cover,
          visibility_m: w.visibility,
          wind_speed_kmh: w.wind_speed_10,
          wind_direction_deg: w.wind_direction_10,
          wind_gust_speed_kmh: w.wind_gust_speed_10,
          wind_gust_direction_deg: w.wind_gust_direction_10,
          precipitation_last_10min_mm: w.precipitation_10,
          precipitation_last_30min_mm: w.precipitation_30,
          precipitation_last_60min_mm: w.precipitation_60,
          sunshine_last_30min_min: w.solar_30,
          sunshine_last_60min_min: w.solar_60,
        };
      }

      case 'brightsky.observations': {
        const data = body as unknown as BrightSkyWeatherResponse;
        const src = data.sources?.[0];
        const obs: unknown[] = (data.weather ?? []).map((h: BrightSkyWeatherHour) => ({
          timestamp: h.timestamp,
          condition: h.condition,
          icon: h.icon,
          temperature_c: h.temperature,
          dew_point_c: h.dew_point,
          humidity_pct: h.relative_humidity,
          pressure_hpa: h.pressure_msl,
          cloud_cover_pct: h.cloud_cover,
          visibility_m: h.visibility,
          precipitation_mm: h.precipitation,
          sunshine_min: h.sunshine,
          wind_speed_kmh: h.wind_speed,
          wind_direction_deg: h.wind_direction,
          wind_gust_speed_kmh: h.wind_gust_speed,
          wind_gust_direction_deg: h.wind_gust_direction,
          precipitation_probability_pct: h.precipitation_probability,
          precipitation_probability_6h_pct: h.precipitation_probability_6h,
          solar_kwh_m2: h.solar,
        }));
        return {
          station_name: src?.station_name ?? null,
          station_id: src?.dwd_station_id ?? null,
          count: obs.length,
          observations: obs,
        };
      }

      case 'brightsky.alerts': {
        const data = body as unknown as BrightSkyAlertsResponse;
        return {
          location: data.location,
          alert_count: data.alerts.length,
          alerts: data.alerts.map((a) => ({
            id: a.alert_id,
            event: a.event_en,
            severity: a.severity,
            urgency: a.urgency,
            certainty: a.certainty,
            onset: a.onset,
            expires: a.expires,
            headline: a.headline_en,
            description: a.description_en,
            instruction: a.instruction_en,
          })),
        };
      }

      case 'brightsky.stations': {
        const data = body as unknown as BrightSkySourcesResponse;
        return {
          count: data.sources.length,
          stations: data.sources.map((s) => ({
            source_id: s.id,
            dwd_station_id: s.dwd_station_id,
            wmo_station_id: s.wmo_station_id,
            name: s.station_name,
            lat: s.lat,
            lon: s.lon,
            height_m: s.height,
            observation_type: s.observation_type,
            first_record: s.first_record,
            last_record: s.last_record,
            distance_m: s.distance ?? null,
          })),
        };
      }

      default:
        return body;
    }
  }
}
