import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  OpenMeteoAqCurrentResponse,
  OpenMeteoAqHourlyResponse,
  OpenMeteoAqPollenResponse,
  AqCurrentOutput,
  AqForecastOutput,
  AqHourlyRecord,
  AqPollenOutput,
  PollenRecord,
} from './types';

const BASE_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';

const CURRENT_VARS =
  'pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,' +
  'aerosol_optical_depth,dust,uv_index,uv_index_clear_sky,ammonia,european_aqi,us_aqi';

const FORECAST_DEFAULTS = 'pm10,pm2_5,nitrogen_dioxide,ozone,european_aqi,us_aqi';

const POLLEN_VARS =
  'alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen';

function n(v: unknown): number | null {
  return v !== undefined && v !== null && !isNaN(Number(v)) ? Number(v) : null;
}

/**
 * Open-Meteo Air Quality adapter (UC-555).
 *
 * Global air quality data — AQI, PM2.5/PM10, ozone, NO2, SO2, CO, UV, pollen.
 * Open-source, no auth, CC BY 4.0, unlimited. Based on Copernicus CAMS.
 */
export class OpenMeteoAqAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'openmeteoaq', baseUrl: BASE_URL });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const p = req.params as Record<string, unknown>;
    const lat = encodeURIComponent(String(p.latitude ?? ''));
    const lng = encodeURIComponent(String(p.longitude ?? ''));
    const tz = encodeURIComponent(String(p.timezone ?? 'UTC'));

    let url: string;

    switch (req.toolId) {
      case 'openmeteoaq.current': {
        url = `${BASE_URL}?latitude=${lat}&longitude=${lng}&current=${CURRENT_VARS}&timezone=${tz}`;
        break;
      }
      case 'openmeteoaq.forecast': {
        const days = Math.min(Math.max(Number(p.forecast_days ?? 3), 1), 7);
        const vars = encodeURIComponent(String(p.pollutants ?? FORECAST_DEFAULTS));
        url = `${BASE_URL}?latitude=${lat}&longitude=${lng}&hourly=${vars}&forecast_days=${days}&timezone=${tz}`;
        break;
      }
      case 'openmeteoaq.historical': {
        const start = encodeURIComponent(String(p.start_date ?? ''));
        const end = encodeURIComponent(String(p.end_date ?? ''));
        const vars = encodeURIComponent(String(p.pollutants ?? FORECAST_DEFAULTS));
        url = `${BASE_URL}?latitude=${lat}&longitude=${lng}&hourly=${vars}&start_date=${start}&end_date=${end}&timezone=${tz}`;
        break;
      }
      case 'openmeteoaq.pollen': {
        const days = Math.min(Math.max(Number(p.forecast_days ?? 3), 1), 7);
        url =
          `${BASE_URL}?latitude=${lat}&longitude=${lng}` +
          `&current=${POLLEN_VARS}&hourly=${POLLEN_VARS}&forecast_days=${days}&timezone=${tz}`;
        break;
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

    return { url, method: 'GET', headers: { Accept: 'application/json' } };
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const p = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'openmeteoaq.current':
        return this.parseCurrent(raw.body as OpenMeteoAqCurrentResponse);
      case 'openmeteoaq.forecast':
        return this.parseHourly(
          raw.body as OpenMeteoAqHourlyResponse,
          Number(p.forecast_days ?? 3),
        );
      case 'openmeteoaq.historical':
        return this.parseHourly(raw.body as OpenMeteoAqHourlyResponse, 0);
      case 'openmeteoaq.pollen':
        return this.parsePollen(
          raw.body as OpenMeteoAqPollenResponse,
          Number(p.forecast_days ?? 3),
        );
      default:
        return raw.body;
    }
  }

  private parseCurrent(body: OpenMeteoAqCurrentResponse): AqCurrentOutput {
    const c = body.current ?? {};
    return {
      latitude: body.latitude,
      longitude: body.longitude,
      timezone: body.timezone,
      elevation_m: body.elevation,
      observed_at: c.time ?? '',
      pm10_ug_m3: n(c.pm10),
      pm2_5_ug_m3: n(c.pm2_5),
      carbon_monoxide_ug_m3: n(c.carbon_monoxide),
      nitrogen_dioxide_ug_m3: n(c.nitrogen_dioxide),
      sulphur_dioxide_ug_m3: n(c.sulphur_dioxide),
      ozone_ug_m3: n(c.ozone),
      aerosol_optical_depth: n(c.aerosol_optical_depth),
      dust_ug_m3: n(c.dust),
      uv_index: n(c.uv_index),
      uv_index_clear_sky: n(c.uv_index_clear_sky),
      ammonia_ug_m3: n(c.ammonia),
      european_aqi: n(c.european_aqi),
      us_aqi: n(c.us_aqi),
      units: body.current_units ?? {},
    };
  }

  private parseHourly(body: OpenMeteoAqHourlyResponse, _forecastDays: number): AqForecastOutput {
    const hourly = body.hourly ?? {};
    const times: string[] = (hourly.time as unknown as string[]) ?? [];
    const pollutantKeys = Object.keys(hourly).filter((k) => k !== 'time');

    const records: AqHourlyRecord[] = times.map((t, i) => {
      const rec: AqHourlyRecord = { time: t };
      for (const key of pollutantKeys) {
        const arr = hourly[key] as (number | null)[];
        rec[key] = arr[i] ?? null;
      }
      return rec;
    });

    return {
      latitude: body.latitude,
      longitude: body.longitude,
      timezone: body.timezone,
      elevation_m: body.elevation,
      forecast_days: _forecastDays,
      pollutants: pollutantKeys,
      units: body.hourly_units ?? {},
      records,
    };
  }

  private parsePollen(body: OpenMeteoAqPollenResponse, _forecastDays: number): AqPollenOutput {
    const c = body.current ?? {};
    const hourly = body.hourly ?? {};
    const times: string[] = (hourly.time as unknown as string[]) ?? [];

    const hourlyRecords: PollenRecord[] = times.map((t, i) => ({
      time: t,
      alder_grains_m3: n((hourly.alder_pollen as (number | null)[])?.[i]),
      birch_grains_m3: n((hourly.birch_pollen as (number | null)[])?.[i]),
      grass_grains_m3: n((hourly.grass_pollen as (number | null)[])?.[i]),
      mugwort_grains_m3: n((hourly.mugwort_pollen as (number | null)[])?.[i]),
      olive_grains_m3: n((hourly.olive_pollen as (number | null)[])?.[i]),
      ragweed_grains_m3: n((hourly.ragweed_pollen as (number | null)[])?.[i]),
    }));

    return {
      latitude: body.latitude,
      longitude: body.longitude,
      timezone: body.timezone,
      elevation_m: body.elevation,
      current_time: c.time ?? '',
      current: {
        alder_grains_m3: n(c.alder_pollen),
        birch_grains_m3: n(c.birch_pollen),
        grass_grains_m3: n(c.grass_pollen),
        mugwort_grains_m3: n(c.mugwort_pollen),
        olive_grains_m3: n(c.olive_pollen),
        ragweed_grains_m3: n(c.ragweed_pollen),
      },
      forecast_hours: hourlyRecords.length,
      hourly: hourlyRecords,
    };
  }
}
