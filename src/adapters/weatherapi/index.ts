import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  WALocation,
  WACurrent,
  WAForecastDay,
  WAAstro,
  CurrentOutput,
  ForecastOutput,
  AstronomyOutput,
  SearchOutput,
} from './types';

/**
 * WeatherAPI.com adapter (UC-243).
 *
 * Supported tools:
 *   weatherapi.current   → GET /current.json
 *   weatherapi.forecast  → GET /forecast.json
 *   weatherapi.astronomy → GET /astronomy.json
 *   weatherapi.search    → GET /search.json
 *
 * Auth: key= query param. Business trial 10M calls/month.
 * 100K+ stations globally. Commercial use OK.
 */
export class WeatherApiAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'weatherapi',
      baseUrl: 'https://api.weatherapi.com/v1',
    });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const q = encodeURIComponent(String(params.q ?? params.location ?? ''));

    switch (req.toolId) {
      case 'weatherapi.current':
        return {
          url: `${this.baseUrl}/current.json?key=${this.apiKey}&q=${q}&aqi=yes`,
          method: 'GET',
          headers: {},
        };

      case 'weatherapi.forecast': {
        const days = Math.min(Number(params.days) || 3, 3);
        return {
          url: `${this.baseUrl}/forecast.json?key=${this.apiKey}&q=${q}&days=${days}&aqi=no`,
          method: 'GET',
          headers: {},
        };
      }

      case 'weatherapi.astronomy': {
        const dt = params.date ? String(params.date) : new Date().toISOString().slice(0, 10);
        return {
          url: `${this.baseUrl}/astronomy.json?key=${this.apiKey}&q=${q}&dt=${dt}`,
          method: 'GET',
          headers: {},
        };
      }

      case 'weatherapi.search':
        return {
          url: `${this.baseUrl}/search.json?key=${this.apiKey}&q=${q}`,
          method: 'GET',
          headers: {},
        };

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
      case 'weatherapi.current':
        return this.parseCurrent(body);
      case 'weatherapi.forecast':
        return this.parseForecast(body);
      case 'weatherapi.astronomy':
        return this.parseAstronomy(body);
      case 'weatherapi.search':
        return this.parseSearch(body as unknown as Array<Record<string, unknown>>);
      default:
        return body;
    }
  }

  private parseCurrent(body: Record<string, unknown>): CurrentOutput {
    const loc = body.location as WALocation;
    const cur = body.current as WACurrent;
    return {
      location: loc?.name ?? '',
      country: loc?.country ?? '',
      region: loc?.region ?? '',
      lat: loc?.lat ?? 0,
      lon: loc?.lon ?? 0,
      timezone: loc?.tz_id ?? '',
      local_time: loc?.localtime ?? '',
      temp_c: cur?.temp_c ?? 0,
      temp_f: cur?.temp_f ?? 0,
      condition: cur?.condition?.text ?? '',
      wind_kph: cur?.wind_kph ?? 0,
      wind_dir: cur?.wind_dir ?? '',
      humidity: cur?.humidity ?? 0,
      pressure_mb: cur?.pressure_mb ?? 0,
      feelslike_c: cur?.feelslike_c ?? 0,
      visibility_km: cur?.vis_km ?? 0,
      uv_index: cur?.uv ?? 0,
      cloud_pct: cur?.cloud ?? 0,
    };
  }

  private parseForecast(body: Record<string, unknown>): ForecastOutput {
    const loc = body.location as WALocation;
    const forecast = body.forecast as Record<string, unknown>;
    const forecastDays = (forecast?.forecastday ?? []) as WAForecastDay[];
    return {
      location: loc?.name ?? '',
      country: loc?.country ?? '',
      days: forecastDays.map((fd) => ({
        date: fd.date,
        min_c: fd.day?.mintemp_c ?? 0,
        max_c: fd.day?.maxtemp_c ?? 0,
        avg_c: fd.day?.avgtemp_c ?? 0,
        condition: fd.day?.condition?.text ?? '',
        max_wind_kph: fd.day?.maxwind_kph ?? 0,
        precip_mm: fd.day?.totalprecip_mm ?? 0,
        humidity: fd.day?.avghumidity ?? 0,
        rain_chance: fd.day?.daily_chance_of_rain ?? 0,
        snow_chance: fd.day?.daily_chance_of_snow ?? 0,
        uv: fd.day?.uv ?? 0,
      })),
    };
  }

  private parseAstronomy(body: Record<string, unknown>): AstronomyOutput {
    const loc = body.location as WALocation;
    const astro = (body.astronomy as Record<string, unknown>)?.astro as WAAstro;
    return {
      location: loc?.name ?? '',
      date: loc?.localtime ? String(loc.localtime).slice(0, 10) : '',
      sunrise: astro?.sunrise ?? '',
      sunset: astro?.sunset ?? '',
      moonrise: astro?.moonrise ?? '',
      moonset: astro?.moonset ?? '',
      moon_phase: astro?.moon_phase ?? '',
      moon_illumination: astro?.moon_illumination ?? 0,
    };
  }

  private parseSearch(body: Array<Record<string, unknown>>): SearchOutput {
    const results = Array.isArray(body) ? body : [];
    return {
      results: results.map((r) => ({
        name: String(r.name ?? ''),
        region: String(r.region ?? ''),
        country: String(r.country ?? ''),
        lat: Number(r.lat ?? 0),
        lon: Number(r.lon ?? 0),
      })),
      count: results.length,
    };
  }
}
