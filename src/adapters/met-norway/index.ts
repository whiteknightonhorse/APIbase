import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  MetForecastResponse,
  MetNowcastResponse,
  MetAlertsResponse,
  MetSunriseResponse,
} from './types';

const BASE = 'https://api.met.no/weatherapi';

/**
 * MET Norway (Norwegian Meteorological Institute) adapter (UC-515).
 *
 * No auth required. License: CC BY 4.0 + NLOD 2.0.
 * MANDATORY: User-Agent header with contact info (api.met.no ToS).
 *
 * Supported tools:
 *   metno.forecast  → locationforecast/2.0/compact  (9-day hourly, global)
 *   metno.nowcast   → nowcast/2.0/complete          (~2h precipitation, Norway/Scandinavia)
 *   metno.alerts    → metalerts/2.0/all.json        (weather alerts, Norway)
 *   metno.sunrise   → sunrise/3.0/sun or /moon      (sun/moon times, global)
 */
export class MetNorwayAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'met-norway', baseUrl: BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      'User-Agent': 'APIbase/1.0 (https://apibase.pro; infocitysms@gmail.com)',
      Accept: 'application/json',
    };

    switch (req.toolId) {
      case 'metno.forecast': {
        const lat = Number(params.lat);
        const lon = Number(params.lon);
        const qs = new URLSearchParams({ lat: String(lat), lon: String(lon) });
        if (params.altitude !== undefined) {
          qs.set('altitude', String(Number(params.altitude)));
        }
        return {
          url: `${BASE}/locationforecast/2.0/compact?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'metno.nowcast': {
        const lat = Number(params.lat);
        const lon = Number(params.lon);
        const qs = new URLSearchParams({ lat: String(lat), lon: String(lon) });
        return {
          url: `${BASE}/nowcast/2.0/complete?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'metno.alerts': {
        const qs = new URLSearchParams({ lang: String(params.lang ?? 'en') });
        if (params.event_type) {
          qs.set('types', String(params.event_type));
        }
        return {
          url: `${BASE}/metalerts/2.0/all.json?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'metno.sunrise': {
        const lat = Number(params.lat);
        const lon = Number(params.lon);
        const date = String(params.date);
        const body = String(params.body ?? 'sun');
        const qs = new URLSearchParams({ lat: String(lat), lon: String(lon), date });
        if (params.offset) {
          qs.set('offset', String(params.offset));
        }
        return {
          url: `${BASE}/sunrise/3.0/${body}?${qs.toString()}`,
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
    switch (req.toolId) {
      case 'metno.forecast': {
        const body = raw.body as MetForecastResponse;
        const ts = body.properties?.timeseries ?? [];
        const params = req.params as Record<string, unknown>;
        const hours = Math.min(Number(params.hours ?? 48), 216);
        const sliced = ts.slice(0, hours);
        return {
          lat: body.geometry?.coordinates?.[1],
          lon: body.geometry?.coordinates?.[0],
          altitude_m: body.geometry?.coordinates?.[2] ?? null,
          updated_at: body.properties?.meta?.updated_at,
          units: body.properties?.meta?.units,
          hours_returned: sliced.length,
          timeseries: sliced.map((entry) => ({
            time: entry.time,
            instant: entry.data.instant.details,
            next_1h: entry.data.next_1_hours ?? null,
            next_6h: entry.data.next_6_hours ?? null,
            next_12h: entry.data.next_12_hours ?? null,
          })),
        };
      }

      case 'metno.nowcast': {
        const body = raw.body as MetNowcastResponse;
        const ts = body.properties?.timeseries ?? [];
        return {
          lat: body.geometry?.coordinates?.[1],
          lon: body.geometry?.coordinates?.[0],
          updated_at: body.properties?.meta?.updated_at,
          radar_coverage: body.properties?.meta?.radar_coverage,
          units: body.properties?.meta?.units,
          entries: ts.map((entry) => ({
            time: entry.time,
            instant: entry.data.instant.details,
            next_1h: entry.data.next_1_hours ?? null,
          })),
        };
      }

      case 'metno.alerts': {
        const body = raw.body as MetAlertsResponse;
        const features = body.features ?? [];
        const params = req.params as Record<string, unknown>;
        const county = params.county as string | undefined;
        const filtered = county
          ? features.filter((f) => {
              const counties = f.properties?.county ?? [];
              return counties.some((c: string) => c.toLowerCase().includes(county.toLowerCase()));
            })
          : features;
        return {
          total: filtered.length,
          last_change: body.lastChange,
          lang: body.lang,
          alerts: filtered.map((f) => ({
            event: f.properties?.event,
            event_name: f.properties?.eventAwarenessName,
            awareness_level: f.properties?.awareness_level,
            awareness_type: f.properties?.awareness_type,
            severity: f.properties?.awarenessSeriousness,
            certainty: f.properties?.certainty,
            area: f.properties?.area,
            counties: f.properties?.county,
            description: f.properties?.description,
            consequences: f.properties?.consequences,
            instruction: f.properties?.instruction,
            interval: f.when?.interval ?? null,
          })),
        };
      }

      case 'metno.sunrise': {
        const body = raw.body as MetSunriseResponse;
        const props = body.properties;
        return {
          body: props.body,
          lat: body.geometry?.coordinates?.[1],
          lon: body.geometry?.coordinates?.[0],
          date_interval: body.when?.interval ?? null,
          sunrise: props.sunrise ?? null,
          sunset: props.sunset ?? null,
          solarnoon: props.solarnoon ?? null,
          solarmidnight: props.solarmidnight ?? null,
          moonrise: props.moonrise ?? null,
          moonset: props.moonset ?? null,
          high_moon: props.high_moon ?? null,
          low_moon: props.low_moon ?? null,
          moonphase: props.moonphase ?? null,
        };
      }

      default:
        return raw.body;
    }
  }
}
