import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { OwmCurrentResponse, OwmForecastResponse, ParsedLocation } from './types';

/**
 * OpenWeatherMap adapter (UC-005, §10.2 Level 1).
 *
 * Supported tools (Phase 1):
 *   weather.get_current  → GET /data/2.5/weather  (free tier)
 *   weather.get_forecast → GET /data/2.5/forecast (free tier, 5-day/3-hour)
 *
 * Auth: appid query parameter (§UC-005).
 * Location: city name (q), coordinates (lat/lon), or zip code.
 */
export class OpenWeatherMapAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'openweathermap',
      baseUrl: 'https://api.openweathermap.org',
    });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'weather.get_current':
        return this.buildCurrentRequest(params);
      case 'weather.get_forecast':
        return this.buildForecastRequest(params);
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
    const body = raw.body;

    switch (req.toolId) {
      case 'weather.get_current': {
        const data = body as OwmCurrentResponse;
        if (!data.main || !data.weather || !data.coord) {
          throw new Error('Missing required fields in current weather response');
        }
        return data;
      }
      case 'weather.get_forecast': {
        const data = body as OwmForecastResponse;
        if (!data.list || !data.city) {
          throw new Error('Missing required fields in forecast response');
        }
        return data;
      }
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildCurrentRequest(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const location = params.location as string;
    const units = (params.units as string) || 'metric';
    const parsed = parseLocation(location);
    const qs = new URLSearchParams({ appid: this.apiKey, units });
    appendLocationParams(qs, parsed);

    return {
      url: `${this.baseUrl}/data/2.5/weather?${qs.toString()}`,
      method: 'GET',
      headers: {},
    };
  }

  private buildForecastRequest(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const location = params.location as string;
    const units = (params.units as string) || 'metric';
    const parsed = parseLocation(location);
    const qs = new URLSearchParams({ appid: this.apiKey, units });
    appendLocationParams(qs, parsed);

    return {
      url: `${this.baseUrl}/data/2.5/forecast?${qs.toString()}`,
      method: 'GET',
      headers: {},
    };
  }
}

// ---------------------------------------------------------------------------
// Location parsing (UC-005 §location resolution)
// ---------------------------------------------------------------------------

const COORDS_RE = /^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/;
const ZIP_RE = /^(\d{4,10})\s*,\s*([A-Za-z]{2})$/;

/**
 * Parse agent-provided location string into structured form.
 *
 * Formats:
 *   "55.75,37.62"   → coords
 *   "10001, US"     → zip
 *   "Moscow"        → city
 *   "Paris, FR"     → city (2-letter suffix that's not all digits = country qualifier)
 */
export function parseLocation(location: string): ParsedLocation {
  const trimmed = location.trim();

  const coordsMatch = trimmed.match(COORDS_RE);
  if (coordsMatch) {
    const lat = parseFloat(coordsMatch[1]);
    const lon = parseFloat(coordsMatch[2]);
    if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      return { type: 'coords', lat, lon };
    }
  }

  const zipMatch = trimmed.match(ZIP_RE);
  if (zipMatch) {
    return { type: 'zip', zip: zipMatch[1], country: zipMatch[2].toUpperCase() };
  }

  return { type: 'city', query: trimmed };
}

function appendLocationParams(qs: URLSearchParams, loc: ParsedLocation): void {
  switch (loc.type) {
    case 'coords':
      qs.set('lat', loc.lat.toString());
      qs.set('lon', loc.lon.toString());
      break;
    case 'zip':
      qs.set('zip', `${loc.zip},${loc.country}`);
      break;
    case 'city':
      qs.set('q', loc.query);
      break;
  }
}
