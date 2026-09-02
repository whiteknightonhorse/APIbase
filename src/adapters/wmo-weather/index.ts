import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { WmoCityInfo, WmoCityResponse } from './types';

const CITY_LIST_URL = 'https://worldweather.wmo.int/en/json/full_city_list.txt';
const cityJsonUrl = (cityId: number): string =>
  `https://worldweather.wmo.int/en/json/${cityId}_en.json`;
const HEADERS: Record<string, string> = {
  Accept: 'application/json, text/plain, */*',
  'User-Agent': '(apibase.pro, support@apibase.pro)',
};

/**
 * WMO World Weather Information Service adapter (UC-672).
 *
 * Official public weather portal run by the World Meteorological Organization,
 * aggregating forecasts and climate normals sourced directly from each
 * country's National Meteorological and Hydrological Service (NMHS).
 *
 * Endpoints (verified live before writing, no auth required):
 *   - en/json/full_city_list.txt   — full directory of ~2,600 cities
 *     (`"Country";"City";"CityId"`, one per line). Served as `text/plain`,
 *     NOT JSON — BaseAdapter's fetch path always `JSON.parse`s the body, so
 *     this tool cannot use it. Same class of problem as meteostat's gzip CSV
 *     dumps: `call()` is fully overridden here to fetch and parse raw text.
 *   - en/json/{cityId}_en.json     — per-city payload with both the 7-day
 *     official forecast AND 30-year monthly climate normals in one response.
 *     This endpoint IS JSON, but is fetched manually too (rather than mixing
 *     the overridden-call() and buildRequest()/parseResponse() paths in the
 *     same adapter) so all three tools share one fetch/error-handling path.
 *
 * Auth: none. No documented rate limits (public information service). See
 * UC-672 for reuse/attribution notes.
 */
export class WmoWeatherAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'wmo-weather', baseUrl: 'https://worldweather.wmo.int' });
  }

  // All logic lives in call() — buildRequest/parseResponse are required stubs
  // (city_search's upstream response is text/plain, not JSON; see class doc).
  protected buildRequest(_req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    throw new Error('WmoWeatherAdapter.buildRequest() should not be called directly');
  }

  protected parseResponse(raw: ProviderRawResponse): unknown {
    return raw.body;
  }

  override async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    const start = performance.now();
    const params = (req.params ?? {}) as Record<string, unknown>;

    switch (req.toolId) {
      case 'wmo-weather.city_search':
        return this.respond(await this.handleCitySearch(params, req), start);
      case 'wmo-weather.forecast':
        return this.respond(await this.handleCityJson(params, req, 'forecast'), start);
      case 'wmo-weather.climate_normals':
        return this.respond(await this.handleCityJson(params, req, 'climate'), start);
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

  // ---------------------------------------------------------------------------
  // Tool handlers
  // ---------------------------------------------------------------------------

  private async handleCitySearch(
    params: Record<string, unknown>,
    req: ProviderRequest,
  ): Promise<unknown> {
    const query = String(params.query ?? '').trim();
    if (!query) {
      throw this.invalidInput(req, 'query is required');
    }
    const limit = clampInt(params.limit, 1, 50, 20);

    const text = await this.fetchText(CITY_LIST_URL, req);
    const cities = parseCityList(text);
    const q = query.toLowerCase();
    const matches = cities.filter(
      (c) => c.city.toLowerCase().includes(q) || c.country.toLowerCase().includes(q),
    );

    return {
      query,
      total_matches: matches.length,
      cities: matches.slice(0, limit),
    };
  }

  private async handleCityJson(
    params: Record<string, unknown>,
    req: ProviderRequest,
    mode: 'forecast' | 'climate',
  ): Promise<unknown> {
    const cityId = Number(params.city_id);
    if (!Number.isInteger(cityId) || cityId <= 0) {
      throw this.invalidInput(
        req,
        'city_id must be a positive integer (see wmo-weather.city_search)',
      );
    }

    const data = (await this.fetchJson(cityJsonUrl(cityId), req)) as WmoCityResponse;
    if (!data || typeof data !== 'object' || !data.city) {
      throw this.badShape(req, 'city');
    }
    const c = data.city;

    const base = {
      city_id: c.cityId,
      city_name: c.cityName,
      country: c.member?.memName ?? null,
      latitude: numOrNull(c.cityLatitude),
      longitude: numOrNull(c.cityLongitude),
      is_capital: c.isCapital ?? false,
      station_name: c.stationName || null,
      timezone: naOrNull(c.timeZone),
      met_service: c.member?.orgName ?? null,
    };

    if (mode === 'forecast') {
      return {
        ...base,
        issue_date: naOrNull(c.forecast?.issueDate),
        days: (c.forecast?.forecastDay ?? []).map((d) => ({
          date: d.forecastDate,
          weather: d.weather || null,
          description: d.wxdesc || null,
          min_temp_c: numOrNull(d.minTemp),
          max_temp_c: numOrNull(d.maxTemp),
          min_temp_f: numOrNull(d.minTempF),
          max_temp_f: numOrNull(d.maxTempF),
          weather_icon: d.weatherIcon,
        })),
      };
    }

    return {
      ...base,
      normals_period_start: c.climate?.climatefromclino ?? null,
      rain_unit: c.climate?.rainunit ?? null,
      months: (c.climate?.climateMonth ?? []).map((m) => ({
        month: m.month,
        max_temp_c: numOrNull(m.maxTemp),
        min_temp_c: numOrNull(m.minTemp),
        mean_temp_c: numOrNull(m.meanTemp),
        max_temp_f: numOrNull(m.maxTempF),
        min_temp_f: numOrNull(m.minTempF),
        mean_temp_f: numOrNull(m.meanTempF),
        rain_days: numOrNull(m.raindays),
        rainfall_mm: numOrNull(m.rainfall),
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // Fetch helpers (mirrors BaseAdapter's own error classification — see
  // src/adapters/meteostat/index.ts for the same pattern on a non-JSON upstream)
  // ---------------------------------------------------------------------------

  private respond(body: unknown, start: number): ProviderRawResponse {
    return {
      status: 200,
      headers: {},
      body,
      durationMs: Math.round(performance.now() - start),
      byteLength: JSON.stringify(body).length,
    };
  }

  private async fetchText(url: string, req: ProviderRequest): Promise<string> {
    const response = await this.rawFetch(url, req);
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > this.maxResponseBytes) {
      throw {
        code: ProviderErrorCode.RESPONSE_TOO_LARGE,
        httpStatus: 502,
        message: `Provider response exceeded ${this.maxResponseBytes} byte limit`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }
    return text;
  }

  private async fetchJson(url: string, req: ProviderRequest): Promise<unknown> {
    const text = await this.fetchText(url, req);
    try {
      return JSON.parse(text);
    } catch {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'Provider returned invalid JSON',
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }
  }

  private async rawFetch(url: string, req: ProviderRequest): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: HEADERS,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const isTimeout =
        error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      throw {
        code: isTimeout ? ProviderErrorCode.TIMEOUT : ProviderErrorCode.UNAVAILABLE,
        httpStatus: isTimeout ? 504 : 502,
        message: isTimeout
          ? `Provider call timed out after ${this.timeoutMs}ms`
          : `Provider connection failed: ${error instanceof Error ? error.message : 'unknown'}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }

    if (response.status === 404) {
      throw this.invalidInput(req, 'City ID not found.');
    }
    if (response.status === 429) {
      throw {
        code: ProviderErrorCode.RATE_LIMIT,
        httpStatus: 429,
        message: 'WMO World Weather Information Service rate limit exceeded',
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }
    if (response.status >= 500) {
      throw {
        code: ProviderErrorCode.UNAVAILABLE,
        httpStatus: 502,
        message: `WMO World Weather Information Service returned ${response.status}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }
    if (response.status >= 400) {
      throw this.invalidInput(
        req,
        `WMO World Weather Information Service rejected the request (HTTP ${response.status}).`,
      );
    }
    return response;
  }

  private invalidInput(req: ProviderRequest, message: string): never {
    throw {
      code: ProviderErrorCode.INPUT_REJECTED,
      httpStatus: 422,
      message: `wmo-weather: ${message}`,
      provider: this.provider,
      toolId: req.toolId,
      durationMs: 0,
    };
  }

  private badShape(req: ProviderRequest, expectedKey: string): never {
    throw {
      code: ProviderErrorCode.INVALID_RESPONSE,
      httpStatus: 502,
      message: `WMO World Weather Information Service: expected response with ${expectedKey} key`,
      provider: this.provider,
      toolId: req.toolId,
      durationMs: 0,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parses `"Country";"City";"CityId"` lines (header row skipped). */
function parseCityList(text: string): WmoCityInfo[] {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const out: WmoCityInfo[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = (lines[i] ?? '').split(';').map((c) => c.trim().replace(/^"|"$/g, ''));
    const [country, city, cityIdStr] = cols;
    const cityId = Number(cityIdStr);
    if (!country || !city || !Number.isFinite(cityId)) continue;
    out.push({ country, city, cityId });
  }
  return out;
}

function numOrNull(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function naOrNull(v: string | null | undefined): string | null {
  if (!v || v === 'N/A') return null;
  return v;
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}
